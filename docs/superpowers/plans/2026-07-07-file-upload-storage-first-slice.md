# File Upload Storage First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real storage provider boundary to the existing file metadata/upload intent flow while preserving current API behavior.

**Architecture:** Keep `FileObject` as the source of truth. Move upload URL and public URL creation out of `FilesService` into a small provider interface, then wire a local provider by default and leave an external-compatible provider shape for later S3/OSS integration.

**Tech Stack:** NestJS, TypeScript, Prisma-backed repository, Jest, existing platform file adapter.

**2026-07-07 Verification Note:** 当前工作区已经包含本计划的 provider、service、module、移动端 adapter 和文档更新。本轮重新核验 `npm --prefix apps/api test -- files` 通过，5 个 suite / 39 个测试通过；`npx jest --runInBand --runTestsByPath __tests__\platformFileApi.test.ts` 通过，9 个测试通过；后续全量核验中根 Jest、根 typecheck、根 lint、API Jest、API typecheck、API lint、Prisma validate 和 API build 均已通过。`db:postgres:doctor` 仍因当前机器缺少 Docker CLI 且 `localhost:5432` PostgreSQL 不可达失败。计划中的 `git commit` 步骤未执行，因为当前工作区已有大量未提交改动且用户未要求提交。

---

## File Structure

- Create `apps/api/src/files/file-storage.provider.ts`: provider interface, local provider, external-compatible provider config type.
- Create `apps/api/src/files/file-storage.provider.spec.ts`: provider unit tests.
- Modify `apps/api/src/files/files.service.ts`: delegate upload target/public URL creation to provider.
- Modify `apps/api/src/files/files.service.spec.ts`: verify the provider is used and current behavior remains.
- Modify `apps/api/src/files/files.module.ts`: construct `LocalFileStorageProvider` from environment.
- Modify `apps/api/.env.example`: document upload URL/public URL configuration.
- Modify `docs/platform/README.md`: record stage-2 file upload boundary.
- Modify `docs/03-项目当前状态与补全路线.md`: move file upload from pure half-built to provider-first-slice complete after verification.

## Task 1: Storage Provider Unit

**Files:**
- Create: `apps/api/src/files/file-storage.provider.ts`
- Create: `apps/api/src/files/file-storage.provider.spec.ts`

- [x] **Step 1: Write failing provider tests**

Create `apps/api/src/files/file-storage.provider.spec.ts`:

```ts
import { LocalFileStorageProvider } from './file-storage.provider';
import type { FileUploadRecord } from './dto';

describe('LocalFileStorageProvider', () => {
  const file: FileUploadRecord = {
    id: 'file-1',
    ownerUserId: 'user-1',
    purpose: 'identity',
    objectKey: 'user-1/identity/front.png',
    status: 'pending',
    createdAtIso: '2026-07-07T00:00:00.000Z',
  };

  it('creates local upload targets and public urls', () => {
    const provider = new LocalFileStorageProvider({
      uploadUrlBase: 'http://localhost:3000/api/files/uploads/',
      publicUrlBase: 'https://cdn.example.com/',
    });

    expect(provider.createPublicUrl(file.objectKey)).toBe(
      'https://cdn.example.com/user-1/identity/front.png',
    );
    expect(
      provider.createUploadTarget(file, '2026-07-07T00:15:00.000Z'),
    ).toEqual({
      uploadUrl: 'http://localhost:3000/api/files/uploads/file-1',
      publicUrl: 'https://cdn.example.com/user-1/identity/front.png',
      expiresAtIso: '2026-07-07T00:15:00.000Z',
    });
  });

  it('uses the API local upload endpoint when upload base is omitted', () => {
    const provider = new LocalFileStorageProvider();

    expect(
      provider.createUploadTarget(file, '2026-07-07T00:15:00.000Z'),
    ).toEqual({
      uploadUrl: '/api/files/uploads/file-1',
      expiresAtIso: '2026-07-07T00:15:00.000Z',
    });
  });
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm --prefix apps/api test -- file-storage.provider
```

Expected: fails because `file-storage.provider.ts` does not exist.

- [x] **Step 3: Implement provider**

Create `apps/api/src/files/file-storage.provider.ts`:

```ts
import type { FileUploadRecord } from './dto';

export type FileUploadTarget = {
  uploadUrl: string;
  publicUrl?: string;
  expiresAtIso: string;
};

export interface FileStorageProvider {
  createPublicUrl(objectKey: string): string | undefined;
  createUploadTarget(
    file: FileUploadRecord,
    expiresAtIso: string,
  ): FileUploadTarget;
}

export type LocalFileStorageProviderConfig = {
  uploadUrlBase?: string;
  publicUrlBase?: string;
};

export class LocalFileStorageProvider implements FileStorageProvider {
  constructor(private readonly config: LocalFileStorageProviderConfig = {}) {}

  createPublicUrl(objectKey: string) {
    if (!this.config.publicUrlBase) {
      return undefined;
    }

    return `${normalizeBaseUrl(this.config.publicUrlBase)}/${objectKey}`;
  }

  createUploadTarget(file: FileUploadRecord, expiresAtIso: string) {
    const publicUrl = this.createPublicUrl(file.objectKey);

    return {
      uploadUrl: `${normalizeBaseUrl(this.config.uploadUrlBase ?? '/api/files/uploads')}/${file.id}`,
      ...(publicUrl ? { publicUrl } : {}),
      expiresAtIso,
    };
  }
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}
```

