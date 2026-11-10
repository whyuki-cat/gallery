# Tasks

## 1. SQLite 基础

- [x] 1.1 在 `apps/server` 增加 `better-sqlite3` 运行依赖与 `@types/better-sqlite3` 开发依赖，在根 `package.json` 的 `pnpm.onlyBuiltDependencies` 加入 `better-sqlite3`；运行 `pnpm install` 与 `pnpm typecheck` 验证安装与类型解析成功。
- [x] 1.2 新增 `apps/server/src/lib/db.ts`：默认路径 `~/.gallery/gallery.db`，支持 `GALLERY_DB` 覆盖与 `buildApp({ dbPath })` 测试注入；创建父目录、打开数据库、设置 WAL/外键/busy timeout，并在 app 关闭时关闭连接；用临时数据库验证默认与覆盖路径。
- [x] 1.3 实现 schema v1：创建 `settings`、`libraries`、`library_sources`、`migrations`、`migration_items` 与索引，设置 `PRAGMA user_version = 1`；用测试检查表、唯一约束、外键级联与版本号。
- [x] 1.4 实现 schema 版本检查与升级：版本 0 初始化、低版本按顺序升级、高版本返回 `db-version-unsupported`；用测试验证升级事务失败时回滚。
- [x] 1.5 实现 `withTransaction(fn)` 与数据库不可用状态：打开或迁移失败时服务仍启动，媒体库接口返回 `503 database-unavailable`，健康检查不受影响；用测试验证错误信息包含数据库路径且不自动删除文件。

## 2. 共享类型与校验（packages/core）

- [x] 2.1 新增 `packages/core/src/library/types.ts`，定义 `LibraryOrganization`、`LibraryType`、`MediaLibrary`、`LibraryInput`、`LibraryStatus`、`MigrationState` 与视图类型；从 `src/index.ts` 导出，运行 `pnpm --filter @gallery/core build` 与 `pnpm typecheck` 验证两端可解析。
- [x] 2.2 实现媒体库名称校验：去除首尾空白、长度 1–80、与已有名称不区分大小写唯一；用 Vitest 覆盖空名、超长、大小写重复与中文名称。
- [x] 2.3 实现目录段净化与校验：替换 Windows 非法字符、处理控制字符、首尾空格与结尾点、拒绝 `.`/`..`、路径分隔符与保留名；用 Vitest 覆盖中文、非法字符、`CON`、`COM1`、结尾点与超长输入。
- [x] 2.4 实现默认目录名生成与冲突去重（`-2`、`-3` 后缀）；用 Vitest 验证同名、已存在后缀与空净化结果。
- [x] 2.5 实现类型/组织形式枚举校验与状态汇总辅助（`ok` / `partial` / `missing` / `unreadable` / `symlink`）；用 Vitest 覆盖每类状态与空来源。

## 3. 数据访问与密码（apps/server）

- [x] 3.1 新增设置仓库：读写 `media_root` 与 `delete_password`，未配置时返回 `null`；用临时数据库测试读写、覆盖与删除。
- [x] 3.2 新增媒体库仓库：按 `name_key` / `folder_key` 唯一约束创建与更新，来源按 `position` 保存并在删除时级联；用测试验证重复名称、重复目录、来源级联与事务回滚。
- [x] 3.3 实现密码哈希模块：使用 `node:crypto` 的 scrypt、随机盐与 `timingSafeEqual`，保存算法参数；用测试验证不存明文、正确密码通过、错误密码失败、缺失密码行时返回未设置。
- [x] 3.4 实现设置/修改密码服务：首次设置无需当前密码，已设置时必须校验当前密码，新密码长度 8–128；用测试覆盖成功、当前密码错误、新密码过短与未设置状态。
- [x] 3.5 实现数据库错误映射：约束冲突、事务失败、数据库只读与磁盘错误映射为稳定错误码与中文提示；用测试覆盖至少三类错误。

## 4. 媒体库服务（apps/server）

