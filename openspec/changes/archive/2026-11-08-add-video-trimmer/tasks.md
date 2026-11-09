# Tasks

## 1. 共享裁剪规则（packages/core）

- [x] 1.1 新建 `src/trim/types.ts` 与 `segments.ts`，实现 `TrimSegment`、`TrimIssue`、`validateSegments`、`sortSegments`、`findOverlaps`；用 `pnpm --filter @gallery/core test` 验证空数组、1 到 100 段边界、非法数值、过短片段与重叠检测
- [x] 1.2 实现 `formatTimecode`、`formatFileTime` 与 `planTrimOutputs`，覆盖逐段 `<原名>-<起点>-<终点>.<扩展名>` 与合并命名、时间戳补零、批次内重复与目录重名追加；单测覆盖跨小时、毫秒、相同时间区间与已存在同名文件
- [x] 1.3 从 `src/index.ts` 导出 trim 模块并运行 `pnpm typecheck`，确认 `@gallery/core` 可被前后端正常导入

## 2. 服务端 FFmpeg 能力与导出

- [x] 2.1 新建 `apps/server/src/lib/ffmpeg.ts`，迁入二进制路径解析、`hasFfmpeg` 与 `runFfmpeg`；改造 `thumbs.ts` 复用该模块；运行 `pnpm --filter @gallery/server test` 与 `pnpm --filter @gallery/server typecheck` 验证缩略图行为不变
- [x] 2.2 在 `data-dirs.ts` 增加 `TMP_DIR`，并在 `/api/fs/roots` 的 `capabilities` 中增加 `ffmpeg: boolean`；启动服务后请求该接口，确认新字段存在且 `thumbnail`、`videoThumbnail` 保持不变
- [x] 2.3 实现 `apps/server/src/lib/trim.ts`：逐段流复制、合并临时分段与 concat、按片段起止时间生成逐段名称、重名处理、失败清理；用 FFmpeg 生成短测试视频，断言逐段与合并输出存在且非空
- [x] 2.4 实现 `apps/server/src/routes/trim.ts` 并在 `app.ts` 注册 `/api/trim`：校验绝对路径、普通视频文件、非符号链接、1 到 100 段、有限时间、`0 <= start < end`、单段至少 0.1 秒；测试非法输入、缺少客户端头与成功响应
- [x] 2.5 在 README 补充 `/api/trim/export`、`capabilities.ffmpeg` 与 `data/tmp` 说明；按文档实际调用一次接口，确认文档与返回结构一致

## 3. 前端裁剪页面

- [x] 3.1 新增 `apps/web/src/features/trim/types.ts`，在 `lib/api.ts` 增加 `trimExport`；运行 `pnpm --filter @gallery/web typecheck` 确认请求/响应类型可用
- [x] 3.2 实现 `VideoPicker`，复用 `/api/fs/roots` 与 `/api/fs/list`，只展示文件夹和视频文件，支持输入绝对路径、进入目录与选择视频；手工验证选中后弹窗关闭且文件名、路径正确显示
- [x] 3.3 实现 `TrimTimeline`：点击或拖动只定位播放头、绘制播放头、片段色块与草稿区间；手工验证拖动不会自动创建片段
- [x] 3.4 实现 `SegmentList` 与 `TrimPage` 布局：播放器、时间轴、片段列表、重叠提示、输出预览、逐段/合并导出、loading 与结果提示；手工验证删除、跳转、按钮禁用与导出文件名预览
- [x] 3.5 在 `App.tsx` 注册 `/tools/trim` 并排除占位页；验证侧边栏可进入真实页面，刷新与 `?path=` 深链均可用
- [x] 3.6 处理 FFmpeg 缺失、视频无法播放、逐段部分失败与合并失败；手工验证缺少 FFmpeg 时导出禁用、错误与成功提示均为中文
- [x] 3.7 在 README 补充视频裁剪的用户说明、无损限制、输出命名与路线图勾选；确认文档和示例中没有本机绝对路径
- [x] 3.8 实现自定义播放控件：播放/暂停、前后 1 秒、空格与方向键、点击画面切换播放；移除原生 `controls`，视频按原始比例铺满可用区域；手工验证播放、暂停与布局
- [x] 3.9 改为显式标记：只有「设为起点 / 设为终点」与 `I` / `O` 会设置边界；手工验证点击或拖动时间轴只定位，不产生草稿或片段
- [x] 3.10 调整浅色主题对比度：时间轴播放头改用文字色令牌，刻度使用更深的次级文字色，补充浅色主题的琥珀色前景；手工检查深色与浅色下的时间轴、播放按钮与标记按钮

## 4. 集成验证

- [x] 4.1 运行 `pnpm typecheck`、`pnpm test`、`pnpm build`，确认全部通过
- [x] 4.2 端到端手工验证：选择本地视频，标记两个片段，分别执行逐段导出与合并导出，确认输出位于源目录、可播放、重名时自动追加序号且不覆盖
- [x] 4.3 全局搜索 `trim`、`trimExport`、`TMP_DIR` 与占位页引用，确认没有未使用导出、死代码或过期说明

## Workflow follow-up

- 在代码评审与验证完成后归档 `add-video-trimmer` 变更。
- 归档后检查 `openspec/specs/video-trimmer/spec.md` 与实现是否一致。
