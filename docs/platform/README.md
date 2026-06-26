# 完整货运平台工程说明

当前仓库从 React Native 货主端本地 MVP 起步，完整平台按移动端、后端、后台和第三方能力分阶段演进。

## 默认技术路线

- 移动端：React Native，货主端和司机端第一阶段共用工程，按业务目录隔离。
- 后端：NestJS 模块化单体。
- 主库：PostgreSQL。
- 缓存：Redis。
- 文件：S3 兼容对象存储。
- 地图：高德地图 SDK。
- 后台：独立 Web 管理端，后续阶段创建。

## 阶段 0/1 交付边界

- 阶段 0：工程文档、API 规范、ERD 初稿、移动端迁移策略。
- 阶段 1：NestJS 后端骨架、认证接口、token/refresh token 边界、移动端 API adapter。

阶段 0/1 不实现司机端、后台、地图、支付、推送、上传真实直传和 IM。

## 目录规划

- `apps/api`：NestJS 后端服务。
- `src/services`：React Native 端 API client 和 adapter。
- `docs/platform`：平台级架构、ERD、OpenAPI 和迁移说明。
- `docs/superpowers/specs`：已批准设计规格。
- `docs/superpowers/plans`：可执行实施计划。
