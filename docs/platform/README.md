# 完整货运平台工程说明

当前仓库从 React Native 货主端本地 MVP 起步，完整平台按移动端、后端、后台和第三方能力分阶段演进。

## 阶段 1 当前基线

- 移动端与 API 自动检查最近一次通过：移动端 30 个 Jest suite / 524 个测试，API 37 个 Jest suite / 275 个测试，同时 TypeScript、ESLint、Prisma validate 和 API build 通过。
- PostgreSQL doctor 仍受环境阻塞：当前机器没有 Docker CLI，默认 `localhost:5432` PostgreSQL 不可达，`db:postgres:doctor` 返回 Prisma `P1001`。
- Driver execution first slice 已实现：司机订单大厅、报价、接单、当前司机执行订单列表/详情和 `loading -> transporting -> confirming` 状态推进已经有后端、移动端 adapter、UI、OpenAPI 和测试覆盖。
- 下一步计划是 driver/vehicle certification first slice：先补司机认证和车辆认证地基，再继续真实上传、支付、地图、推送、IM 和后台。

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
- 阶段 1：NestJS 后端骨架、认证接口、token/refresh token/register/logout/me 边界、移动端 API adapter。

阶段 0/1 不实现司机端、后台、地图、支付、推送、上传真实直传和 IM。

