# Design

## Context

参见 `proposal.md` 的 Why。影响实现方式的现有条件：

- `packages/core` 是纯函数共享包，不依赖 Node 与浏览器 API；`apps/web` 与 `apps/server` 都依赖它。
- `apps/server` 是唯一持有磁盘权限的一侧，已有 `resolveUserPath`、`isInside`、`assertNotSymbolicLink` 与统一的错误处理。
- `apps/web` 是 SPA，只能通过 `/api/...` 访问本地服务；当前 `/library` 在 `lib/nav.ts` 中标记为禁用占位页。
- 变更类请求已统一要求 `x-gallery-client: 1`，服务只监听 `127.0.0.1`。
- 项目当前没有数据库，运行时缓存写在仓库 `data/`；本次数据库属于用户级数据，不能写进仓库。
- 文件浏览页已具备盘符、常用目录与目录枚举接口，可复用于路径选择。
- 当前环境 Node `v22.23.4`；`node:sqlite` 仍标记 experimental，因此选择成熟的 `better-sqlite3`。

## Goals / Non-Goals

**Goals:**

- 媒体根路径、媒体库、来源、密码与迁移任务有唯一、事务安全的持久化位置。
- 两种组织形式在数据模型与磁盘语义上边界清晰，避免后续扫描器面对歧义。
- 高风险操作（作品集删除、根路径迁移）有明确授权、可恢复流程与失败报告。
- 作品集底层目录对用户不可见，显示名称与存储位置解耦。
- 为后续扫描、索引与播放留出扩展点，但本次不提前实现。

**Non-Goals:**

- 不做目录扫描、索引、元数据抓取、封面生成与播放。
- 不实现作品集实体、跨库分组或合集关系。
- 不移动、复制或删除文件规范媒体库的来源文件。
- 不实现 Jellyfin 服务端 API 对接；「兼容 Jellyfin」仅指目录组织与命名约定。
- 不实现多实例并发访问同一个数据库，也不提供数据库在线备份 UI。
- 不为根路径迁移做同盘 `rename` 优化；本次统一使用复制以避免切换前丢失旧数据。

## Decisions

### D1. 组织形式与类型使用可扩展的字符串枚举

```ts
type LibraryOrganization = 'collection' | 'convention'
type LibraryType = 'movie' | 'series' | 'photo'

interface CollectionLibrary {
  organization: 'collection'
  // folder 只存在于服务端与数据库，不进入公开 API
}

interface ConventionLibrary {
  organization: 'convention'
  convention: 'jellyfin'
  sources: string[]
}
```

- `collection` 对应「作品集」：一个媒体库 = 媒体根路径下由系统托管的一个目录。
- `convention` 对应「文件规范」：一个媒体库 = 一个或多个来源目录，当前约定为 Jellyfin。
- `convention` 字段为将来支持其他规范（如 Emby/Plex）预留；本次固定为 `jellyfin`，前端不暴露切换入口。
- 类型值使用 `movie` / `series` / `photo`，界面对应「电影 / 电视剧 / 图片」；字段整体可选，不参与任何文件校验。

备选：直接用 `jellyfin` 作为组织形式值。会把「组织形式」和「具体规范」混为一谈，后续扩展需要迁移数据，因此不采用。

### D2. SQLite 作为唯一事实来源，不再使用 `config.json`

- 默认数据库：`~/.gallery/gallery.db`。
- 测试或高级场景：`GALLERY_DB` 环境变量覆盖；测试也可传 `:memory:`。
- 不再创建 `config.json`。数据库位置只由默认路径与环境变量决定，避免多一个可能损坏的启动依赖。
- 选用 `better-sqlite3`：
  - 同步 API，适合本地 Fastify；
  - 支持事务、预处理语句与 WAL；
  - Windows 有预编译包；
  - `node:sqlite` 仍为 experimental，不作为持久化底座。
