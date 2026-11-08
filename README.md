# Gallery

本地媒体管理器。目前处于初始化阶段：已完成前后端骨架、设计系统与侧边导航，功能页面待实现。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | Fastify 5 + TypeScript (Node 22) |
| 前端 | React 19 + Vite 7 + Tailwind CSS 4 |
| 路由 | React Router 7 |
| 图标 | lucide-react |
| 包管理 | pnpm workspace |

## 目录结构

```
gallery/
├── apps/
│   ├── server/            # Fastify API
│   │   └── src/
│   │       ├── index.ts   # 启动入口
│   │       ├── app.ts     # 应用组装 / 生产环境托管前端
│   │       └── routes/    # 路由模块
│   └── web/               # React 前端
│       └── src/
│           ├── components/layout/   # AppShell / Sidebar
│           ├── lib/nav.ts           # 导航配置（单一数据源）
│           ├── pages/               # 页面
│           └── index.css            # 设计令牌（@theme）
├── pnpm-workspace.yaml
└── package.json
```

## 开发

```bash
pnpm install
pnpm dev          # web: http://localhost:5173  server: http://127.0.0.1:5177
```

Vite 会把 `/api` 代理到后端，所以前端始终用相对路径 `/api/...`。

## 构建与运行

```bash
pnpm build        # 前端产物 + 后端编译
pnpm start        # 单进程：http://127.0.0.1:5177
```

生产模式下 `apps/server` 会自动托管 `apps/web/dist`，并处理 SPA history fallback。

## 其他命令

```bash
pnpm typecheck    # 全量类型检查
```

## 文件系统接口

文件工具通过服务端访问本地磁盘，浏览器只负责渲染。接口位于 `/api/fs`：

| 接口 | 说明 |
| --- | --- |
| `GET /api/fs/roots` | 可用盘符、常用目录与缩略图能力 |
| `GET /api/fs/list?path=&hidden=` | 目录列表，只返回名称与类型 |
| `POST /api/fs/stats` | 批量读取大小与时间，单批最多 200 条 |
| `POST /api/fs/delete` | 删除当前目录中的选中文件或文件夹（文件夹递归删除），请求体为 `{ dir, names }` |
| `GET /api/fs/raw?path=` | 原文件流，支持 `Range` |
| `GET /api/fs/thumb?path=&w=` | 缩略图，带磁盘缓存 |

变更类请求（POST 等）必须携带 `x-gallery-client: 1` 请求头，用于拦截跨站提交。

运行时缓存目录位于仓库根目录：

- `data/thumbs/`：缩略图缓存，文件名是 `路径 + mtime + 大小 + 宽度` 的哈希

## 视频缩略图与 FFmpeg

服务端通过 `ffmpeg-static` 随包提供 FFmpeg 二进制，不依赖系统安装。`pnpm install` 会下载当前平台对应的版本；如果网络受限，或希望改用系统 ffmpeg，可以设置 `FFMPEG_PATH`：

```powershell
# Windows PowerShell
$env:FFMPEG_PATH = 'C:\ffmpeg\bin\ffmpeg.exe'
pnpm dev
```

```bash
# Linux / macOS
FFMPEG_PATH=/usr/bin/ffmpeg pnpm dev
```

图片缩略图由 `sharp` 生成，视频缩略图由 FFmpeg 截取第 1 秒的一帧，结果同样缓存在 `data/thumbs/`。`GET /api/fs/roots` 会返回 `capabilities.videoThumbnail`，前端据此决定是否请求视频缩略图。

`ffmpeg-static` 提供的是 GPL 构建，若对外分发安装包，需要确认许可合规。

## 重命名接口

| 接口 | 说明 |
| --- | --- |
| `POST /api/rename/apply` | 按规则重命名文件或文件夹，服务端重新计算并校验目标名 |
| `POST /api/rename/single` | 直接重命名单个文件或文件夹，请求体为 `{ dir, from, to }` |

`apply` 的请求体为 `{ dir, names, operations, strategy }`，`strategy` 取 `block | skip | auto-index`。

## 设计令牌

颜色与字体定义在 `apps/web/src/index.css` 的 `@theme` 中，新增颜色后可直接使用 `bg-*` / `text-*` / `border-*` 工具类。

浅色主题在 `html[data-theme='light']` 下覆盖同一批变量，因此组件无需写两套样式。交互遮罩统一使用 `hover` / `hover-strong` / `active` / `raised` / `scrim` 令牌，避免在浅色背景上失去层次。

## 主题

`设置 → 外观` 提供「跟随系统 / 浅色 / 深色」三种模式，选择结果保存在 `localStorage` 的 `gallery.theme` 键中，切换即时生效。

`apps/web/index.html` 中的内联脚本会在首次绘制前应用主题，避免刷新时出现深色闪烁；`apps/web/src/lib/theme.ts` 负责后续的系统主题监听与状态同步。

## 路线图

- [x] 项目骨架与侧边导航
- [ ] 工具：文件重命名
- [ ] 工具：视频裁剪
- [ ] 媒体库扫描与播放