当前 `apps/api` 的认证仍不是生产级短信或完整设备会话管理。认证服务已有内存用户仓储、PrismaAuthRepository、`PrismaVerificationCodeStore`、可替换验证码发送器、`PrismaService`/`PrismaModule`、AuthModule 注入链路和阶段 1 初始 Prisma migration SQL；API 启动入口已在创建 Nest app 前实际调用 `parseEnv` 校验环境变量，并使用解析后的 `PORT` 监听；验证码登录、验证码注册和密码登录都会创建/复用手机号用户、签发 access/refresh token，并保存当前设备 refresh session，验证码注册会把注册密码经 `scrypt` 加随机盐后写入 `User.passwordHash`，`/auth/password-login` 会按手机号读取用户、校验 `passwordHash` 并在失败时统一返回 `AUTH_PASSWORD_INVALID`，`/auth/reset-password` 会校验 `reset` 用途验证码并用 `scrypt` 写入新密码 hash，成功后不自动签发 token，失败时返回 `AUTH_PASSWORD_RESET_INVALID` 或验证码错误，`/auth/reset-password` 和 `/auth/change-password` 成功改写密码后会撤销该用户全部仍 active 的 refresh session，避免旧设备继续用旧 refresh token 续期；退出登录会使对应 refresh session 失效，刷新 token 时会撤销旧 refresh session 并保存新的 opaque refresh token session，refresh token 不再包含用户 ID 或 TTL，请求边界和 `TokenService` 内部过期时间计算都只接受当前签发的 `refresh.<UUID>` 形态并拒绝旧语义化 refresh token，Prisma 仓储会以 SHA-256 hash 存储 refresh session、查询 active session 并撤销 session，`AuthSession` migration 已补 `refreshTokenHash + deviceId + revokedAt + expiresAt` 复合索引用于 active session 查询。access token 已升级为 HS256 JWT，包含 `sub`、`type`、`iat` 和 `exp`，`/me` 已接入阶段 1 `AccessTokenGuard`，只接受单个严格 `Bearer <token>` header，可解析当前用户并校验签名和过期时间，同时 access token 错误会返回独立业务错误码；`AuthModule` 已读取 `JWT_ACCESS_SECRET`、`ACCESS_TOKEN_TTL_SECONDS`、`REFRESH_TOKEN_TTL_SECONDS` 和 `VERIFICATION_CODE_TTL_SECONDS`，production 只要求 access JWT secret，已移除废弃的 `JWT_REFRESH_SECRET` 强依赖；生产环境缺失 access token secret、使用开发示例 JWT secret 或使用少于 32 字符的 JWT secret 都会直接拒绝启动；验证码策略已按环境切换，非生产保留固定 `devCode` 方便本地联调，生产环境生成随机 6 位验证码且不在响应里回传 `devCode`，验证码有效期可通过 `VERIFICATION_CODE_TTL_SECONDS` 配置且默认 300 秒，验证码发送记录会写入 `VerificationCode` 表且只保存 `codeHash`，发送会经过 `VerificationCodeSender`，`parseEnv` 已覆盖 `SMS_PROVIDER`、`SMS_WEBHOOK_URL`、`SMS_WEBHOOK_TOKEN` 和 `SMS_WEBHOOK_TIMEOUT_MS` 校验，生产环境缺少短信 provider、配置非 HTTPS webhook、webhook token 少于 16 字符或设置非法 timeout 都会在启动前拒绝，webhook 请求会使用 `SMS_WEBHOOK_TIMEOUT_MS` 超时控制且默认 5000ms，sender 失败会返回 `AUTH_CODE_DELIVERY_FAILED` 和 HTTP 502，并撤销本次未送达验证码，`VerificationCode` migration 已补 active/latest 查询索引和发送频控索引，服务端已加 60 秒重发冷却、同手机号同用途 1 小时 5 次发送上限、`AUTH_CODE_RATE_LIMITED` 限流错误码和 HTTP 429，以及 `AUTH_CODE_EXPIRED` 过期错误码；认证成功响应和业务错误响应都会透传请求头 `x-request-id` 到响应体 `requestId`，未传时回退 `req_local`；阶段 1 OpenAPI 已同步验证码限流响应、发送失败响应、`refresh.<UUID>` schema、`/me` bearer 保护边界、`/auth/register` 验证码注册和密码字段边界、`/auth/password-login` 密码登录边界、`/auth/reset-password` 密码重置边界、`/auth/change-password` 登录后改密边界、认证相关成功响应的 `OK` envelope、用户、token、logout、reset 和 change password 结果 schema、可选 `x-request-id` header，并把 server 对齐到 Nest 全局前缀 `http://localhost:3000/api`。migration 结构测试已覆盖阶段 1 枚举、表、索引和外键，PostgreSQL 验收入口、阶段 1 seed、认证冒烟检查、测试库隔离策略和本地 PostgreSQL Compose 入口已补；当前环境没有可用 Docker CLI，`localhost:5432` 也不可达，所以真实库启动和迁移验收还没通过。移动端 `AuthScreen` 已支持注入平台 adapter 走验证码发送、验证码登录、密码登录、密码找回和注册接口，平台模式登录页会显示“验证码登录/密码登录”切换，本地演示模式仍只保留验证码登录；平台注册会把密码传给 `/auth/register`，平台密码登录会通过 `passwordLogin()` 调用 `/auth/password-login`，平台密码找回会发送 `reset` 用途验证码并通过 `resetPassword()` 调用 `/auth/reset-password`，成功后回到密码登录且不自动签发本地认证状态，平台认证 adapter 也已暴露 `changePassword()` 通过 bearer access token 调用 `/auth/change-password` 修改当前登录用户密码，设置页在平台 adapter 可用时会复用现有登录密码表单调用该接口、成功后更新本地密码更新时间，并把 `AUTH_PASSWORD_INVALID` 映射为“当前密码错误”；平台验证码会使用 `sendCode` 返回的 `expireSeconds` 更新本地验证码会话过期时间，注入后页面说明会标明登录和注册已接入平台认证接口，并会把 `AUTH_CODE_DELIVERY_FAILED`、`AUTH_CODE_RATE_LIMITED`、`AUTH_PASSWORD_INVALID`、`AUTH_PASSWORD_RESET_INVALID` 和 `NETWORK_ERROR` 映射成明确中文提示；根 `App` 已支持通过 `platformApiBaseUrl`、构建前生成的 `platformBuildConfig` 或 `globalThis.__TRUCK_PLATFORM_CONFIG__.apiBaseUrl` 创建平台认证 adapter 并注入认证页和设置页改密入口，平台认证成功后会把后端返回的 `user.phone` 回填到个人中心账号资料本地快照，运行时 baseUrl 会 trim 并去掉尾部 `/`，`platformApiClient` 自身也会规范化 baseUrl/path 拼接，可通过 `getRequestId` 为请求注入 `x-request-id`，并已支持按接口关闭 bearer 注入，验证码、登录、注册、找回、refresh 和 logout 不会携带过期或无关 access token；冷启动时会用已保存的 refreshToken 调 `/auth/refresh` 更新 token 快照，并在 access token 可用时调用 `/me` 回填当前用户手机号；`/me` 网络失败或临时接口异常不会阻塞恢复本地未过期会话，`AUTH_ACCESS_TOKEN_INVALID` 或 `AUTH_USER_DISABLED` 会清理本地会话回到认证页，默认 App 仍保留本地演示登录；`platformApiClient` 会把非 2xx 错误、2xx 业务错误、网络失败和无效成功 envelope 都映射成带 `code`、`status` 和 `requestId` 的错误对象，其中网络失败为 `NETWORK_ERROR`/`status: 0`，无效响应为 `PLATFORM_RESPONSE_INVALID`；`platform:config:write` 可用 `TRUCK_PLATFORM_API_BASE_URL` 在构建前生成 JS 运行时配置，Android `preBuild`、iOS shared scheme 和 GitHub Actions 验证流水线已自动挂载生成脚本；业务错误已接入统一响应过滤器，认证请求已通过可复用 `ZodValidationPipe` 在 Nest 请求体边界做 zod 校验；生产级账号恢复风控仍未实现；具体短信供应商模板/签名/回执/重试、Redis/IP/设备维度分布式风控、密钥管理系统/KMS、密钥轮换、正式发布流水线、覆盖全业务模块的 DTO 校验策略、真实设备会话风控、access token 黑名单和真实审计日志仍待补。