- 需要在根 `package.json` 的 `pnpm.onlyBuiltDependencies` 中加入 `better-sqlite3`，否则 pnpm 可能跳过原生绑定构建。
- 数据库文件属于用户数据，不写入仓库；仓库 `data/` 仍只放缩略图、临时文件等可重建缓存。
- 备份方式：退出服务后复制 `gallery.db`（以及可能存在的 `gallery.db-wal`、`gallery.db-shm`），或后续提供 SQLite backup API 的导出入口。

备选：`node:sqlite`。零依赖，但 experimental 状态与 API 变化风险不适合作为主存储，不采用。
备选：继续用 JSON。库数量虽小，但删除密码、迁移任务与后续扫描索引都需要事务与约束，JSON 需要手写日志和并发控制，不采用。

### D3. 数据库结构

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE libraries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  organization TEXT NOT NULL CHECK (organization IN ('collection','convention')),
  type TEXT CHECK (type IS NULL OR type IN ('movie','series','photo')),
  folder TEXT,
  folder_key TEXT UNIQUE,
  convention TEXT CHECK (convention IS NULL OR convention = 'jellyfin'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (organization = 'collection' AND folder IS NOT NULL AND convention IS NULL)
    OR
    (organization = 'convention' AND folder IS NULL AND convention = 'jellyfin')
  )
);

CREATE TABLE library_sources (
  library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  path_key TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (library_id, path_key)
);

CREATE INDEX idx_library_sources_path_key ON library_sources(path_key);