- [x] 4.1 实现媒体根路径校验与保存：绝对路径、拒绝符号链接、存在或显式创建、可读写；无作品集媒体库时直接保存（含只有文件规范媒体库的情况），相同路径幂等，有作品集媒体库时返回 `migration-required`；用临时目录测试覆盖不存在、文件、符号链接与只读目录。
- [x] 4.2 实现作品集媒体库创建：由名称生成隐藏目录名、冲突追加后缀、不存在时创建、已存在普通目录时接管、文件或符号链接拒绝；用集成测试验证接管目录内容不被清空，且 API 不返回目录名。
- [x] 4.3 实现作品集创建失败回滚：数据库写入失败时仅删除本次新建且为空的目录；用模拟失败或约束冲突验证已有目录不会被删除。
- [x] 4.4 实现文件规范来源校验：1–32 个、绝对路径、存在目录、可读、拒绝符号链接、不区分大小写去重、禁止互相包含、禁止与任何作品集目录重叠；用测试覆盖重复、嵌套、缺失、非目录与重叠。
- [x] 4.5 实现媒体库 CRUD 服务：名称唯一性、组织形式与目录不可变、文件规范来源可替换；用测试验证不可变字段被拒绝、来源替换后旧记录删除。
- [x] 4.6 实现状态探测：根路径、作品集目录与每个来源分别返回 ok/missing/unreadable/symlink，并汇总为 ok/partial/missing；用测试验证部分来源缺失时状态为 `partial`。
- [x] 4.7 实现作品集删除：校验密码、计算并校验目录、拒绝受保护路径、递归删除、再删数据库记录；用测试覆盖成功、密码错误、目录缺失、部分删除失败与共享路径拒绝。
- [x] 4.8 实现文件规范删除：只删除数据库记录与来源，不访问来源目录；用测试验证来源目录与文件仍存在，且不要求密码。
- [x] 4.9 实现根路径不可用时的行为：媒体库仍可列出，作品集创建与迁移被拒绝，文件规范来源仍可编辑；用测试覆盖根路径删除后的读取与创建。

## 5. 根路径迁移任务（apps/server）

- [x] 5.1 实现迁移预检：密码、无活动任务、新根路径校验、新旧路径互不包含、目标目录不存在、作品集目录存在且非符号链接、来源不重叠；用测试逐项验证拒绝原因。
- [x] 5.2 实现迁移任务持久化：在事务中写入 `migrations` 与 `migration_items`，实现 `pending → copying → switching → cleanup → succeeded` 状态流转；用测试验证状态与条目写入。
- [x] 5.3 实现复制阶段：使用 `fs.cp` 递归复制作品集目录，禁止覆盖已存在目标，逐个更新条目为 `copied`；用临时目录测试复制内容与时间戳，复制失败时清理本次创建的目标目录。
- [x] 5.4 实现切换阶段：在 SQLite 事务中更新 `media_root` 并推进迁移状态；用测试验证切换成功、事务失败时旧根路径保持不变。
- [x] 5.5 实现清理阶段与失败报告：删除旧作品集目录，条目置 `cleaned`，全部成功置 `succeeded`，部分失败置 `cleanup_failed` 并保留旧副本路径；用测试验证新根路径仍可用。
- [x] 5.6 实现进度查询与单任务限制：内存进度对象叠加数据库状态，返回阶段、当前/总数与当前媒体库；活动任务存在时新请求返回 `migration-in-progress`；用接口测试验证进度与并发拒绝。
- [x] 5.7 实现启动恢复：`pending`/`copying` 回滚目标目录并置 `interrupted`，`switching` 根据 `media_root` 决定继续清理或回滚，`cleanup` 继续清理；用测试模拟各阶段重启。

## 6. HTTP 接口（apps/server）

- [x] 6.1 新增 `apps/server/src/routes/library.ts`，实现 `GET /api/library/overview` 与 `PUT /api/library/config`，并在 `app.ts` 注册 `/api/library` 前缀；用 `app.inject` 验证响应不包含作品集目录名、包含根路径状态与密码是否设置。
- [x] 6.2 实现 `PUT /api/library/security`：首次设置与修改密码，返回是否已设置，不返回哈希；用接口测试覆盖成功、当前密码错误与密码过短。
- [x] 6.3 实现媒体库创建、编辑与删除端点：`POST /libraries`、`PATCH /libraries/:id`、`POST /libraries/:id/delete`；用接口测试覆盖作品集密码删除、文件规范无密码删除、不可变字段拒绝。
- [x] 6.4 实现迁移端点：`POST /config/migrate` 返回 `202 { migrationId }`，`GET /config/migrate/:id` 返回进度；用接口测试验证密码、并发拒绝与不存在任务。
- [x] 6.5 统一错误码与 HTTP 状态：`database-unavailable`、`root-not-configured`、`root-unavailable`、`migration-required`、`migration-in-progress`、`migration-conflict`、`invalid-folder`、`duplicate-name`、`duplicate-folder`、`invalid-sources`、`source-missing`、`source-overlap`、`library-not-found`、`organization-immutable`、`folder-immutable`、`delete-password-not-configured`、`invalid-delete-password`、`protected-path`、`delete-failed`；用接口测试逐项验证。
- [x] 6.6 验证隔离：测试使用临时数据库与临时媒体目录，确认不读写用户真实数据库、不在仓库内产生数据库或媒体文件；用 `app.inject` 覆盖缺少 `x-gallery-client: 1` 的变更请求返回 403。