内存认证仓储已按 `User.phone` 唯一语义对齐 Prisma 仓储：同一手机号重复登录会复用同一个本地用户 ID，并在切换 `shipper`/`driver` 移动角色时更新该用户的 `userType`，避免本地测试仓储和真实 PostgreSQL 仓储出现账号语义分叉。

`/me` 当前用户查询已收紧 access token 边界：即使 JWT 签名和过期时间校验通过，如果 `sub` 对应用户无法从认证仓储读取，也会返回 `AUTH_ACCESS_TOKEN_INVALID`，不再用 `local-user-` 前缀兜底拼出默认 `shipper` 用户。

`/auth/refresh` 已补用户存在性校验：active refresh session 只能证明 refresh token 与设备会话仍有效，不能替代用户表状态；如果 session 对应用户已不存在，刷新会撤销该 refresh session，返回 `AUTH_REFRESH_TOKEN_INVALID`，不会继续签发新的 access/refresh token。

认证链路已开始使用 `User.status`：Prisma 仓储会把 `active`/`disabled` 映射到内部用户记录；禁用用户不能登录、不能通过 refresh 继续签发 token，也不能通过 `/me` 读取当前用户，统一返回 `AUTH_USER_DISABLED` 和 HTTP 403；refresh 命中禁用用户时会撤销该 active refresh session。

移动端 `AuthScreen` 已把平台登录返回的 `AUTH_USER_DISABLED` 映射为“账号已禁用，请联系客服处理”，避免用户在登录页看到后端原始错误文案。

根 `App` 冷启动时会用本地保存的 refreshToken 调 `/auth/refresh` 换取新 token，再用 `/me` 校验并回填当前用户；网络失败或临时接口异常不会立刻清理本地未过期会话，仍可恢复首页，只有 `AUTH_REFRESH_TOKEN_INVALID`、`AUTH_ACCESS_TOKEN_INVALID` 或 `AUTH_USER_DISABLED` 这类明确认证失效/禁用错误会清理本地会话回到认证页。

