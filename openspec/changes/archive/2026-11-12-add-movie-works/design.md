# Design

## Context

参见 `proposal.md`。当前媒体库能力只管理根路径、媒体库、来源和迁移任务：作品集媒体库对应媒体根路径下一个由系统托管的空目录，文件规范媒体库引用外部 Jellyfin 风格目录，两者都没有作品实体。现有服务端已具备 SQLite schema 版本、事务、删除密码、路径校验、视频 Range、图片/视频缩略图和后台迁移任务等基础设施。

本设计需要在不改动文件规范媒体库行为的前提下，为作品集媒体库增加「用户创建、上传复制、可选资源、播放」的作品层。

## Goals / Non-Goals

**Goals:**

- 作品是数据库实体，只能存在于作品集媒体库。
- 用户填写名称并选择本机视频，服务端复制视频到媒体库托管目录，源文件不变。
- 电影作品严格一个主视频；NFO、字幕、海报、背景图、花絮按需添加。
- 作品与资源路径在数据库中使用相对路径，兼容媒体根迁移。
- 删除作品不要求删除保护密码。
- 作品列表、详情、播放、资源管理和异常状态可用。

**Non-Goals:**

- 不扫描文件规范媒体库，不从任意目录自动发现作品。
- 不实现短视频集合与图片集合的创建和播放。
- 不实现刮削、在线元数据、远程图片下载或外部 API。
- 不实现浏览器 multipart 上传；本期使用本机文件路径 + 服务端复制。
- 不实现视频转码、外部播放器调用或字幕编辑。
- 不实现作品目录重命名；重命名只改数据库显示名称。

## Decisions

### D1. 作品作为数据库实体，而不是文件扫描结果

作品由用户创建，因此 `works` 表是事实来源；磁盘上的作品目录是受管理存储。列表、详情和资源关系从数据库读取，不扫描目录来发现作品。

备选：扫描作品集目录自动发现作品。会把用户创作与外部文件混在一起，无法可靠区分草稿、导入失败和手动放入的内容，也违背「作品由用户创建」的产品定义，不采用。

### D2. 作品只属于作品集媒体库

`works.library_id` 指向 `libraries.id`，服务层额外要求目标媒体库 `organization = 'collection'`。文件规范媒体库的 API 不返回作品入口，创建作品时返回 `unsupported-library-organization`。

作品类别独立于媒体库类型：`WorkKind` 为 `movie` / `short-video-collection` / `photo-collection`，本期只允许创建 `movie`。媒体库类型继续只做展示提示，不作为作品列表的过滤条件。

### D3. 作品目录与相对路径

作品目录位于作品集媒体库的托管目录下：

```text
<媒体根>/<媒体库目录>/<作品目录>/
  <作品目录>.<视频扩展名>
  movie.nfo
  poster.<图片扩展名>
  backdrop.<图片扩展名>
  <作品目录>.<语言>.srt
  extras/<花絮文件>
```

- 作品目录名由作品名称净化生成，冲突追加后缀；`works.folder` 保存目录名，`works.name` 保存用户显示名称。
- 主视频文件名使用作品目录名，扩展名沿用源文件；字幕命名也跟随作品目录名。
- 数据库只保存作品目录内的相对路径，绝对路径在运行时由媒体根 + 媒体库目录 + 作品目录拼出。
- 修改作品名称只更新 `works.name`，不移动目录，避免 Windows 文件占用和路径缓存失效。
- 作品目录名不展示给用户；作品详情可展示相对文件名用于排错。

### D4. 数据库 schema v2

新增两张表，schema 版本从 1 升到 2。

`works`：