## 7. 媒体库页面（apps/web）

- [x] 7.1 新增 `features/library/types.ts` 与 `lib/api.ts` 方法（`overview`、`setMediaRoot`、`startMigration`、`migrationStatus`、`setDeletePassword`、`createLibrary`、`updateLibrary`、`deleteLibrary`），错误统一走 `ApiError`；用 `pnpm typecheck` 验证请求/响应类型与后端一致。
- [x] 7.2 在 `lib/nav.ts` 启用 `/library` 并移除「规划中」，在 `App.tsx` 注册真实页面替换 `Placeholder`；启动开发服务验证侧边栏可进入且面包屑正确。
- [x] 7.3 实现页面骨架与状态：加载中、未配置媒体根路径、无媒体库、媒体库列表、迁移进行中；用浏览器验证每种状态都有明确下一步操作。
- [x] 7.4 实现媒体库卡片：名称、组织形式徽标、可选类型、状态点与异常提示；作品集卡片不展示任何底层路径，文件规范展示来源数量与首条来源摘要；验证异常路径不会导致整页报错。
- [x] 7.5 实现可复用目录选择对话框：基于 `GET /api/fs/roots` 与 `GET /api/fs/list` 浏览并选择目录，支持取消与 Escape；用于媒体根路径与文件规范来源，验证选择后回填正确路径。
- [x] 7.6 实现新建媒体库对话框：名称、组织形式二选一、可选类型；作品集只显示“系统自动管理存储目录”的说明，不提供目录输入；文件规范支持来源列表增删；验证必填项与前端即时校验。
- [x] 7.7 实现编辑对话框：名称与类型可改，文件规范来源可增删，作品集目录与组织形式只读；验证服务端拒绝不可变字段时前端展示可读错误。
- [x] 7.8 实现删除确认：作品集展示永久删除警告并要求密码，密码未设置时引导去设置；文件规范说明只解除登记、不删除来源；验证两种确认流程与错误密码提示。
- [x] 7.9 实现设置对话框的「媒体」「安全」「数据」区块：媒体根路径输入与目录选择、有作品集媒体库时的迁移确认与进度轮询、删除密码设置/修改、数据库路径只读展示；用浏览器验证迁移完成后媒体库页自动刷新。
- [x] 7.10 实现全局提示与刷新：创建/编辑/删除/迁移成功后重新拉取 `overview`，失败时保留表单并展示中文错误；用浏览器验证网络失败、业务错误与迁移失败三种提示。

## 8. 文档

- [x] 8.1 更新 `README.md`：功能清单增加「媒体库管理」，运行时数据说明增加 `~/.gallery/gallery.db` 与「数据库不写入仓库」，保持 README 精简。
- [x] 8.2 更新 `AGENTS.md` 接口概览，增加 `/api/library` 与用户级数据库位置说明；用 `rg` 检查文档不含本机绝对路径。
- [x] 8.3 用 `rg` 检查占位页、禁用导航、`config.json`、`root-locked` 与「移除只删配置」等过期文案的残留引用，确保实现与规格一致。

## 9. 集成验证

- [x] 9.1 运行 `pnpm typecheck` 与 `pnpm test`，确认全量通过且新增测试覆盖数据库、密码、媒体库服务、删除、迁移与路由。
- [x] 9.2 运行 `pnpm build`，确认前端产物与后端编译通过；启动 `pnpm start` 验证生产模式下 `/library` 可访问且数据库在首次启动时创建。
- [x] 9.3 手工走查完整链路：设置媒体根路径 → 创建作品集媒体库（确认界面不显示目录）→ 创建文件规范媒体库（两个来源）→ 编辑名称/类型/来源 → 设置删除密码 → 删除作品集（确认内容被删除）→ 删除文件规范（确认来源保留）。
- [x] 9.4 手工验证根路径迁移：创建两个作品集库并放入文件 → 修改根路径 → 输入密码 → 观察进度 → 确认新根路径内容完整、旧副本被清理、文件规范来源未移动。
- [x] 9.5 手工验证边界：重复名称、非法目录名、缺失来源、嵌套来源、来源与作品集重叠、根路径被删除、数据库损坏、错误密码、受保护路径、缺少客户端标识；确认均返回中文提示且不破坏数据。
- [x] 9.6 对照 `specs/media-library/spec.md` 逐条核对实现与场景，记录未覆盖项或偏差。

## Workflow follow-up

- 按项目评审要求确认实现与规格一致后归档本变更。
- 归档后验证 `openspec/specs/media-library/spec.md` 已正确生成，且 `media-library` 的 Purpose 与需求完整。