CREATE TABLE migrations (
  id TEXT PRIMARY KEY,
  from_root TEXT NOT NULL,
  to_root TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('pending','copying','switching','cleanup','cleanup_failed','succeeded','failed','interrupted')
  ),
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE migration_items (
  migration_id TEXT NOT NULL REFERENCES migrations(id) ON DELETE CASCADE,
  library_id TEXT NOT NULL,
  folder TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','copied','cleaned','failed')),
  error TEXT,
  PRIMARY KEY (migration_id, library_id)
);
```

- `settings` 主要键：
  - `media_root`：媒体根路径，未配置时不存在该行。
  - `delete_password`：密码哈希 JSON，未设置时不存在该行。
- `name_key` 为 `trim().toLowerCase()`，保证名称不区分大小写唯一。
- `folder` / `folder_key` 只用于作品集媒体库；`folder` 是实际目录名，`folder_key` 是小写形式，避免 Windows/macOS 大小写冲突。`folder` 不出现在公开 API。
- `path_key` 是来源路径的规范化去重键；Windows 下小写，POSIX 下保持大小写。
- `library_sources` 用独立表保存来源，避免 JSON 数组无法约束与查询。
- `migrations` / `migration_items` 是根路径迁移的持久化日志；进程重启后据此恢复。
- 后续扫描索引在同一数据库新增表，通过 `PRAGMA user_version` 升级，不回退到 JSON。

### D4. 数据库初始化、版本与事务

- `apps/server/src/lib/db.ts` 负责：
  - 解析路径、创建 `~/.gallery` 目录、打开数据库、设置 PRAGMA、执行 schema 迁移。
  - `buildApp()` 增加可选 `dbPath` 参数，测试传临时文件或 `:memory:`；生产使用默认路径。
  - app 关闭时关闭数据库连接。
- schema 版本使用 `PRAGMA user_version`：
  - 版本 0：在事务中创建全部表与索引，设为 1。
  - 版本低于当前：按顺序执行迁移脚本，整体放在事务中；失败回滚并报错。
  - 版本高于当前：拒绝启动数据库操作，返回 `db-version-unsupported`。
- 提供 `withTransaction(fn)`：`BEGIN IMMEDIATE` → 执行 → `COMMIT`，异常时 `ROLLBACK`。
- 所有 SQL 使用预处理语句；表名与列名固定，不拼接用户输入。
- 数据库打开或迁移失败时，服务仍启动，媒体库接口返回 `503 database-unavailable`，健康检查不受影响；错误信息包含数据库路径与原因，不自动删除或重建数据库。
- 单进程内 SQLite 访问是同步的；`better-sqlite3` 不提供跨进程锁，`busy_timeout` 只缓解锁等待。本项目按单实例运行。

### D5. 纯逻辑放 `packages/core`，I/O 留在服务端

`packages/core` 新增 `library` 模块：

- 类型：`LibraryOrganization`、`LibraryType`、`MediaLibrary`、`LibraryInput`、`LibraryStatus`、`MigrationState`。
- 纯校验：名称长度与空白、目录段合法性、Windows 保留名、类型/组织形式枚举。
- 纯辅助：默认目录名生成与冲突去重（基于已有名称集合）。
- 不包含任何路径 API、SQL 或文件系统访问。

`apps/server` 负责：

- SQLite 访问、事务、schema 升级。
- 绝对路径解析、根路径内校验、符号链接校验、目录创建与递归删除。
- 密码哈希与校验。
- 迁移任务、进度、启动恢复。
- HTTP 路由、错误码与响应结构。

备选：校验只写服务端。前端无法即时提示，且容易出现「前端能提交、后端才报错」的体验落差。

### D6. 媒体根路径与自动迁移

- 创建任何媒体库前必须先配置媒体根路径，即使文件规范媒体库本身不使用根路径下的目录。
- 保存根路径时先 `resolve`，要求绝对路径；拒绝符号链接；要求存在且为目录、可读可写。请求可携带 `create: true`，此时允许递归创建缺失目录。
- 没有媒体库时：直接保存 `media_root`。
- 只有文件规范媒体库时：直接保存 `media_root`，不启动迁移，不要求密码。
- 已有作品集媒体库时：
  - 传入相同规范化路径：幂等成功。
  - 传入新路径：要求删除保护密码，启动迁移任务；`PUT /api/library/config` 返回 `409 migration-required`，客户端改用迁移接口。
- 迁移只处理作品集媒体库；文件规范来源是绝对路径，不移动。
- 根路径不可用时，媒体库仍可列出；作品集媒体库显示异常，禁止新建作品集媒体库与启动迁移；文件规范来源仍允许编辑。

备选：有作品集媒体库时禁止修改根路径。与本次需求冲突，不采用。

### D7. 作品集媒体库的隐藏目录

- 数据库保存 `folder`，公开的 `LibraryView` 不返回该字段；创建与编辑表单不允许输入目录名。
- 创建时由服务端生成：
  - 用名称净化生成候选目录名：替换 Windows 非法字符 `< > : " / \ | ? *` 与控制字符，去掉首尾空格与结尾点，避开 `CON`、`PRN`、`AUX`、`NUL`、`COM1`–`COM9`、`LPT1`–`LPT9` 等保留名。
  - 与已有 `folder_key` 冲突时追加 `-2`、`-3`。
  - 如果生成的目录已存在且是普通目录，接管并保留内容；如果不存在，创建；如果是文件或符号链接，拒绝。
- 重命名媒体库只更新 `name` 与 `name_key`，不修改 `folder`。
- 目录创建后不可修改；不提供“移动作品集目录”的入口。
- 作品集目录与文件规范来源不得重叠：创建/编辑来源时检查双向包含关系，避免删除作品集时误删来源。
- UI 卡片只展示名称、组织形式、类型与状态，不展示目录名。是否为用户提供“在文件管理中打开”入口留待开放问题，不在本次规格中承诺。

### D8. 文件规范媒体库的来源规则

- `sources` 保存规范化后的绝对路径，顺序保留，供未来扫描决定优先级。
- 数量限制为 1–32 个。
- 每个来源必须是绝对路径、存在的目录、不可为符号链接、可读。
- 同一媒体库内去重；Windows 下比较时忽略大小写。
- 同一媒体库内来源不得互相包含（相等或一个位于另一个之内）。
- 来源不得与任何作品集媒体库目录重叠（相同或双向包含），防止删除作品集目录时波及来源。
- 创建与编辑来源均不触碰磁盘内容，不在媒体根路径下建目录。

