# S3 Compatible File Storage First Slice Design

## Goal

把现有文件上传从本地 provider 第一片推进到 S3 兼容对象存储第一片，让 API 能在不改业务表和移动端主流程的前提下，按环境切换本地存储或 S3 兼容上传签名。

这不是完整生产附件系统。病毒扫描、缩略图、对象存储回调、CDN 刷新、KMS 和完整附件治理不塞进这一片，项目现在还没到一口吃全家桶的时候。

## Current Evidence

当前代码已经具备：

- `FilesService` 通过 `FileStorageProvider` 创建上传目标和公开 URL。
- `LocalFileStorageProvider` 支持本地上传 URL、本地落盘和本地预览内容读取。
- `FileObject` 已作为文件事实表，业务模块通过 `fileId` 校验 owner、status 和 purpose。
- 移动端 `platformFileApi` 已消费 `uploadUrl`，并对本地上传目标有兼容确认路径。
- 文档已明确真实 S3/OSS 直传签名、回调、病毒扫描、缩略图仍未完成。

## Scope

### In Scope

- 新增 `FILE_STORAGE_PROVIDER=local|s3-compatible` 配置。
- 新增 S3 兼容 provider 配置解析：
  - `S3_ENDPOINT`
  - `S3_REGION`
  - `S3_BUCKET`
  - `S3_ACCESS_KEY_ID`
  - `S3_SECRET_ACCESS_KEY`
  - `S3_FORCE_PATH_STYLE`
  - `S3_PUBLIC_URL_BASE`
  - `S3_UPLOAD_EXPIRES_IN_SECONDS`
- 新增 `S3CompatibleFileStorageProvider`。
- 使用 AWS Signature V4 生成 S3 兼容 `PUT` 上传预签名 URL。
- `createPublicUrl()` 在配置 `S3_PUBLIC_URL_BASE` 时返回稳定公开 URL；未配置时不返回 public URL。
- `FilesModule` 根据环境变量选择 local 或 s3-compatible provider。
- 更新 `.env.example`、平台说明和项目状态文档。

### Out of Scope

- 不新增 npm 依赖，不接 AWS SDK。
- 不做对象存储上传完成 webhook。
- 不验证远端对象是否真实存在。
- 不做病毒扫描、缩略图、清理任务、CDN 刷新。
- 不改 Prisma schema。
- 不改移动端业务 UI。
- 不声明真实 PostgreSQL 验收完成。

## Architecture

文件事实仍由 `FileObject` 管。provider 只负责上传能力和 public URL 生成：

- `LocalFileStorageProvider`：保留本地开发上传、落盘和预览读取能力。
- `S3CompatibleFileStorageProvider`：生成 S3 兼容 `PUT` 预签名 URL 和可选 public URL，不负责本地落盘。

S3 provider 使用 Node `crypto` 实现 AWS Signature V4，避免引入新依赖和网络安装风险。签名 URL 包含：

- `X-Amz-Algorithm=AWS4-HMAC-SHA256`
- `X-Amz-Credential`
- `X-Amz-Date`
- `X-Amz-Expires`
- `X-Amz-SignedHeaders=host`
- `X-Amz-Signature`

默认 endpoint 使用 path-style：`https://endpoint/bucket/objectKey`。当 `S3_FORCE_PATH_STYLE=false` 且 endpoint host 可用时，可生成 virtual-hosted-style：`https://bucket.endpoint/objectKey`。

## Data Flow

1. 客户端请求 `POST /files/upload-intents`。
2. `FilesService` 创建 `FileObject` pending 记录。
3. `S3CompatibleFileStorageProvider.createUploadTarget()` 返回 S3 兼容上传 URL。
4. 客户端用 `PUT uploadUrl` 上传对象。
5. 客户端继续调用现有确认接口 `POST /files/{fileId}/uploaded`，把文件状态改为 `uploaded`。
6. 业务模块继续按现有 `fileId` 校验 owner/status/purpose。

## Error Handling

- `FILE_STORAGE_PROVIDER=s3-compatible` 但缺关键 S3 配置时，API 启动配置解析失败。
- 非法 endpoint、非法 bucket、非法 region、非法过期时间都在环境解析或 provider 构造阶段失败。
- S3 provider 的 `saveUploadedFile()` 和 `readUploadedFile()` 抛出明确错误，避免误把 S3 模式当成本地二进制代理。
- 当前上传确认仍信任客户端确认，真实回调校验留到下一片，文档必须写清楚。

## Testing

- Provider 单测：
  - 生成 path-style 上传签名 URL。
  - 生成 virtual-hosted-style 上传签名 URL。
  - public URL base 归一化。
  - 本地二进制读写在 S3 provider 下明确不可用。
- Env 单测：
  - 解析 S3 provider 配置。
  - `s3-compatible` 缺配置时报错。
  - local 默认不要求 S3 配置。
- Module/文档验证：
  - `FilesModule` 通过环境变量选择 provider。
  - `.env.example` 和状态文档明确第一片边界。

## Completion Criteria

- `S3CompatibleFileStorageProvider` 有测试覆盖。
- `parseEnv()` 能校验 S3 兼容配置。
- `FilesModule` 能按 `FILE_STORAGE_PROVIDER` 切换 provider。
- 文档说明 S3 兼容第一片已具备，回调/扫描/缩略图仍未完成。
- `npm --prefix apps/api test -- file-storage.provider` 通过。
- `npm --prefix apps/api test -- env` 通过。
- `npm --prefix apps/api run typecheck` 通过。
- 真实 PostgreSQL 验收仍按环境事实报告，不因本片改变。

## Self Review

- 占位扫描：无 TBD/TODO。
- Scope check：只补 S3 兼容 provider 第一片，不混入回调、扫描、缩略图、支付、地图或后台。
- Consistency check：沿用现有 `FileStorageProvider` 和 `FileObject` 事实表，不推翻文件地基。
- Ambiguity check：上传确认仍是客户端确认，真实对象存储回调校验明确留到后续阶段。
