# Design

## Context

参见 `proposal.md` 的 Why。影响本次实现的现有条件：

- `/tools/trim` 当前仍是占位页，`App.tsx` 没有真实路由；侧边栏入口已经存在。
- 服务端已有 `ffmpeg-static`，但没有 `ffprobe`；缩略图模块已经封装了 FFmpeg 二进制路径与可用性探测。
- 现有文件系统层提供 `/api/fs/roots`、`/api/fs/list`、`/api/fs/raw`，并已有绝对路径校验、符号链接拒绝与回环地址限制。
- `/api/fs/roots` 已返回媒体能力描述，前端据此决定是否请求视频缩略图。
- 运行时产物统一落在已被忽略的 `data/` 目录，当前已有 `data/thumbs/`。
- 项目已有 `packages/core`，用于放置前后端共享的纯函数。

## Goals / Non-Goals

**Goals:**

- 用一次流复制完成单个片段导出，速度接近文件复制，不改变画质。
- 多个片段可以合并为一个文件，且所有片段来自同一源文件。
- 前端预览的命名、校验与后端执行使用同一份纯函数，避免规则漂移。
- 输出不覆盖用户已有文件，失败时留下可理解的错误信息。
- FFmpeg 缺失时只降级导出，不影响视频预览与标记。

**Non-Goals:**

- 不做重新编码、转码、滤镜、画质或码率设置。
- 不保留字幕、多音轨、章节或复杂元数据。
- 不做任务队列、后台导出、进度推送或取消。
- 不引入 `ffprobe`，不在服务端读取完整媒体元数据。
- 不支持自定义输出目录、跨目录输出或音频文件裁剪。
- 不改造现有 `features/rename` 的文件浏览与选择逻辑。

## Decisions

### D1. 第一版只做流复制，接受关键帧对齐

服务端只生成 `-c copy` 命令，不提供重新编码路径。

- 备选：默认重新编码以获得精确边界。实现更简单，也更容易让用户理解，但会显著变慢并损失画质，与“参考 LosslessCut”的预期冲突。
- 备选：同时提供无损与精确两个模式。会额外引入编码参数、输出格式与耗时差异，超出第一版范围。
- 结论：只做无损。UI 明确提示切割点会对齐到最近关键帧；精确裁剪留作后续能力。

实测：对关键帧间隔 1 秒的测试视频裁 `1.3s` 到 `2.3s`，`-c copy` 输出约 `1.44s`，重新编码输出 `1.00s`。因此必须在界面上说明边界可能偏移，不能把无损切割描述为逐帧精确。

### D2. 视频时长由浏览器提供，不引入 ffprobe

页面使用 `<video>` 的 `loadedmetadata` 读取 `duration`，标记与校验都基于该值。

- 备选：增加 `ffprobe-static`。能获得更完整的媒体信息，但会新增一个较大的二进制依赖，且第一版只需要时长。
- 备选：解析 `ffmpeg -i` 的 stderr。可行但脆弱，且对第一版收益有限。
- 结论：客户端提供时长，服务端只校验数值合法性，不依赖时长上限。即使客户端给出超出实际长度的结束时间，FFmpeg 也会在文件末尾自然结束。

限制：浏览器无法播放的格式（常见于部分 AVI、WMV、FLV）无法在页面内标记。第一版直接提示不支持预览，不提供手动时间输入。

### D3. 输出固定在源目录，名称由服务端生成

请求只包含源文件路径、导出种类与片段，不包含输出目录或目标文件名。服务端读取源目录后生成不冲突的名称。

- 备选：允许客户端选择输出目录。需要额外的路径校验、目录创建与权限处理，超出第一版范围。
- 备选：直接覆盖同名文件。会破坏用户已有文件，不可接受。
- 结论：输出目录 = 源文件目录；重名时追加 `(1)`、`(2)`，大小写不敏感比较，适配 Windows。

命名规则：

```text
逐段：<原名>-<起点时间>-<终点时间>.<扩展名>
合并：<原名>.trimmed.<扩展名>
重名：<原名>-<起点时间>-<终点时间> (1).<扩展名>
```

- 时间格式为 `HH.MM.SS.mmm`，使用源视频时间轴，小时、分钟、秒各补零到 2 位，毫秒补零到 3 位。例如 `demo-00.00.01.200-00.00.04.500.mp4`。
- 文件名使用点分隔时分秒，避免 Windows 不允许的冒号，同时保持可读与可按时间排序。
- 同一批次内若两个片段产生相同名称，第二个及后续名称继续追加 `(1)`、`(2)`，确保本次输出互不覆盖。
- 无损模式沿用源扩展名。若源扩展名与流复制输出不兼容，由 FFmpeg 报错，服务端返回中文错误，不做自动换容器。

