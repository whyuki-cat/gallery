# Gallery

本地媒体管理器：在本机浏览文件、批量重命名、无损裁剪视频。服务默认只监听 `127.0.0.1`，文件读写全部由本地服务完成。

## 功能

- **文件管理**：目录浏览、文件详情、图片/视频缩略图、批量删除。
- **重命名**：按规则批量重命名或单个重命名，支持预览、冲突检测与自动编号。
- **视频裁剪**：在时间轴上标记片段并拖动边界，支持逐段导出或合并导出；使用 FFmpeg 流复制，不重新编码。
- **媒体库管理**：配置媒体根路径，按「作品集」或「文件规范」登记媒体库；支持删除保护密码、作品集内容永久删除与根路径自动迁移。
- **主题**：跟随系统 / 浅色 / 深色，切换即时生效。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | Fastify 5 + TypeScript (Node 22) |
| 数据 | SQLite（`better-sqlite3`） |
| 前端 | React 19 + Vite 7 + Tailwind CSS 4 |
| 路由 | React Router 7 |
| 图标 | lucide-react |
| 包管理 | pnpm workspace |

## 开发

```bash
pnpm install
pnpm dev          # web: http://localhost:5173  server: http://127.0.0.1:5177
```

Vite 会把 `/api` 代理到后端，前端统一使用相对路径 `/api/...`。

## 构建与验证

```bash
pnpm build        # 前端产物 + 后端编译
pnpm start        # 单进程：http://127.0.0.1:5177
pnpm typecheck    # 全量类型检查
pnpm test         # 单元测试
```

生产模式下 `apps/server` 会托管 `apps/web/dist`，并处理 SPA history fallback。

## 目录结构

```text
gallery/
├── apps/
│   ├── server/            # Fastify API
│   └── web/               # React 前端
├── packages/
│   └── core/              # 前后端共享的纯逻辑
├── data/                  # 运行时缓存与临时文件（gitignore）
├── openspec/              # 规格与变更记录
├── pnpm-workspace.yaml
└── package.json
```

前端只通过 `/api/...` 访问服务端；可复用的校验、命名和片段规则放在 `packages/core`。

## 运行时数据与配置

- `~/.gallery/gallery.db`：用户级 SQLite 数据库，保存媒体根路径、媒体库、来源、删除密码与迁移任务；不写入仓库。
- `data/thumbs/`：图片与视频缩略图缓存。
- `data/tmp/`：视频合并导出时的临时分段，完成后清理。
- 服务端通过 `ffmpeg-static` 自带 FFmpeg；可用 `FFMPEG_PATH` 指向自定义二进制：

```powershell
$env:FFMPEG_PATH = '<ffmpeg 可执行文件路径>'
pnpm dev
```

```bash
FFMPEG_PATH=/path/to/ffmpeg pnpm dev
```
