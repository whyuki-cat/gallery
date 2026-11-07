# Design

## Context

参见 `proposal.md` 的 Why。影响本次实现的现有条件：

- 前端是纯 SPA，运行在浏览器沙箱里，无法读取任意本地路径，也无法原地改名。
- 后端是 Fastify，监听 `127.0.0.1`，是唯一持有磁盘权限的一侧。
- 当前 `apps/server` 只有 `/api/health`，`apps/web` 的 `/tools/rename` 是占位页。
- 本机未安装 ffmpeg / ffprobe，媒体相关能力必须可缺失。
- 还没有数据库；运行时产物统一落在已被忽略的 `data/` 目录。
- 仓库是 pnpm workspace，目前只声明了 `apps/*`，没有共享包。

## Goals / Non-Goals

**Goals:**

- 文件浏览与重命名在前后端之间有一条清晰、可测试的边界。
- 预览与执行使用同一份规则实现，避免"预览是一套、执行是另一套"。
- 大目录（约一万项）下首屏可交互，不出现整目录阻塞。
- 改名失败可回滚，成功后可按记录撤销。
- 媒体能力缺失时只降级，不影响核心流程。

**Non-Goals:**

- 不做文件内容编辑、移动、复制、删除。
- 不做跨目录操作与子目录批量递归。
- 不引入数据库，除非撤销记录复杂到 JSONL 无法承载。
- 不做鉴权体系；安全边界依赖回环地址与来源校验。

## Decisions

### D1. 目录浏览放在服务端，而不是浏览器文件 API

后端提供目录枚举，前端只负责渲染与导航。

- 备选：File System Access API。能原地改名，但浏览器拿不到可交给后端的真实路径，后续媒体库扫描无法复用，还要处理授权过期与仅 Chromium 可用。
- 备选：Tauri/Electron 原生对话框。等于更换应用形态，与"浏览器访问本地常驻服务"冲突。
- 结论：服务端浏览，与 Jellyfin/Emby 同类形态一致，且文件系统访问层可被后续媒体库复用。

### D2. 规则引擎放进独立工作区包 `packages/core`

纯函数、零 I/O、零 Node 依赖，前端与后端共同依赖。

- 备选：只在服务端计算。每次按键都要往返 HTTP，本地虽快，但输入联想会明显发涩，且预览状态难以做防抖。
- 备选：前后端各写一份。逻辑必然漂移，冲突检测尤其容易不一致。
- 结论：`packages/core` 提供 `applyRules`、`validateTargets` 与共享类型。前端用于即时预览，后端用于执行前重算。`pnpm-workspace.yaml` 需要新增 `packages/*`。

### D3. 规则表示为有序操作数组，按顺序 fold

```ts
type RenameOp =
  | { type: 'replace'; find: string; with: string; regex?: boolean; caseSensitive?: boolean }
  | { type: 'remove'; find: string; regex?: boolean }
  | { type: 'affix'; side: 'prefix' | 'suffix'; text: string }
  | { type: 'case'; mode: 'lower' | 'upper' | 'title' }
  | { type: 'sequence'; start: number; step: number; pad: number; side: 'prefix' | 'suffix' }
  | { type: 'template'; pattern: string }
  | { type: 'extension'; mode: 'keep' | 'lower' | 'custom'; value?: string }
```

求值签名保持纯粹：`(fileName, index, context, ops) => newName`，`index` 来自当前排序后的选中顺序，`context` 提供父目录、大小、日期等模板变量。

- 备选：单一模板字符串。表达力不足，做不到"先正则清洗再编号"这类组合。
- 备选：可执行脚本。安全与可测试性都差。
- 结论：显式操作数组，序列化即状态，便于持久化预设与单测。

### D4. 模板变量用受限占位符，不做字符串求值

只识别白名单变量 `{name}` `{ext}` `{index}` `{date}` `{parent}` `{size}`。未知变量保留原文并产生一条 `unknown-variable` 问题。

- 备选：把模板当 JS 模板字符串执行。存在注入面，且无法在 `packages/core` 里保持零依赖。
- 结论：白名单替换，可预测、可校验。

### D5. 校验集中在 `validateTargets`，执行前服务端重算

前端预览与服务端执行调用同一个校验器。`POST /api/rename/apply` 接收"目录 + 选中文件名 + 规则 + 冲突策略"，由服务端重新求值，**不接受客户端提交的目标名**。

- 原因：预览与执行之间存在时间窗，目录可能变化；同时避免客户端构造任意目标路径。
- 结果：若重算结果与预览不一致，服务端按最新状态拒绝或调整，并返回逐项原因。

### D6. 两阶段改名，仅在必要时启用

先检测是否需要中间名：当任一目标名（大小写不敏感）也出现在源文件名集合中时，说明存在交换、环或仅大小写变更，必须先改临时名。

