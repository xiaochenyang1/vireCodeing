# S3 Compatible File Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a S3-compatible file storage provider first slice while preserving the existing local provider and file metadata flow.

**Architecture:** Keep `FileObject` and `FilesService` as-is conceptually. Add provider selection and a no-dependency AWS Signature V4 signer inside `file-storage.provider.ts`, then wire `FilesModule` through env-derived config.

**Tech Stack:** NestJS, TypeScript, Node `crypto`, Jest, existing Prisma-backed file metadata.

---

## File Structure

- Modify `apps/api/src/files/file-storage.provider.ts`: add S3-compatible provider, config type, provider selection helper, and SigV4 URL signing helpers.
- Modify `apps/api/src/files/file-storage.provider.spec.ts`: add failing provider tests first, then verify generated signed URLs.
- Modify `apps/api/src/files/files.module.ts`: choose local or S3-compatible provider from env.
- Modify `apps/api/src/config/env.ts`: parse and validate S3-compatible file storage env.
- Modify `apps/api/src/config/env.spec.ts`: cover S3 env parsing and missing config errors.
- Modify `apps/api/.env.example`: document S3-compatible env vars.
- Modify `docs/platform/README.md`: document first-slice boundary.
- Modify `docs/03-项目当前状态与补全路线.md`: update current status and remaining gaps.

## Task 1: S3 Provider Unit Tests

- [x] Add tests in `apps/api/src/files/file-storage.provider.spec.ts` for path-style signed upload URL, virtual-hosted signed upload URL, public URL generation, and unsupported local byte operations.
- [x] Run `npm --prefix apps/api test -- file-storage.provider` and confirm the new tests fail because `S3CompatibleFileStorageProvider` does not exist.

## Task 2: S3 Provider Implementation

- [x] Implement `S3CompatibleFileStorageProvider` and SigV4 helper functions in `apps/api/src/files/file-storage.provider.ts`.
- [x] Run `npm --prefix apps/api test -- file-storage.provider` and confirm provider tests pass.

## Task 3: Environment Parsing and Module Wiring

- [x] Add env tests for `FILE_STORAGE_PROVIDER=s3-compatible` config parsing and missing S3 config failures.
- [x] Run `npm --prefix apps/api test -- env` and confirm the new tests fail.
- [x] Update `apps/api/src/config/env.ts` with storage provider and S3 env validation.
- [x] Update `apps/api/src/files/files.module.ts` to select local or S3-compatible provider from env.
- [x] Run `npm --prefix apps/api test -- env` and `npm --prefix apps/api run typecheck`.

## Task 4: Documentation

- [x] Update `.env.example`, `docs/platform/README.md`, and `docs/03-项目当前状态与补全路线.md`.
- [ ] Verify documentation text with `Select-String`.

## Task 5: Verification

- [x] Run focused checks:
  - `npm --prefix apps/api test -- file-storage.provider`
  - `npm --prefix apps/api test -- env`
  - `npm --prefix apps/api test -- files`
- [x] Run API typecheck:
  - `npm --prefix apps/api run typecheck`
- [x] Run API lint:
  - `npm --prefix apps/api run lint`
- [x] Run `npm --prefix apps/api run db:postgres:doctor` and report the real environment status without claiming database acceptance passed.

## 2026-07-07 Verification Note

- `npm --prefix apps/api test -- file-storage.provider`: passed, 6 tests.
- `npm --prefix apps/api test -- env`: passed, 15 tests.
- `npm --prefix apps/api test -- files`: passed, 5 suites / 45 tests after the follow-up S3 upload confirmation validation slice.
- `npm --prefix apps/api run typecheck`: passed.
- `npm --prefix apps/api run lint`: passed.
- `npm --prefix apps/api run prisma:validate`: passed.
- `npm --prefix apps/api test`: passed, 46 suites / 428 tests after the follow-up S3 upload confirmation validation slice.
- `npm run api:build`: passed.
- `npm --prefix apps/api run db:postgres:doctor`: failed because Docker CLI is missing and `localhost:5432` PostgreSQL is unreachable; Prisma returned `P1001`.

## Self Review

- Spec coverage: covers provider, env parsing, module wiring, docs, and verification.
- Placeholder scan: clear.
- Type consistency: `S3CompatibleFileStorageProvider`, `FILE_STORAGE_PROVIDER`, and S3 env names match the design.