根 `App` 在平台认证 adapter 可用且本地会话保存了 `refreshToken` 时，退出登录会先尝试调用平台 `/auth/logout` 撤销当前设备 refresh session，再清理本地会话并返回认证页；本地退出不会等待网络成功才切页。

文件上传地基已补第一片：后端新增 `FilesModule`，复用已有 `FileObject` 表，`POST /files/upload-intents` 会校验文件用途、文件名、content type 和大小，为当前用户创建 `pending` 文件对象，并返回对象 key、上传 URL 占位、可选 public URL 和 15 分钟过期时间；`POST /files/{fileId}/uploaded` 只允许当前用户把自己的 `pending` 文件确认成 `uploaded`，跨用户确认返回 `FILE_NOT_FOUND`，非 pending 状态返回 `FILE_STATE_INVALID`。文件用途已覆盖 `identity/cargo/exception/evaluation/receipt/invoice`，移动端 `platformFileApi` 会在发请求前拦截非法用途、空文件名、不支持的 content type、超过 10MB 的文件、空文件 ID 和非法 public URL；根 `App` 已把该 adapter 注入发单页、个人中心认证页和订单详情页，发单货物图片、实名认证身份证正反面、企业认证营业执照、订单异常图片和订单评价图片在平台模式下会先创建上传意图、再确认文件为 `uploaded`，并把 `fileId/fileName/purpose/status/objectKey/publicUrl` 保存进本地业务快照。这个第一片仍只是文件元数据与状态流转、发单/认证表单文件引用和订单详情本地文件引用，不包含真实 S3/OSS 直传签名、二进制上传、服务端回调校验、病毒扫描、访问权限、缩略图、后端认证审核附件绑定、订单事件附件绑定、订单主体附件绑定和清理任务；后续发票文件和后台审核附件展示都应复用这条文件地基继续接。