- [x] **Step 4: Run focused test and verify it passes**

Run:

```powershell
npm --prefix apps/api test -- file-storage.provider
```

Expected: pass.

- [ ] **Step 5: Commit provider unit**

Run:

```powershell
git add apps/api/src/files/file-storage.provider.ts apps/api/src/files/file-storage.provider.spec.ts
git commit -m "feat(api): add file storage provider boundary"
```

## Task 2: Use Provider From FilesService

**Files:**
- Modify: `apps/api/src/files/files.service.ts`
- Modify: `apps/api/src/files/files.service.spec.ts`

- [x] **Step 1: Write failing service test for provider delegation**

Add this test to `apps/api/src/files/files.service.spec.ts`:

```ts
it('delegates upload target creation to the storage provider', async () => {
  const repository = new InMemoryFilesRepository(() => now);
  const previewUrlSigner = new LocalFilePreviewUrlSigner({
    now: () => now,
    previewExpiresInSeconds: 600,
    signingSecret: 'unit-test-file-preview-secret',
  });
  const storageProvider = {
    createPublicUrl: jest.fn(() => 'https://storage.example.com/object.png'),
    createUploadTarget: jest.fn((file, expiresAtIso) => ({
      uploadUrl: `https://upload.example.com/${file.id}`,
      publicUrl: file.publicUrl,
      expiresAtIso,
    })),
  };
  const service = new FilesService(
    repository,
    {
      uploadExpiresInSeconds: 900,
      now: () => now,
    },
    previewUrlSigner,
    storageProvider,
  );

  await expect(
    service.createUploadIntent('user-1', {
      purpose: 'identity',
      fileName: 'front.png',
      contentType: 'image/png',
      byteSize: 2048,
    }),
  ).resolves.toMatchObject({
    uploadUrl: 'https://upload.example.com/file-local-1',
    publicUrl: 'https://storage.example.com/object.png',
    expiresAtIso: '2026-07-06T03:15:00.000Z',
  });
  expect(storageProvider.createPublicUrl).toHaveBeenCalledWith(
    expect.stringMatching(/^user-1\/identity\//),
  );
  expect(storageProvider.createUploadTarget).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'file-local-1' }),
    '2026-07-06T03:15:00.000Z',
  );
});
```

- [x] **Step 2: Run service tests and verify failure**

Run:

```powershell
npm --prefix apps/api test -- files.service
```

Expected: fails because `FilesService` does not accept `storageProvider`.

- [x] **Step 3: Refactor `FilesService` constructor**

In `apps/api/src/files/files.service.ts`, import provider types:

```ts
import {
  LocalFileStorageProvider,
  type FileStorageProvider,
} from './file-storage.provider';
```

Change the constructor signature:

```ts
constructor(
  private readonly repository: FilesRepository,
  private readonly config: FilesServiceConfig = {},
  private readonly previewUrlVerifier: FilePreviewUrlVerifier =
    new LocalFilePreviewUrlSigner(),
  private readonly storageProvider: FileStorageProvider =
    new LocalFileStorageProvider(config),
) {}
```

In `createUploadIntent`, replace:

```ts
const publicUrl = createPublicUrl(this.config.publicUrlBase, objectKey);
```

with:

```ts
const publicUrl = this.storageProvider.createPublicUrl(objectKey);
```

Replace the return block:

```ts
return {
  ...file,
  uploadUrl: `${normalizeBaseUrl(this.config.uploadUrlBase ?? '/api/files/uploads')}/${file.id}`,
  expiresAtIso,
};
```

with:

```ts
return {
  ...file,
  ...this.storageProvider.createUploadTarget(file, expiresAtIso),
};
```

Remove the private `createPublicUrl` and `normalizeBaseUrl` functions from `files.service.ts`.

- [x] **Step 4: Run file service tests**

Run:

```powershell
npm --prefix apps/api test -- files.service
```

Expected: pass.

- [x] **Step 5: Run all file tests**

Run:

```powershell
npm --prefix apps/api test -- files
```

Expected: pass.

- [ ] **Step 6: Commit service provider wiring**

Run:

```powershell
git add apps/api/src/files/files.service.ts apps/api/src/files/files.service.spec.ts
git commit -m "feat(api): use file storage provider in file service"
```

## Task 3: Wire Provider Through FilesModule

**Files:**
- Modify: `apps/api/src/files/files.module.ts`
- Modify: `apps/api/.env.example`

- [x] **Step 1: Wire provider in module**

In `apps/api/src/files/files.module.ts`, import `LocalFileStorageProvider`:

```ts
import { LocalFileStorageProvider } from './file-storage.provider';
```

Change the `FilesService` factory to:

```ts
useFactory: (repository: PrismaFilesRepository) =>
  new FilesService(
    repository,
    {
      ...(process.env.FILE_UPLOAD_URL_BASE
        ? { uploadUrlBase: process.env.FILE_UPLOAD_URL_BASE }
        : {}),
      ...(process.env.FILE_PUBLIC_URL_BASE
        ? { publicUrlBase: process.env.FILE_PUBLIC_URL_BASE }
        : {}),
    },
    new LocalFilePreviewUrlSigner(
      createFilePreviewUrlSignerConfigFromEnv(process.env),
    ),
    new LocalFileStorageProvider({
      ...(process.env.FILE_UPLOAD_URL_BASE
        ? { uploadUrlBase: process.env.FILE_UPLOAD_URL_BASE }
        : {}),
      ...(process.env.FILE_PUBLIC_URL_BASE
        ? { publicUrlBase: process.env.FILE_PUBLIC_URL_BASE }
        : {}),
    }),
  ),