### D9. 全局删除保护密码

- 密码存 `settings.delete_password`，格式：

```json
{
  "algorithm": "scrypt",
  "salt": "<base64>",
  "hash": "<base64>",
  "keylen": 64,
  "N": 16384,
  "r": 8,
  "p": 1
}
```

- 使用 `node:crypto` 的 `scrypt` 异步派生，随机 16 字节盐；校验使用 `timingSafeEqual`。
- 密码长度 8–128；不存明文，不返回哈希，不写日志。
- 设置/修改密码：`PUT /api/library/security`，body `{ currentPassword?, newPassword }`。已设置密码时修改必须提供当前密码。
- 未设置密码时，作品集删除与根路径迁移返回 `delete-password-not-configured`，引导先设置。
- 密码错误返回 403 `invalid-delete-password`，不修改数据库或文件系统。
- 文件规范媒体库只解除登记，不删除文件，因此不要求密码。
- 忘记密码只能通过手工修改数据库中的 `settings.delete_password` 重置；这是本地防误删锁，不是对抗本机文件访问的安全边界。

### D10. 移除媒体库

**作品集：**

1. 校验删除保护密码。
2. 读取媒体库，确认 `organization = 'collection'`。
3. 计算 `join(mediaRoot, folder)`，用 `isInside` 与 `dirname(path) === mediaRoot` 确认位于根路径内。
4. `lstat`：不存在则视为已删除；符号链接或非目录则拒绝；路径等于媒体根路径、磁盘根、用户主目录则拒绝。
5. 检查不与任何文件规范来源、其他媒体库路径重叠；重叠则拒绝。
6. `rm(path, { recursive: true, force: false })`。
7. 删除 `libraries` 记录（来源级联删除）。
8. 删除失败时保留记录，返回 `{ deleted: false, failed: [{ path, message }] }`；已不存在的路径视为成功。

**文件规范：**

- 只执行 `DELETE FROM libraries WHERE id = ?`，`library_sources` 级联删除；不访问来源目录，不要求密码。
- 响应返回来源路径供前端提示“目录保持不变”。

**确认交互：**

- 作品集：警告“将永久删除媒体库及全部内容，无法撤销”，要求输入密码。
- 文件规范：说明“只解除登记，不会删除来源文件”，普通确认。
- 确认框不展示作品集内部目录名；只展示媒体库名称与删除范围说明。文件规范展示来源路径。

### D11. 根路径迁移任务

**预检：**

- 校验删除保护密码。
- 没有处于 `pending`、`copying`、`switching`、`cleanup` 的迁移任务。
- 新根路径绝对、非符号链接、可写；新旧根路径不能相等、不能互相包含。
- 新根路径不存在时允许创建。
- 每个作品集媒体库：
  - 旧目录存在、是普通目录、不是符号链接；
  - `newRoot/folder` 不存在；
  - 不与其他来源重叠。
- 尽量检查剩余空间；空间不足时拒绝启动，但不把预检当作绝对保证。

**任务流程：**

1. 在事务中写入 `migrations` 与 `migration_items`，状态 `pending`，随后置 `copying`。
2. 逐个 `fs.cp(oldPath, newPath, { recursive: true, force: false, errorOnExist: true, preserveTimestamps: true, dereference: false })`；每完成一个把 item 置 `copied`。
3. 全部复制完成后，在事务中更新 `settings.media_root = newRoot`，迁移置 `cleanup`。
4. 逐个 `rm(oldPath, { recursive: true, force: false })`；每完成一个把 item 置 `cleaned`。
5. 全部清理完成置 `succeeded`；部分清理失败置 `cleanup_failed` 并记录失败路径，新根路径保持可用。

**失败处理：**