货主订单第一片真实化已经接入移动端平台订单 adapter：发单成功会保存平台订单号用于 UI 展示，同时保留后端订单主键 `platformOrderId` 用于 `/shipper/orders/{orderId}` 详情查询；平台发单失败时会保留本地待同步订单，详情页订单同步队列点击重试会重新 `POST /shipper/orders` 创建平台订单，成功后用平台订单号、后端主键和已同步状态替换本地订单，失败则继续保留本地失败队列；待接单平台订单编辑已新增 `PUT /shipper/orders/{orderId}`，后端只允许当前货主自己的 `waiting` 订单直接修改，非法状态返回 `409 ORDER_STATE_INVALID`，移动端编辑平台订单时会调用该接口，成功后用后端订单回写本地，失败时保留本地修改并标记同步失败，详情页订单同步队列点击重试会重新 `PUT /shipper/orders/{orderId}` 更新原平台订单，成功后用后端订单回写本地；平台订单取消已新增 `POST /shipper/orders/{orderId}/cancel`，后端会把货主自己的非完成/非已取消订单更新为 `cancelled` 并追加 `cancelled` 事件，非法状态返回 `409 ORDER_STATE_INVALID`，移动端详情页取消平台订单时会调用该接口，成功后用后端订单回写本地并保留本地取消原因卡，失败时保留本地取消记录并标记同步失败，详情页订单同步队列点击重试会重新 `POST /shipper/orders/{orderId}/cancel` 取消原平台订单；平台订单状态推进已新增 `POST /shipper/orders/{orderId}/status`，后端只允许当前货主自己的订单按 `waiting -> loading -> transporting -> confirming` 顺序推进，非法跳转返回 `409 ORDER_STATE_INVALID`，成功后追加 `status_changed` 事件，移动端详情页本地状态操作会调用该接口，失败时保留本地状态变更并标记同步失败，详情页订单同步队列点击重试会重新 `POST /shipper/orders/{orderId}/status` 推进原平台订单；平台确认送达已新增 `POST /shipper/orders/{orderId}/complete`，后端只允许当前货主自己的 `confirming` 订单完成，成功后更新为 `completed` 并追加 `completed` 事件，非法状态返回 `409 ORDER_STATE_INVALID`，移动端详情页确认送达时会调用该接口，成功后用后端完成态订单回写本地，失败时保留本地完成记录并标记同步失败，详情页订单同步队列点击重试会重新 `POST /shipper/orders/{orderId}/complete` 完成原平台订单；平台异常上报已新增 `POST /shipper/orders/{orderId}/exception`，后端只允许当前货主自己的 `transporting` 或 `confirming` 订单追加 `exception_reported` 事件，移动端详情页提交异常时会调用该接口，失败时保留本地异常记录并标记同步失败，详情页订单同步队列点击重试会重新上报原平台订单异常；非待接单改单申请第一片已新增 `POST /shipper/orders/{orderId}/change-request`，后端只允许当前货主自己的 `loading`、`transporting` 或 `confirming` 订单追加 `change_requested` 事件，不改订单主体或状态，`waiting` 订单仍走 `PUT /shipper/orders/{orderId}` 直接编辑，移动端详情页提交修改申请时会调用该接口，失败时保留本地修改申请并标记同步失败，详情页订单同步队列点击重试会重新提交原平台订单修改申请；平台评价提交已新增 `POST /shipper/orders/{orderId}/evaluation`，后端只允许当前货主自己的 `completed` 订单追加 `evaluation_submitted` 事件，移动端详情页提交评价时会调用该接口，失败时保留本地评价记录并标记同步失败，详情页订单同步队列点击重试会重新提交原平台订单评价；打开平台订单详情时会用该主键刷新详情并回写本地运行态，接口失败时继续展示已有本地详情，并把该订单同步状态标记为失败。移动端列表 adapter 已支持 `status/statuses/page/pageSize/keyword/createdFromIso/createdToIso` 查询参数，首页精确状态卡会把可直连的订单状态传给后端列表接口，订单列表页搜索、时间和状态筛选变更也会触发平台列表查询；`active` 会用 `statuses=loading,transporting` 查询后端状态集合，本地筛选继续作为离线和接口失败兜底。列表页会根据平台返回的 `total/page/pageSize` 展示已加载数量，并通过“加载更多”继续请求下一页后追加到本地运行态；列表刷新失败会保留本地订单并在订单列表展示本地提示。后端列表搜索覆盖订单号、货物、装卸地址、联系人、电话和车型要求文本，创建时间筛选使用 `createdFromIso` 包含、`createdToIso` 不包含的半开区间。改单客服审核、费用重算、退款差额、司机确认、真实司机端接单/装货/送达确认、真实异常图片上传、异常客服处理、真实评价图片上传、评价中心后端记录、司机回复、真实支付结算、托管放款、违约金/退款和客服审核仍未接入。

发单草稿真实化第一片已经接到移动端保存和恢复动作：新增 `OrderDraft` 表和 `GET/PUT /shipper/order-draft`，当前货主最多保存一份 JSONB 草稿快照，可记录移动端 `clientUpdatedAtIso` 并返回服务端 `updatedAtIso`；`PUT /shipper/order-draft` 已支持 `baseUpdatedAtIso` 乐观并发基线，服务端发现当前草稿版本与客户端基线不一致时会返回 `409 ORDER_DRAFT_CONFLICT` 且不覆盖草稿；移动端在平台 adapter 可用时，点击“保存草稿”会调用 `PUT /shipper/order-draft` 同步当前本地草稿，并在本地同步状态中保留已知服务端 `platformUpdatedAtIso`，后续保存会带 `baseUpdatedAtIso`；普通发单入口会调用 `GET /shipper/order-draft` 拉取服务端草稿，服务端更新时间更新时回填本地草稿，失败时保留本地草稿和失败同步状态；草稿同步失败队列在平台 adapter 和 access token 可用时，点击重试会重新 `PUT /shipper/order-draft`，成功后才清空本地队列，失败则继续保留失败状态；保存或重试收到 `409 ORDER_DRAFT_CONFLICT` 时，移动端会自动再 `GET /shipper/order-draft` 拉取最新服务端草稿，保留当前本地输入，并进入现有字段级冲突 UI；当服务端存在较旧草稿且本地草稿更新时，移动端会保留本地草稿并提示服务端草稿未覆盖，可查看字符串字段、枚举字段、数组字段、数值字段和随车要求布尔字段差异并单独采用服务端字段，全部差异字段处理完后会自动收敛冲突操作区，也可选择合并服务端缺失字段、保留本地草稿并覆盖服务端，或手动切换为服务端草稿。后端 `GET /shipper/order-draft` 已把超过 24 小时未更新的草稿视为无草稿并返回 `data: null`；冲突审计、强制覆盖语义、真实多端并发收敛验收和真实 PostgreSQL 验收还没有接入。