```

- [x] **Step 2: Document env vars**

Add to `apps/api/.env.example`:

```dotenv
# Local upload and public file URL generation.
# FILE_UPLOAD_URL_BASE=http://localhost:3000/api/files/uploads
# FILE_PUBLIC_URL_BASE=https://files.example.com/public
```

- [x] **Step 3: Run module and env tests**

Run:

```powershell
npm --prefix apps/api test -- files
npm --prefix apps/api test -- env
npm --prefix apps/api run typecheck
```

Expected: all pass.

- [ ] **Step 4: Commit module wiring**

Run:

```powershell
git add apps/api/src/files/files.module.ts apps/api/.env.example
git commit -m "chore(api): configure local file storage provider"
```

## Task 4: Docs and Status

**Files:**
- Modify: `docs/platform/README.md`
- Modify: `docs/03-项目当前状态与补全路线.md`

- [x] **Step 1: Update platform README file section**

Add this paragraph to the file upload section in `docs/platform/README.md`:

```markdown
阶段 2 文件上传第一片新增 storage provider 边界：`FilesService` 不再直接拼上传 URL 和 public URL，而是通过 `LocalFileStorageProvider` 生成本地上传目标和公开 URL。当前默认 provider 仍是本地开发路径，保留未来接 S3/OSS 的接口形状，但这一片不声明真实云对象存储、CDN、病毒扫描或缩略图已经完成。
```

- [x] **Step 2: Update project status document**

In `docs/03-项目当前状态与补全路线.md`, update the latest `半成品` section so file upload states:

```markdown
- 文件上传已有元数据、上传意图、`uploaded` 状态、业务表单文件引用、司机认证附件校验、预览签名和阶段 2 storage provider 边界；还没有真实 S3/OSS 直传、二进制内容代理、病毒扫描、缩略图和清理任务。
```

- [x] **Step 3: Verify docs text**

Run:

```powershell
Select-String -Path 'docs\platform\README.md' -Pattern 'storage provider|LocalFileStorageProvider|S3/OSS'
Select-String -Path 'docs\03-项目当前状态与补全路线.md' -Pattern 'storage provider|真实 S3/OSS'
```

Expected: both commands print matching lines.

- [ ] **Step 4: Commit docs**

Run:

```powershell
git add docs/platform/README.md docs/03-项目当前状态与补全路线.md
git commit -m "docs: record file storage provider boundary"
```

## Task 5: Full Verification

**Files:**
- Verify only.

- [x] **Step 1: Run focused tests**

Run:

```powershell
npm --prefix apps/api test -- file-storage.provider
npm --prefix apps/api test -- files
npx jest --runInBand --runTestsByPath __tests__\platformFileApi.test.ts
```

Expected: all pass.

- [x] **Step 2: Run full checks**

Run:

```powershell
npm test -- --runInBand
npx tsc --noEmit
npm run lint
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run prisma:validate
npm run api:build
```

Expected: all pass.

- [x] **Step 3: Run database doctor honestly**

Run:

```powershell
npm --prefix apps/api run db:postgres:doctor
```

Expected with current machine: may still fail because Docker CLI and PostgreSQL are unavailable. Report that as an environment blocker.

## Self Review

- Spec coverage: covers file upload storage provider boundary, local provider default behavior, docs, and verification.
- 占位扫描: clear.
- Type consistency: `FileStorageProvider`, `LocalFileStorageProvider`, `createPublicUrl`, and `createUploadTarget` names are consistent across tasks.
