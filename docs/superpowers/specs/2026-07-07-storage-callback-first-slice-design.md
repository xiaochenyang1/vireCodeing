# Storage Callback First Slice Design

## Goal

补上对象存储上传完成回调第一片：S3 兼容存储或网关在对象上传完成后调用 API，API 通过共享密钥 HMAC 验签，确认回调描述的文件仍处于 `pending`，并把文件标记为 `uploaded`，同时保存对象元数据 `etag` 和 `versionId`。

这片解决的是“上传完成状态可以由服务端可信回调确认”，不是完整云厂商事件适配平台。

## Scope

### In Scope

- 新增公开路由 `POST /files/storage-callbacks/s3-compatible`。
- 回调 body 包含 `fileId`、`objectKey`、`byteSize`、`contentType`、可选 `etag`、可选 `versionId` 和 `signature`。
- 使用 `FILE_STORAGE_CALLBACK_SIGNING_SECRET` 计算 HMAC-SHA256 签名。
- 签名串按 `fileId/objectKey/byteSize/contentType/etag/versionId` 用换行连接。
- 缺少 callback signing secret 时拒绝回调，不使用硬编码默认密钥。
- 回调必须匹配已有文件 ID 和 object key。
- 文件必须仍是 `pending` 且上传意图未过期。
- 回调的 `byteSize` 和 `contentType` 必须与上传意图一致。
- 确认成功时保存 `etag` 和 `versionId`，并把文件状态改为 `uploaded`。
- 同一份有效回调重复到达时按幂等处理：如果已上传文件的对象 key、大小、content type 和对象元数据与回调兼容，则返回当前 uploaded 文件，不把对象存储重试误判成业务失败。
- Prisma schema 和 migration 增加 `FileObject.etag` / `FileObject.versionId` 可空字段。

### Out of Scope

- 不适配 AWS S3、OSS、COS 或 MinIO 的原生事件 JSON。
- 不做异步重试、死信队列、事件幂等审计表或后台补偿任务。
- 不做病毒扫描、缩略图、CDN 刷新或对象清理任务。
- 不做真实 MinIO/云桶联调验收；当前机器仍缺 Docker/PostgreSQL 环境。

## Error Handling

- 签名无效或未配置 signing secret：`FILE_STORAGE_CALLBACK_INVALID`。
- 文件不存在或 object key 不匹配：`FILE_NOT_FOUND`。
- 文件非 `pending`、上传意图过期或元数据不一致：`FILE_STATE_INVALID`。
- 已上传文件收到重复且匹配的回调：返回当前文件记录，保持 `uploaded`。

## Testing

- validation 测试覆盖 callback body 规范化和非法输入拒绝。
- controller 测试覆盖公开 callback 路由不需要 bearer guard。
- service 测试覆盖合法回调保存对象元数据、重复匹配回调幂等、非法签名拒绝、缺少 signing secret 拒绝。
- repository/migration 测试覆盖 `etag` 和 `versionId` 持久化字段。
- env 测试覆盖 production 必须配置强 `FILE_STORAGE_CALLBACK_SIGNING_SECRET`。

## Completion Criteria

- `npm --prefix apps/api test -- files` 通过。
- `npm --prefix apps/api test -- env` 通过。
- `npm --prefix apps/api test -- prisma-migration` 通过。
- API typecheck、lint、Prisma validate、全量 Jest 和 API build 通过。
- 文档明确仍缺真实桶验收、云厂商事件格式适配、异步重试、病毒扫描和缩略图。