```
需要中间名？
  any target in sources (case-insensitive)
        |
   +----+----+
   |         |
  yes        no
   |         |
phase1: 源 -> .gallery-tmp-<opId>-<n>
phase2: tmp -> 目标
   |         |
   +----+----+
        |
   失败则反向回滚
```

- 备选：一律两阶段。实现简单但改名次数翻倍，且失败窗口更大。
- 备选：只处理交换。会漏掉 `a→b, b→c` 这类链式依赖。
- 结论：按"目标是否与源集合相交"判断，条件触发。

### D7. 撤销记录用 append-only JSONL

每次成功执行追加一行：`{ id, at, dir, pairs: [{ from, to }], status }`，写入 `data/rename-log/<date>.jsonl`。撤销读取最后一条 `status: applied` 的记录，按反向映射执行。

- 备选：SQLite。为一张日志表引入 ORM 与迁移，收益不足。
- 备选：仅内存。重启即丢，和"可撤销"的预期不符。
- 结论：JSONL 足够，且天然可审计。日志需要按天分文件，避免单文件无限增长。

### D8. 元数据按可见范围补取

`GET /api/fs/list` 只返回 `name` 与 `type`（来自 `readdir` 的 dirent），不逐个 `stat`。前端对当前可见行发送一次批量 `POST /api/fs/stats`（每批上限约 200 条），失败项单独标记。

- 原因：一万次 `stat` 会让首屏卡住数百毫秒到数秒。
- 约束：滚动时必须做请求合并与去重，避免重复拉取同一路径。

### D9. 原文件与缩略图分离

- `GET /api/fs/raw?path=` 直接流式返回文件内容，支持 `Range`。它同时是将来视频播放的入口，所以现在就按可复用方式实现。
- `GET /api/fs/thumb?path=&w=` 只在能力可用时返回缩略图；图片可直接缩放，视频需要 ffmpeg。缓存键为 `hash(path + mtime + size + width)`，落盘到 `data/thumbs/`。
- 启动时探测 ffmpeg，缺失则在能力描述里标记不可用，前端据此隐藏入口。

### D10. 安全边界收敛到来源校验与路径规范化

- 只监听 `127.0.0.1`（已有）。
- CORS 从当前的 `origin: true` 收紧为开发态白名单；生产态同源。
- 变更类请求要求自定义请求头（如 `X-Gallery-Client`），借助预检拦截跨站表单提交。
- 路径处理：拒绝非绝对路径与含 NUL 的输入；`path.resolve` 后使用；不跟随符号链接（`lstat` + 跳过）。

### D11. 前端状态分层

- 当前目录：作为 URL query（`?path=`），刷新、前进、后退都可恢复。
- 选择集、滚动位置：组件内状态，切换目录即清空。
- 视图模式、排序偏好：localStorage，和侧边栏折叠保持同一套持久化习惯。
- 重命名草稿：仅内存，关闭面板即丢弃，避免用户误以为已保存。

### D12. 测试策略

`packages/core` 用 Vitest 覆盖：规则链顺序、序列编号、模板变量、非法字符、保留名、重复目标、大小写冲突、交换检测。文件系统层不做全量单测，避免依赖真实磁盘；用少量临时目录集成测试验证两阶段改名与回滚。

## Risks / Trade-offs

| 风险 | 处理 |
|---|---|
| 一万文件目录的 `stat` 成本 | 只对可见行批量补取，请求去重，失败项单独占位 |
| 预览与执行之间目录被外部改动 | 服务端执行前重新枚举并重算，冲突即拒绝 |
| 文件被其他进程占用导致 `EBUSY` | 逐项捕获，回滚已完成项，报告失败原因 |
| Windows 保留名、尾随点空格、超长路径 | 校验器前置拦截；超长路径在改名时捕获并单独报告 |
| 仅大小写改名在大小写不敏感文件系统上互相覆盖 | 归入"需要中间名"分支 |
| 撤销记录无限增长 | 按天分文件；保留策略后续再加 |
| 本机无 ffmpeg | 能力探测后降级，详情与缩略图隐藏相关字段，不阻塞重命名 |
| 恶意网页跨站调用本地服务 | 收紧 CORS、校验来源、变更请求要求自定义头 |
| 共享包引入 workspace 配置复杂度 | 只加一个 `packages/core`，不预设更多包 |

## Migration Plan

纯新增，无数据迁移：

1. `pnpm-workspace.yaml` 增加 `packages/*`，新建 `packages/core` 并被两端引用。
2. 后端注册新路由，占位页替换为真实页面；老路由 `/api/health` 不变。
3. 运行时目录 `data/rename-log`、`data/thumbs` 首次使用时创建，已在 `.gitignore` 覆盖范围内。

回滚方式：移除新增路由与页面组件，`/tools/rename` 恢复为占位页；`packages/core` 可直接删除，不影响既有功能。

## Open Questions

- 缩略图缓存的容量上限与清理策略（可在实现缩略图时再定，不影响规格与任务拆分）。
- 规则预设是否需要跨设备同步（当前明确为本地持久化，后续再说）。
