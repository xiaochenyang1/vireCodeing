# Platform Completion Stage 2 Design

## Goal

把当前货运平台从“阶段 1 API 和移动端第一片已具备，但真实环境和运营入口仍缺口明显”的状态，推进到更能落地验收的阶段 2 基线。

本阶段只补最接近完成的三块半成品：

- 真实 PostgreSQL 验收闭环。
- 文件上传第一片从元数据占位推进到可替换存储抽象。
- 司机认证 Web 审核台最小可用入口。

这不是完整上线版。支付、地图、IM、推送、资金结算这些大件不塞进这一轮，项目不是自助盒饭，啥都往盘里怼最后谁也吃不明白。

## Current Evidence

当前仓库已经具备这些基础：

- React Native 移动端已覆盖货主本地 MVP、平台认证、平台订单、草稿、地址簿、常用路线、文件、司机订单和司机认证 adapter。
- NestJS API 已有 `auth`、`orders`、`order-drafts`、`files`、`driver-orders`、`driver-certification`、`profile-address-book`、`profile-frequent-routes` 等模块。
- Prisma schema 已有用户、认证会话、验证码、文件对象、货主订单、草稿、地址簿、常用路线、司机认证和审核事件模型。
- OpenAPI 已覆盖阶段 1 认证、文件、货主订单、司机订单、司机认证和 admin 司机认证审核 API。
- 当前自动核验结果：
  - `npm test -- --runInBand`: 31 suites / 537 tests passed。
  - `npm --prefix apps/api test`: 44 suites / 371 tests passed。
  - `npx tsc --noEmit`: passed。
  - `npm run lint`: passed。
  - `npm --prefix apps/api run typecheck`: passed。
  - `npm --prefix apps/api run lint`: passed。
  - `npm --prefix apps/api run prisma:validate`: passed。
  - `npm run api:build`: passed。
  - `npm --prefix apps/api run db:postgres:doctor`: failed，原因是当前机器没有 Docker CLI，默认 `localhost:5432` PostgreSQL 不可达，Prisma 返回 `P1001`。

## Scope

### In Scope

1. **PostgreSQL acceptance closure**
   - 保留并强化现有 `verify-postgres.js`、migration、seed 和 smoke 脚本的验收路径。
   - 明确 `DATABASE_URL`、`TEST_DATABASE_URL`、本地 Docker Compose 和真实 PostgreSQL 的执行方式。
   - 在环境可用时跑通 `doctor/deploy/seed/auth-smoke/order-smoke/driver-certification-smoke/bootstrap`。
   - 环境不可用时继续让失败清晰可诊断，不把红灯写成绿灯。这事儿不能嘴硬，数据库连不上就是连不上。

2. **File upload storage first slice**
   - 在现有 `FileObject`、上传意图、`uploaded` 状态、预览签名基础上抽出存储 provider 边界。
   - 支持开发环境本地存储 provider，提供可测试的上传 URL/确认/预览路径。
   - 保留未来接 S3/OSS 的接口形状，但本阶段不强依赖真实云厂商凭证。
   - 让认证附件、发单货物图、异常图、评价图继续复用同一文件地基。

3. **Driver certification admin web console**
   - 增加最小 Web 审核台，用现有 admin API 完成：
     - 查看司机认证队列。
     - 查看实名/车辆认证状态。
     - 查看附件预览元数据。
     - 通过或驳回实名/车辆认证。
     - 查看审核事件。
   - 优先实现为 API 服务内的轻量管理页面或同仓库轻量前端，不引入庞大后台框架。
   - 页面服务必须有清晰的运行入口和测试/构建验证。

### Out of Scope

本阶段不做：

- 微信/支付宝/银行卡支付。
- 退款、违约金、资金托管、分账、司机收入提现。
- 地图选点、导航、实时定位、轨迹回放。
- 推送通知、IM、客服聊天。
- 完整运营后台、权限矩阵、报表统计。
- 真实 S3/OSS 生产凭证接入、CDN、病毒扫描、缩略图流水线。
- KMS、密钥轮换、access token 黑名单、全量审计风控。

这些都重要，但不是这一轮。现在先把已经半截的链路补成能验收的闭环。

## Architecture

### PostgreSQL Acceptance

数据库验收继续放在 `apps/api/scripts/verify-postgres.js` 和 `apps/api/scripts/seed-stage-1.js` 周边，不另起一套脚本体系。

验收分三层：

- `doctor`: 检查 Docker CLI、数据库连接、migration 状态，并给出下一步动作。
- `deploy/seed`: 对真实 PostgreSQL 部署 migration 并写入阶段数据。
- `smoke/bootstrap`: 用真实 Prisma Client 创建或读取关键业务数据，覆盖认证、订单和司机认证。

脚本必须保持幂等，失败要输出具体原因。不能来一句“数据库异常”就完事，那跟售后说“你再试试”一个味儿。

### File Storage Boundary

文件模块新增存储 provider 抽象，服务层只依赖接口：

- `createUploadIntent(input)`
- `markUploaded(input)`
- `createPreview(input)`
- `getPreviewMetadata(input)`

第一片 provider：

- `local`: 开发和测试默认 provider。
- `external-compatible`: 保留 S3/OSS 风格的配置校验和 URL 生成接口，但不要求真实云账号。

