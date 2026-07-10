# S3 Upload Confirmation Validation Design

## Goal

在 S3 兼容 provider 第一片基础上，补上上传确认前的远端对象校验：客户端调用 `POST /files/{fileId}/uploaded` 时，API 先对 S3 兼容对象做签名 `HEAD` 检查，确认对象存在、大小和 content type 与上传意图一致，再把文件状态改成 `uploaded`。

这不是对象存储 webhook。现在先堵住“客户端嘴上说传完了，服务端就信了”的坑，后续再补真正的回调验签和异步审计。

## Scope

### In Scope

- 给 `FileStorageProvider` 增加 `verifyUploadedFile(file)`。
- `LocalFileStorageProvider` 保持 no-op，兼容本地开发和旧确认路径。
- `S3CompatibleFileStorageProvider` 用 AWS Signature V4 风格签名 `HEAD` URL 读取远端对象元数据。
- 校验远端 `content-length` 等于 `FileObject.byteSize`。
- 校验远端 `content-type` 主类型等于 `FileObject.contentType`。
- `FilesService.confirmUploaded()` 在标记 uploaded 前调用 provider 校验。
- 校验失败时返回 `FILE_STATE_INVALID`，文件保持 `pending`。

### Out of Scope

- 不做对象存储 webhook 回调。
- 不做异步任务队列。
- 不保存 ETag、versionId 或扫描状态。
- 不改 Prisma schema。
- 不做真实 S3/MinIO 联调验收。

## Testing

- Provider 测试覆盖 S3 签名 `HEAD` 请求和远端元数据不匹配。
- Service 测试覆盖确认前调用 provider 校验，失败时保持 pending。
- Focused 文件模块和 API 全量测试作为回归门槛。

## Completion Criteria

- `npm --prefix apps/api test -- file-storage.provider` 通过。
- `npm --prefix apps/api test -- files.service` 通过。
- `npm --prefix apps/api test -- files` 通过。
- API typecheck、lint、build 通过。
- 文档明确仍未实现 webhook、真实桶验收、病毒扫描和缩略图。