- 复制失败：删除本次创建的目标目录（`newRoot/folder`），迁移置 `failed`，旧根路径与旧数据保持不变。
- 切换失败：同上，删除目标目录，置 `failed`。
- 清理失败：不回滚根路径；保留旧副本，返回失败路径与可读提示。
- 启动恢复：
  - `pending` / `copying`：旧根路径仍有效，删除目标目录，置 `interrupted`。
  - `switching`：检查 `settings.media_root`；已切换则继续清理，否则回滚目标目录并置 `interrupted`。
  - `cleanup`：继续清理；失败则置 `cleanup_failed`。
  - `cleanup_failed` / `failed` / `interrupted`：保留记录供 UI 展示，不自动删除用户数据。
- 迁移使用复制而不是 `rename`，牺牲磁盘空间与时间换取切换前旧数据完整；后续可对同盘场景增加 `rename` 优化。

**进度：**

- 任务在进程内维护进度对象，并持久化状态到 `migrations` / `migration_items`。
- `GET /api/library/config/migrate/:id` 返回阶段、当前序号、总数、当前媒体库名称、错误与警告。
- 同一时间只允许一个活动迁移；新请求返回 `409 migration-in-progress`。
- 服务重启后，`overview` 返回最近一次迁移记录；进度接口从数据库恢复状态。

### D12. HTTP 接口

统一前缀 `/api/library`，全部返回 JSON；变更类请求沿用全局客户端标识校验。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/library/overview` | 返回数据库路径、媒体根路径、根路径状态、密码是否设置、最近迁移与全部媒体库（含状态） |
| `PUT` | `/api/library/config` | 无作品集媒体库时设置媒体根路径，body `{ mediaRoot, create? }`；有作品集媒体库时返回 `migration-required` |
| `POST` | `/api/library/config/migrate` | 启动根路径迁移，body `{ mediaRoot, password }`，返回 `202 { migrationId }` |
| `GET` | `/api/library/config/migrate/:id` | 查询迁移进度与结果 |
| `PUT` | `/api/library/security` | 设置/修改删除保护密码，body `{ currentPassword?, newPassword }` |
| `POST` | `/api/library/libraries` | 创建媒体库 |
| `PATCH` | `/api/library/libraries/:id` | 编辑名称、类型；文件规范库可替换来源 |
| `POST` | `/api/library/libraries/:id/delete` | 移除媒体库，body `{ password? }` |

示例响应：

```ts
interface LibraryOverview {
  databasePath: string
  mediaRoot: string | null
  rootStatus: 'unset' | 'ok' | 'missing' | 'not-directory' | 'unreadable' | 'unwritable' | 'symlink'
  deletePasswordConfigured: boolean
  migration: MigrationView | null
  libraries: LibraryView[]
}

interface LibraryView {
  id: string
  name: string
  organization: 'collection' | 'convention'
  type: 'movie' | 'series' | 'photo' | null
  convention: 'jellyfin' | null
  sources: string[]
  createdAt: string
  updatedAt: string
  status: 'ok' | 'partial' | 'missing' | 'unreadable' | 'symlink'
  issues: string[]
}