- `id TEXT PRIMARY KEY`
- `library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE`
- `kind TEXT NOT NULL CHECK (kind IN ('movie','short-video-collection','photo-collection'))`
- `name TEXT NOT NULL`
- `folder TEXT NOT NULL`
- `folder_key TEXT NOT NULL`
- `year INTEGER`
- `metadata_json TEXT`
- `metadata_error TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `UNIQUE (library_id, folder_key)`

`work_assets`：

- `id TEXT PRIMARY KEY`
- `work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE`
- `role TEXT NOT NULL CHECK (role IN ('video','nfo','poster','backdrop','subtitle','extra'))`
- `kind TEXT NOT NULL CHECK (kind IN ('video','image','text'))`
- `relative_path TEXT NOT NULL`
- `original_name TEXT NOT NULL`
- `mime TEXT NOT NULL`
- `size INTEGER NOT NULL`
- `language TEXT`
- `label TEXT`
- `position INTEGER NOT NULL DEFAULT 0`
- `created_at TEXT NOT NULL`
- `UNIQUE (work_id, relative_path)`

补充约束：

- 电影作品最多一个 `role='video'`、一个 `nfo`、一个 `poster`、一个 `backdrop`，用 partial unique index 保证。
- `subtitle` 与 `extra` 不限制数量。
- NFO 上传成功后把解析结果写入 `works.metadata_json` 与 `works.year`；解析失败时把错误写入 `works.metadata_error`；移除 NFO 时全部清空。
- 媒体库删除通过外键级联清理作品和资源；作品目录由现有媒体库递归删除逻辑带走。

### D5. 复制与导入流程

主视频复制使用后台导入任务，避免大文件导致 HTTP 请求超时。

1. `POST /api/library/:libraryId/works/imports` 校验名称、媒体库与源视频，返回 `202 { importId }`。
2. 任务在作品集媒体库目录下创建隐藏临时目录 `.gallery-import-<uuid>`。
3. 使用流复制把源视频写入临时目录，并记录已复制字节数；源文件只读不写。
4. 复制完成后校验目标大小，原子重命名为最终作品目录。
5. 在事务中写入 `works` 与 `work_assets(video)`。
6. 任一步失败：删除临时目录与最终目录，任务标记失败；源文件不受影响。
7. 前端轮询 `GET /api/works/imports/:importId` 获取状态、进度与最终作品 ID。

服务启动时清理作品集媒体库目录下以 `.gallery-import-` 开头的残留临时目录。

备选：同步复制并在请求内完成。实现更简单，但大视频可能超时且无法展示进度；保存到磁盘的复制操作本身允许任务化，因此选择后台任务。

可选资源体积小，使用同步复制：先写临时文件，成功后原子重命名；替换类资源在新文件就绪后再删除旧文件。

### D6. 可选资源规则

- `nfo`：接受 `.nfo`，复制为 `movie.nfo`，替换旧 NFO 并重新解析。
- `poster`：接受图片扩展名，复制为 `poster.<ext>`，替换旧海报。
- `backdrop`：接受图片扩展名，复制为 `backdrop.<ext>`，替换旧背景图。
- `subtitle`：只接受 `.srt`，语言从文件名解析或由请求显式指定，复制为 `<作品目录>.<语言>.srt`；同语言重复上传视为替换。
- `extra`：接受视频或图片，复制到 `extras/<安全文件名>`；同名追加序号。花絮不参与主视频识别。
- 资源原始文件名保存在 `original_name`，磁盘文件名使用安全命名。
- 移除资源先删除数据库记录再删除文件；文件已不存在视为成功。替换失败保留旧资源。

### D7. NFO 解析

- 服务端新增 `fast-xml-parser`，仅解析本机 NFO 文本。
- 限制 NFO 大小为 2 MB，拒绝外部实体和网络访问。
- 解析字段：`title`、`originaltitle`、`sorttitle`、`year`、`premiered`、`plot`、`outline`、`tagline`、`runtime`、`rating`、`genre`、`director`、`writer`、`actor`、`studio`、`mpaa`、`uniqueid`。
- 不把 NFO 标题写入作品显示名称；NFO 标题只作为元数据。
- 解析失败时清空 `metadata_json` 与 `year`，保留 NFO 文件，详情返回 `metadata-error` 提示。
- 原始 NFO 以纯文本读取并返回，不在页面执行 HTML。

### D8. 字幕转换

- SRT → WebVTT 的转换放在 `packages/core`，作为纯函数并覆盖 BOM、CRLF、逗号时间戳、缺失序号、非法 cue 等测试。
- 服务端只读取数据库登记的字幕资源，按需转换并以 `text/vtt; charset=utf-8` 返回。
- 字幕语言从文件名后缀解析，例如 `zh`、`zh-CN`、`chs`、`chi`、`en`、`eng`、`ja`、`jpn`；无法识别时使用原始后缀或“默认字幕”。
- 转换失败返回 `subtitle-conversion-failed`，不影响主视频流。

### D9. 资源访问与播放

- 所有作品资源使用不可猜测的作品/资源 ID；服务端通过数据库解析实际路径，并再次校验路径位于对应作品目录内。
- 主视频端点复用现有 Range 解析逻辑，支持 `Accept-Ranges`、206、`Content-Range`、`Content-Length`。
- 海报、背景图通过现有 `sharp` 缩略图管线按宽度生成并缓存；主视频缩略图通过现有 FFmpeg 管线生成。
- 花絮视频/图片使用独立资源端点；图片缩略图复用缩略图服务。
- 资源读取前使用 `lstat` 拒绝符号链接和非普通文件。

### D10. 作品状态

状态在读取时计算，不写回数据库：

- `ok`：主视频与已登记资源都存在且可读。
- `partial`：主视频存在，但部分可选资源缺失或不可读。
- `missing`：主视频或作品目录缺失。
- `unreadable`：作品目录或资源不可读。
- `symlink`：作品目录或资源是符号链接。

列表至少校验主视频；详情校验全部已登记资源。异常不自动删除记录。

### D11. 删除

- 删除作品不校验删除保护密码。
- 先删除作品目录，再在事务中删除数据库记录；目录不存在视为已删除。
- 目录删除失败时保留记录并返回失败路径与原因，允许重试。
- 作品集媒体库删除沿用现有先删目录再删记录的逻辑，作品记录由外键级联清理。

### D12. 前端

- 作品列表路由：`/library/:libraryId/works`。
- 作品详情路由：`/library/:libraryId/works/:workId`。
- 作品集媒体库卡片增加“浏览作品”；文件规范媒体库不展示。
- 创建作品：名称 + 电影类别 + 本机视频路径选择；复用现有 `VideoPicker` 或抽出通用文件选择器。
- 详情页提供播放、字幕选择、NFO 元数据、海报/背景图、字幕列表、花絮网格、资源添加/替换/移除、重命名与删除。
- 大文件导入展示进度轮询；失败展示可读原因并允许重试。
- 任务完成后刷新列表并跳转到作品详情。

### D13. API 轮廓

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/library/:libraryId/works` | 作品列表，支持 `kind`、搜索、排序 |
| POST | `/api/library/:libraryId/works/imports` | 创建主视频导入任务 |
| GET | `/api/works/imports/:importId` | 查询导入进度 |
| GET | `/api/works/:workId` | 作品详情 |
| PATCH | `/api/works/:workId` | 修改显示名称 |
| POST | `/api/works/:workId/delete` | 删除作品，不要求密码 |
| POST | `/api/works/:workId/assets` | 添加/替换可选资源 |
| DELETE | `/api/works/:workId/assets/:assetId` | 移除可选资源 |
| GET | `/api/works/:workId/video` | 主视频，支持 Range |
| GET | `/api/works/:workId/thumbnail` | 主视频缩略图 |
| GET | `/api/works/:workId/poster` | 海报 |
| GET | `/api/works/:workId/backdrop` | 背景图 |
| GET | `/api/works/:workId/subtitles/:assetId` | WebVTT 字幕 |
| GET | `/api/works/:workId/assets/:assetId` | 花絮原文件 |
| GET | `/api/works/:workId/assets/:assetId/thumb` | 花絮缩略图 |
| GET | `/api/works/:workId/nfo` | 原始 NFO 文本 |