现有 `FileObject` 仍是文件事实表。上传 provider 只负责上传/预览能力，不接管业务归属关系。

### Admin Web Console

审核台优先做成独立、轻量、可构建的前端入口，复用现有 admin API：

- 登录态第一片可以使用手动填入 admin access token 或复用现有平台 token 存储。
- 页面只处理司机认证审核，不做通用后台导航。
- API 调用集中到单独 client，避免页面里到处散落 `fetch`。
- 页面状态分为 loading、empty、error、list、detail、reviewing。

如果现有依赖不适合快速搭 Web 页面，则用 Nest 静态 HTML 页面作为第一片，保持最少依赖、可测试和可运行。

## Data Flow

### PostgreSQL

1. 开发者提供 Docker Desktop 或真实 `DATABASE_URL`。
2. 运行 `db:postgres:doctor` 诊断连接和 migration。
3. 运行 `db:postgres:bootstrap`。
4. `bootstrap` 串行执行 migration deploy、seed 和 smoke。
5. 文档记录通过结果；若失败，保留失败原因和下一步。

### File Upload

1. 移动端或 Web 审核台请求 `POST /files/upload-intents`。
2. API 校验用途、文件名、类型、大小和当前用户。
3. 文件服务调用 storage provider 创建上传能力。
4. API 写入 `FileObject` 为 `pending` 并返回上传信息。
5. 客户端上传完成后调用 `POST /files/{fileId}/uploaded`。
6. API 校验当前用户和文件状态后标记为 `uploaded`。
7. 预览入口基于 `objectKey`、签名和过期时间返回文件元数据。

### Certification Review

1. admin 打开审核台，输入或复用 admin access token。
2. 页面拉取 `GET /admin/driver-certifications`。
3. admin 选择司机认证记录。
4. 页面拉取附件和审核事件。
5. admin 对实名或车辆认证提交通过/驳回。
6. 后端写入认证状态和审核事件。
7. 页面刷新该司机快照和审核事件。

## Error Handling

- 数据库不可达：脚本返回非 0，并输出 Docker、连接串、Prisma `P1001` 等具体诊断。
- 上传 provider 配置错误：API 启动或请求边界返回明确配置错误，不吞成通用 500。
- 文件状态非法：继续使用 `FILE_STATE_INVALID`。
- 文件归属非法：继续使用 `FILE_NOT_FOUND` 或既有业务错误，避免泄露他人文件。
- 预览签名错误或过期：返回签名非法/过期错误。
- admin token 缺失：审核台显示需要登录或填写 token，不循环重试。
- admin 权限不足：API 返回 `AUTH_FORBIDDEN`，页面显示无权限。
- 审核提交失败：页面保留当前记录和输入，展示可重试错误。

## Testing

本阶段按风险分层测试：

- PostgreSQL 脚本：
  - 单元测试覆盖诊断输出、命令拼接、失败提示和 bootstrap 顺序。
  - 真实库验收只在 Docker/PostgreSQL 可用时执行，并把结果写入状态文档。

- 文件上传：
  - API validation 测试：用途、文件名、content type、大小、preview 参数。
  - provider 测试：local provider 上传意图和预览 URL 生成。
  - service/controller 测试：上传意图、确认 uploaded、预览元数据、非法状态。
  - 移动端 adapter 测试：请求归一化、错误映射、无 bearer 行为。

- Web 审核台：
  - API client 测试：队列、附件、审核、事件接口。
  - UI 测试：空态、错误态、列表、详情、通过、驳回、审核事件展示。
  - 构建/类型检查：保证页面能独立构建或随 API 构建通过。

最终核验命令：

- `npm test -- --runInBand`
- `npx tsc --noEmit`
- `npm run lint`
- `npm --prefix apps/api test`
- `npm --prefix apps/api run typecheck`
- `npm --prefix apps/api run lint`
- `npm --prefix apps/api run prisma:validate`
- `npm run api:build`
- `npm --prefix apps/api run db:postgres:doctor`
- `npm --prefix apps/api run db:postgres:bootstrap`，仅在 PostgreSQL 可达时要求通过。

## Completion Criteria

阶段 2 完成必须同时满足：

- 状态文档更新到阶段 2，清晰列出已实现、半成品、未开发和环境阻塞。
- PostgreSQL 验收路径有可执行证据；如果本机环境仍缺 Docker/PostgreSQL，必须保留真实失败输出和修复步骤。
- 文件上传模块有明确 storage provider 边界，local provider 第一片可测，现有文件 API 不回退。
- 司机认证审核台可以完成队列查看、附件预览、通过/驳回和审核事件查看。
- OpenAPI、README 或平台文档同步更新。
- 全量测试、类型、lint、Prisma validate 和 API build 通过。
- 不声称支付、地图、IM、推送、资金结算或完整运营后台已经完成。

## Self Review

- 占位扫描: clear.
- Scope check: 本设计只覆盖 PostgreSQL 验收、文件上传第一片和司机认证审核台，不混入支付、地图、IM、推送和资金结算。
- Consistency check: 本设计承接阶段 1 已完成的认证、订单、文件元数据和司机认证 API，不推翻现有模块边界。
- Ambiguity check: 真实云对象存储只保留 provider 形状，不作为本阶段必须具备的外部依赖；真实 PostgreSQL 通过取决于环境，不能伪造通过。