### D4. 逐段直接导出，合并使用临时分段 + concat demuxer

```text
separate:
  segment 1 --> ffmpeg -c copy --> demo-00.00.01.200-00.00.04.500.mp4
  segment 2 --> ffmpeg -c copy --> demo-00.00.10.000-00.00.12.000.mp4

merged:
  segment 1 --> temp/0001.mp4
  segment 2 --> temp/0002.mp4
        |
        v
  concat.txt (file '.../0001.mp4' ...)
        |
        v
  ffmpeg -f concat -safe 0 -i concat.txt -c copy --> demo.trimmed.mp4
        |
        v
  清理 temp/
```

- 备选：用 `filter_complex concat` 一次完成。需要重新编码或至少重新封装，参数复杂，且对多段输入不如临时文件直观。
- 备选：让前端逐个调用导出接口，再由前端触发合并。增加往返次数与中间状态，且合并仍需要服务端知道临时文件位置。
- 结论：合并时服务端内部完成临时分段与 concat，成功后清理；失败时在 `finally` 中清理，避免残留。

所有分段来自同一源文件，编码参数一致，因此 concat demuxer 可以稳定按流复制合并。Windows 路径在 concat 列表中统一转为 `/`，并转义单引号。

实测中，合并后的 MP4 在解码到 null 时可能打印非单调 DTS 警告，但浏览器可以完整播放到结尾；如果后续遇到播放器兼容问题，再考虑调整时间戳或改用重新封装。

### D5. 单接口、两种导出种类

```http
POST /api/trim/export
x-gallery-client: 1
```

```json
{
  "path": "<源视频绝对路径>",
  "output": "separate",
  "segments": [
    { "start": 1.2, "end": 4.5 },
    { "start": 10.0, "end": 12.0 }
  ]
}
```

`output` 取 `separate | merged`。返回实际输出与失败项：

```json
{
  "outputs": [
    {
      "name": "demo-00.00.01.200-00.00.04.500.mp4",
      "path": "<输出绝对路径>",
      "size": 123456
    }
  ],
  "failed": [{ "index": 2, "message": "..." }]
}
```

- 逐段导出按片段顺序执行，单项失败不阻塞其他项，最终同时返回成功与失败。
- 合并导出任一分段失败即中止，返回错误并清理临时文件。
- 不提供进度接口；无损复制通常很快，按钮保持 loading 状态即可。

### D6. 共享纯函数放在 `packages/core`

新增 `packages/core/src/trim/`：

```ts
export interface TrimSegment {
  start: number
  end: number
}

export type TrimExportKind = 'separate' | 'merged'

export function validateSegments(segments: unknown): TrimIssue[]
export function sortSegments(segments: TrimSegment[]): TrimSegment[]
export function planTrimOutputs(input: {
  fileName: string
  kind: TrimExportKind
  segments: TrimSegment[]
  existingNames: Iterable<string>
}): { names: string[] }
export function formatTimecode(seconds: number): string
export function formatFileTime(seconds: number): string
export function findOverlaps(segments: TrimSegment[]): Array<[number, number]>
```

- 前端用于即时提示、输出预览与重叠提示。
- 服务端用于执行前的最终校验与命名，避免“预览一套、执行另一套”。
- 这些函数保持零 I/O、无 Node 或浏览器 API 依赖。
- `formatTimecode` 用于界面展示：1 小时以内使用 `mm:ss.SSS`，超出后使用 `hh:mm:ss.SSS`。
- `formatFileTime` 用于文件名：固定输出 `HH.MM.SS.mmm`，确保补零、可读且不含 Windows 非法字符。
- `planTrimOutputs` 根据每个片段的起止时间生成逐段名称，并在批次内与目录中已有名称冲突时追加序号；合并导出只生成一个 `<原名>.trimmed.<扩展名>`。

### D7. 前端结构：自定义播放控件 + 独立时间轴

- 视频不使用原生 `controls`，改为页面内的播放/暂停、前后 1 秒与时间码控件，视频画面按原始比例铺满可用区域；点击画面或按空格可切换播放。
- 时间轴只负责定位：点击或拖动都只移动播放头，不自动创建片段或草稿。
- 片段边界只由「设为起点 / 设为终点」按钮或 `I` / `O` 快捷键按当前播放头显式设置，避免拖动预览时误建片段。
- 右侧片段列表按时间排序，点击行跳转到片段起点，删除后立即更新。
- 视频选择使用轻量弹窗，复用 `/api/fs/roots` 与 `/api/fs/list`，只展示文件夹与视频文件；不改造现有重命名页面的组件。
- 页面支持 `?path=` 深链，便于后续从文件浏览器跳转过来。