个人中心常用地址/联系人后端同步第一片已经接到移动端增删改和进入页恢复动作：新增 `ShipperAddressBook` 表和 `GET/PUT /shipper/profile/address-book`，当前货主保存一份 `addresses`、`contacts` JSONB 快照，可记录移动端 `clientUpdatedAtIso` 并返回服务端 `updatedAtIso`；后端只负责当前货主自己的地址簿快照，不同步实名认证、企业认证、优惠券、发票、设置、账号安全或其它个人中心资料。移动端在平台 adapter 可用时，进入个人中心会调用 `GET /shipper/profile/address-book` 拉取服务端地址簿并回填本地常用地址/联系人，服务端没有地址簿时保留本地资料；本地地址簿同步状态为 `pending` 或 `failed` 时会跳过进入页拉取覆盖，避免把本地未提交资料冲掉。常用地址和常用联系人新增、编辑、删除会调用 `PUT /shipper/profile/address-book` 保存完整地址簿，后续保存会带已知服务端 `baseUpdatedAtIso`；服务端发现当前地址簿版本与客户端基线不一致时返回 `409 PROFILE_ADDRESS_BOOK_CONFLICT` 且不覆盖地址簿，移动端会保留本地常用地址/联系人并进入资料同步失败队列，同时自动再 `GET /shipper/profile/address-book` 拉取最新服务端地址簿，只更新同步状态里的 `platformUpdatedAtIso`、服务端摘要和可采用的服务端地址/联系人条目，不直接覆盖本地地址簿；资料同步卡会展示类似 `服务端地址簿：服务端新仓` 的摘要，允许逐项采用服务端新增地址/联系人到本地列表，并支持同 ID 常用地址的名称、详细地址、联系人、标签字段，以及同 ID 常用联系人的姓名、角色、电话、备注字段逐项采用服务端值；当已知服务端旧地址或旧联系人在最新地址簿中消失时，也会展示 `服务端已删除地址` / `服务端已删除联系人` 冲突项，允许采用服务端删除并只移除该旧条目，保留本地新增条目。失败队列点击重试时，只有 `operation: addressBook` 的同步状态会重新调用平台地址簿 API，昵称、头像、密码、隐私确认等本地资料不会误打地址簿接口；地址簿冲突重试会用最新服务端 `updatedAtIso` 作为 `baseUpdatedAtIso`，以当前本地地址簿覆盖平台。当前还没有完整三方合并、跨设备收敛验收和真实 PostgreSQL 验收。

同一用户在同一 `deviceId` 再次登录时，会在保存新 refresh session 前撤销该用户该设备上仍 active 的旧 refresh session，避免同设备重复登录后多个 refresh token 同时可用；密码重置和登录后改密成功时会撤销该用户全部仍 active 的 refresh session，避免旧设备继续用旧 refresh token 续期；`AuthSession` migration 已补 `userId + deviceId + revokedAt` 复合索引支撑同设备撤销路径，也已补 `userId + revokedAt` 索引支撑按用户撤销全部 active refresh session。这只是阶段 1 的 refresh session 收敛，不等于完整多端设备管理、access token 黑名单、设备下线审计或 token 族风险识别策略。