### D14. 测试策略

- `packages/core`：作品名称校验、字幕语言解析、SRT→VTT。
- `apps/server`：schema v1→v2 升级、作品仓储、复制任务成功/失败回滚、目录冲突、资源替换、删除、级联、迁移后路径、Range、NFO 解析、非法作品/资源 ID、符号链接。
- 测试使用临时目录与占位视频/文本文件，不依赖真实媒体文件。
- 前端以手工走查为主，覆盖创建、进度、详情、字幕、花絮和异常状态。

## Risks / Trade-offs

- **后台导入任务与数据库不一致** → 临时目录 + 原子重命名 + 成功后事务写入；启动清理残留目录。
- **大文件复制耗时长** → 后台任务与进度轮询；失败可重试。
- **数据库写成功但目录删除失败** → 删除时先删目录，失败保留记录，避免记录消失但文件残留。
- **媒体根迁移后作品失效** → 只保存相对路径；迁移复制作品集目录；增加迁移后作品可访问测试。
- **NFO 编码与格式差异** → 限制大小、UTF-8 读取、解析失败降级；不支持 GBK 自动识别，作为已知限制。
- **浏览器无法播放部分编码** → 不在本期转码；播放器展示明确错误，后续通过转码或外部播放器解决。
- **作品目录被外部修改** → 状态检测提示缺失/异常，不自动删除记录；不扫描未登记文件。
- **删除作品不需要密码** → 使用明确的二次确认与不可撤销提示；这是用户确认的产品选择。
- **显示名称与磁盘目录名不一致** → 重命名只改显示名，避免文件占用；详情展示目录相对路径用于排错。

## Migration Plan

1. 数据库启动时检测 `user_version = 1`，在事务中创建 `works`、`work_assets` 与索引，并升级到 2。
2. 旧数据无需回填；作品表初始为空。已有作品集目录中的未登记文件不会被自动导入。
3. 已有媒体库、来源、密码与迁移任务保持不变。
4. 升级前建议备份 `~/.gallery/gallery.db`；回滚到旧版本需要恢复备份，因为旧版本会拒绝高于自身支持的 schema。
5. 发布后先用手工临时目录验证创建、资源、播放、删除与迁移。

## Open Questions

无阻塞性未决问题。浏览器拖拽上传、短视频集合、图片集合、转码和刮削均作为后续能力处理。