interface MigrationView {
  id: string
  state: 'pending' | 'copying' | 'switching' | 'cleanup' | 'cleanup_failed' | 'succeeded' | 'failed' | 'interrupted'
  fromRoot: string
  toRoot: string
  current: number
  total: number
  currentLibraryName: string | null
  error: string | null
  warnings: string[]
}
```

- `LibraryView` 不包含作品集内部目录 `folder`；文件规范库返回 `sources`，作品集库返回空数组。
- `overview` 一次返回配置与媒体库，减少首屏请求数。
- 创建/编辑返回单个 `LibraryView`，前端成功后重新拉取 `overview`。
- 目录选择复用现有 `GET /api/fs/roots` 与 `GET /api/fs/list`。
- 服务端拒绝 `PATCH` 中的 `organization`、`convention`、`folder` 字段变更，返回 409。
- 主要错误码：
  - `database-unavailable`、`db-version-unsupported`
  - `root-not-configured`、`root-unavailable`、`migration-required`、`migration-in-progress`、`migration-conflict`
  - `invalid-folder`、`duplicate-name`、`duplicate-folder`
  - `invalid-sources`、`source-missing`、`source-overlap`
  - `library-not-found`、`organization-immutable`、`folder-immutable`
  - `delete-password-not-configured`、`invalid-delete-password`
  - `protected-path`、`delete-failed`

### D13. 前端页面与交互

- 在 `lib/nav.ts` 中启用 `/library`，移除「规划中」；`App.tsx` 注册真实页面。
- 页面状态：
  - 加载中；
  - 未配置媒体根路径：展示设置引导与目录选择；
  - 已配置但没有媒体库：展示空状态与「新建媒体库」；
  - 有媒体库：卡片网格；
  - 迁移进行中：顶部或弹窗展示进度。
- 媒体库卡片：
  - 名称、组织形式徽标、可选类型、状态点；
  - 作品集不展示任何路径；
  - 文件规范展示来源数量与首条来源摘要；
  - 异常状态展示 `issues`；
  - 操作：编辑、移除。
- 新建/编辑对话框：
  - 名称（必填）；
  - 组织形式（仅新建可选，卡片式二选一）；
  - 类型（可选下拉）；
  - 作品集：显示说明“系统会自动创建并管理存储目录，重命名不会移动文件”，不提供目录输入；
  - 文件规范：来源列表，每行一个绝对路径，支持浏览选择、删除与新增。
- 删除确认：
  - 作品集：列出媒体库名称，警告永久删除全部内容，要求密码；密码未设置时引导到设置。
  - 文件规范：说明只解除登记、不删除来源文件，普通确认，不要求密码。
- 设置对话框：
  - 「媒体」：媒体根路径输入与目录选择；有作品集媒体库时保存会打开迁移确认，要求密码并展示进度；只有文件规范媒体库时直接保存；
  - 「安全」：设置/修改删除保护密码；
  - 「数据」：展示数据库路径（只读）。
- 迁移进度：
  - 保存后轮询进度接口，展示阶段、当前/总数与当前媒体库；
  - 完成后刷新 `overview`；
  - 失败时展示错误与旧根路径是否保留。
- 复用现有视觉规范（`panel`、`line`、`brand`、`rounded-xl/2xl`）与 `animate-rise`，不引入 UI 库。

### D14. 安全与一致性

- 所有路径在服务端 `resolve` 后校验；作品集目录额外校验位于媒体根路径内。
- 默认不跟随符号链接；根路径、作品集目录与来源均用 `lstat` 检查。
- 删除与迁移拒绝磁盘根、用户主目录、媒体根路径本身，以及与其他媒体库重叠的路径。
- SQL 全部使用预处理语句；数据库文件创建时尽量收紧权限（POSIX 下仅当前用户可读写）。
- 密码使用 scrypt 加盐哈希；错误信息不区分“密码错误”和“密码不存在”，避免泄露额外信息。
- 变更类请求继续依赖 `x-gallery-client: 1` 与回环监听。
- 名称、目录、来源的唯一性比较在服务端完成，前端提示仅作辅助。
- 承认 `lstat` 与后续操作之间的 TOCTOU 窗口；本应用为单用户本地服务，风险可接受，未来如引入多用户需改为句柄级校验。
- 迁移复制不跟随符号链接；媒体目录内部的符号链接按链接本身复制，若指向旧根路径需用户自行处理。

### D15. 测试策略

- `packages/core`：名称校验、目录名净化、保留名、类型/组织形式枚举、默认目录名去重。全部纯函数单测。
- `apps/server` 数据库层：临时数据库或 `:memory:` 下验证建表、schema 版本、事务回滚、唯一约束与级联删除。
- 密码：哈希不包含明文、正确密码通过、错误密码失败、修改密码需要当前密码。
- 媒体库服务：临时目录下验证根路径校验、作品集目录生成/接管、来源去重/嵌套/重叠、状态探测。
- 删除：作品集递归删除、部分失败保留记录、受保护路径拒绝、目录缺失视为已删除、文件规范只删记录。
- 迁移：小目录复制、切换、清理、预检冲突、复制失败回滚、清理失败保留旧副本、启动恢复。跨盘与超大数据量不纳入自动化测试。
- 路由：通过 `buildApp({ dbPath })` 与 `app.inject` 覆盖全部端点、错误码、不可变字段与客户端标识。
- 符号链接用例在无权限创建链接的环境下跳过，与现有 `paths.test.ts` 的处理方式一致。
- 前端当前没有组件测试基础设施；以 `pnpm typecheck`、`pnpm build` 与浏览器手工走查为准。

## Risks / Trade-offs

| 风险 | 处理 |
| --- | --- |
| `better-sqlite3` 原生依赖在 Windows 安装失败 | 使用预编译包；根 `pnpm.onlyBuiltDependencies` 允许构建；若仍失败，保留数据库访问层接口以便切换驱动 |
| 数据库损坏导致媒体库不可见 | WAL、事务与备份建议；损坏时返回明确错误并保留原文件，不自动重建 |
| 迁移复制占用双倍磁盘与较长时间 | 预检尽量检查空间；后台任务与进度；失败时保留旧数据 |
| 迁移中进程中断 | `migrations` / `migration_items` 持久化；启动时按阶段回滚复制或继续清理 |
| 清理旧副本失败 | 新根路径已生效；保留旧副本并报告路径，不阻塞后续使用 |
| 用户误删作品集内容 | 全局密码、明确警告、受保护路径校验；删除失败保留记录 |
| 用户忘记删除密码 | 手工重置数据库中的密码行；定位为防误删锁，不是安全边界 |
| 作品集目录对用户不可见，难以手动放入文件 | 留出“打开目录”入口作为后续决策；当前可在媒体根路径下按名称放置内容或等待扫描/导入能力 |
| 文件规范来源与作品集目录重叠 | 创建/编辑来源时强制双向包含检查，避免删除时误伤 |
| 符号链接指向旧根路径 | 迁移不跟随链接；文档说明相对链接与绝对链接的差异 |
| 多实例同时写数据库 | 按单实例运行；`busy_timeout` 仅缓解锁等待，不提供跨进程协调 |
| 未来扫描索引体积增长 | 与配置/媒体库表同库但独立表；后续可拆库或增加清理策略 |

## Migration Plan

纯新增，无既有用户数据迁移（当前版本没有媒体库功能）：

1. `packages/core` 增加 `library` 模块并从 `src/index.ts` 导出。
2. `apps/server` 增加 `better-sqlite3` 依赖与数据库模块；首次启动创建 `~/.gallery/gallery.db`。
3. 注册 `/api/library` 路由；作品集目录在创建媒体库时生成。
4. `apps/web` 启用 `/library` 导航并替换占位页；设置对话框增加媒体、安全与数据区块。
5. `README.md` 功能清单增加媒体库管理，运行时数据说明增加数据库位置；`AGENTS.md` 接口概览增加 `/api/library`。

回滚方式：移除新增路由、页面、共享模块与数据库依赖，`/library` 恢复为占位页。用户目录下的 `gallery.db` 不参与构建，可保留或手工删除；回滚过程不会触碰任何媒体文件。若已执行过作品集删除或根路径迁移，文件系统中已发生的删除/迁移不会自动恢复。

## Open Questions

- 是否在作品集卡片提供“在文件管理中打开”入口，方便用户手动放入媒体文件。
- 后续「作品集实体」与媒体库是一对一还是一对多，需要等扫描与详情页需求明确后再定。
- 同盘迁移是否增加 `rename` 优化，以减少复制时间与临时磁盘占用。
- 删除密码是否需要提供受控的重置流程，而不是仅靠手工修改数据库。
- `cleanup_failed` 状态是否需要提供“重试清理”接口，还是仅提示旧副本路径。
- 未来扫描索引与媒体库定义是否继续同库，还是拆分为独立索引数据库。