## PostgreSQL 验收策略

- `npm --prefix apps/api run db:postgres:status`：使用 `DATABASE_URL` 对真实 PostgreSQL 执行 `prisma migrate status`，未提供时默认使用 `postgresql://truck:truck@localhost:5432/truck_platform`，用于连接和迁移状态验收。
- `npm --prefix apps/api run db:postgres:doctor`：非破坏性诊断本机阶段 1 数据库验收条件，检查 Docker CLI、目标 `DATABASE_URL` 和 Prisma migration status，并输出下一步建议。
- `npm --prefix apps/api run db:postgres:deploy`：使用 `DATABASE_URL` 执行 `prisma migrate deploy`，未提供时默认使用本地 `truck_platform`，只应在明确要部署 migration 的环境运行。
- `npm --prefix apps/api run db:dev:postgres:up`：使用 `apps/api/docker-compose.postgres.yml` 启动本地 PostgreSQL，要求本机安装 Docker CLI 或 Docker Desktop。
- `npm --prefix apps/api run db:dev:postgres:down`：停止本地 PostgreSQL Compose 服务，保留数据卷。
- `npm --prefix apps/api run db:postgres:bootstrap`：串行执行 migration deploy、阶段 1 seed、认证冒烟检查和订单创建/列表/详情冒烟检查。
- `npm --prefix apps/api run db:test:postgres:status`：使用 `TEST_DATABASE_URL` 检查测试库迁移状态。
- `npm --prefix apps/api run db:test:postgres:doctor`：对 `TEST_DATABASE_URL` 执行同样的非破坏性诊断，并继续校验测试库不能与业务库共用。
- `npm --prefix apps/api run db:test:postgres:deploy`：使用 `TEST_DATABASE_URL` 部署测试库 migration。
- `npm --prefix apps/api run db:postgres:seed`：使用 `DATABASE_URL` 写入阶段 1 演示货主和基础货主资料，未提供时默认使用本地 `truck_platform`。
- `npm --prefix apps/api run db:test:postgres:seed`：使用 `TEST_DATABASE_URL` 写入测试库阶段 1 演示数据。
- `npm --prefix apps/api run db:postgres:auth-smoke`：使用 `DATABASE_URL` 检查数据库连通性和阶段 1 认证演示用户，未提供时默认使用本地 `truck_platform`。
- `npm --prefix apps/api run db:test:postgres:auth-smoke`：使用 `TEST_DATABASE_URL` 对测试库执行同样的认证冒烟检查。
- `npm --prefix apps/api run db:postgres:order-smoke`：使用 `DATABASE_URL` 创建一笔货主订单，并检查订单列表、订单详情和订单事件记录能从真实库读回。
- `npm --prefix apps/api run db:test:postgres:order-smoke`：使用 `TEST_DATABASE_URL` 对测试库执行同样的订单冒烟检查。
- 测试库脚本要求 `TEST_DATABASE_URL` 存在，且不能与 `DATABASE_URL` 相同，避免把测试迁移和测试数据打到业务库里。

当前仓库已经有可执行的 PostgreSQL 验收入口、阶段 1 种子数据、认证冒烟检查、订单冒烟检查、本地 PostgreSQL Compose 文件、测试库隔离策略和 `db:postgres:doctor` 诊断入口；`.env.example` 已给出 `DATABASE_URL` 与 `TEST_DATABASE_URL` 示例，API 环境配置会要求 `DATABASE_URL` 使用 `postgresql://` 连接串。真实连接是否通过取决于本机或 CI 是否提供可用 PostgreSQL、Docker CLI 和对应环境变量。

## 目录规划

- `apps/api`：NestJS 后端服务。
- `src/services`：React Native 端 API client 和 adapter。
- `docs/platform`：平台级架构、ERD、OpenAPI 和迁移说明。
- `docs/superpowers/specs`：已批准设计规格。
- `docs/superpowers/plans`：可执行实施计划。