状态分层：

- 当前视频、片段、草稿起点：组件内存状态，切换视频即清空。
- 导出状态：组件内存状态，请求期间禁用按钮。
- 不持久化片段草稿；刷新即丢失，避免用户误以为已保存。

### D8. 抽出 FFmpeg 辅助模块

新增 `apps/server/src/lib/ffmpeg.ts`，从 `thumbs.ts` 移出：

- 二进制路径解析（`FFMPEG_PATH` 优先，其次 `ffmpeg-static`）；
- `hasFfmpeg()` 能力探测；
- `runFfmpeg(args)` 统一 `execFile` 调用、stderr 捕获与错误信息提取。

`thumbs.ts` 改为从该模块导入，避免两份路径与探测逻辑。`/api/fs/roots` 的 `capabilities` 增加 `ffmpeg: boolean`，保留现有 `videoThumbnail`。

### D9. 安全边界复用现有文件系统层

- `resolveUserPath` 校验绝对路径、NUL 字符与允许范围。
- `lstat` 后拒绝符号链接与非普通文件。
- 视频扩展名使用现有 `isVideoPath` 白名单。
- 输出名称由服务端根据源文件名生成，请求中的额外字段一律忽略。
- 变更请求继续要求 `x-gallery-client: 1`；服务仍只监听 `127.0.0.1`。
- `execFile` 使用参数数组，不拼接 shell 命令。

### D10. 测试策略

- `packages/core`：片段校验、排序、时间格式化、输出命名、补零、重名追加、重叠检测。
- `apps/server`：非法路径、非视频、符号链接、空片段、非法时间、超过 100 段、缺少客户端头。
- 集成测试：用 FFmpeg 生成一个短测试视频，导出两段并合并，断言输出文件存在且非空；FFmpeg 不可用时跳过。
- 前端不做组件级测试，关键逻辑由 core 覆盖；页面通过类型检查与手工验证。

## Risks / Trade-offs

| 风险 | 处理 |
|---|---|
| 无损切割边界对齐关键帧，用户以为不准 | UI 明确提示；输出可能比标记区间略长或略短 |
| 浏览器无法播放某些容器 | 提示不支持预览；第一版不提供手动时间输入 |
| 合并依赖所有分段参数一致 | 只允许同一源文件的分段；合并前逐段流复制，参数天然一致 |
| 合并后的 MP4 可能出现非单调 DTS 警告 | 浏览器实测可完整播放；若后续遇到播放器兼容问题，再调整时间戳或重新封装 |
| 临时分段占用双倍磁盘 | 成功失败都在 `finally` 清理；`data/tmp/` 可手动清空 |
| 输出名称在计划后、创建前被外部占用 | 使用 `-n` 不覆盖；失败项返回中文原因，用户可重试 |
| 源文件被占用或导出中断 | 删除失败产生的部分输出；返回明确错误 |
| Windows concat 路径转义 | 统一 `/`、转义单引号、`-safe 0` |
| 逐段导出部分失败 | 保留成功项，返回失败索引与原因，不整体回滚 |
| 超长视频导出耗时 | 流复制通常很快；第一版不提供进度，保持 loading 状态 |
| FFmpeg 缺失 | 能力探测后禁用导出并提示，不影响预览与标记 |

## Migration Plan

纯新增，无数据迁移：

1. `packages/core` 增加 `trim` 模块并导出。
2. 服务端抽出 `ffmpeg.ts`，新增 `trim` 服务与路由，在 `app.ts` 注册 `/api/trim`。
3. `/api/fs/roots` 增加 `capabilities.ffmpeg`，现有字段保持不变。
4. 前端新增 `TrimPage` 与 `features/trim`，在 `App.tsx` 注册 `/tools/trim`，替换占位页。
5. `data/tmp/` 首次导出时创建，已在 `.gitignore` 覆盖范围内。
6. README 补充接口、临时目录、能力字段与路线图。

回滚方式：移除新增路由、`trim` 服务与页面，`/tools/trim` 恢复为占位页；`packages/core` 的 `trim` 模块可直接删除，不影响既有重命名与文件浏览功能。`data/tmp/` 可整体删除。

## Open Questions

- 后续是否需要“精确裁剪”模式（重新编码）以支持逐帧准确边界。
- 后续是否需要为浏览器无法播放的格式提供手动时间输入。
- 后续是否需要把临时分段与合并改为任务式执行，以支持超长视频的进度与取消。
