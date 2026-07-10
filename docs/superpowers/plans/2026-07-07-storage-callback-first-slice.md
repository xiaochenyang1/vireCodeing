# Storage Callback First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a signed S3-compatible upload completion callback that confirms pending file objects and stores object metadata.

**Architecture:** Keep the existing upload intent and storage provider flow. Add a public controller endpoint, route all trust decisions through `FilesService`, verify HMAC with configured `FILE_STORAGE_CALLBACK_SIGNING_SECRET`, then persist callback metadata through the repository and Prisma `FileObject` columns.

**Tech Stack:** NestJS, TypeScript, Prisma, Node `crypto`, Zod, Jest.

---

## Tasks

- [x] Add validation schema and parser for storage callback requests.
- [x] Bound storage callback `fileId`, `objectKey`, `etag`, `versionId` and `signature` lengths at the request boundary.
- [x] Add service tests for signed callback success and invalid signature rejection.
- [x] Add service test proving missing callback signing secret rejects callbacks.
- [x] Add service test proving repeated matching storage callbacks are idempotent.
- [x] Implement HMAC verification and callback confirmation in `FilesService`.
- [x] Keep matching duplicate callbacks from failing object storage retry flows.
- [x] Add controller route `POST /files/storage-callbacks/s3-compatible` without bearer guard.
- [x] Add HTTP routing regression coverage proving the callback route accepts JSON without bearer auth and returns `200`.
- [x] Add HTTP error-path coverage proving invalid callback signatures return `400 FILE_STORAGE_CALLBACK_INVALID` through the business error filter.
- [x] Document the storage callback route, request schema, response schema, error codes, object metadata and idempotency behavior in OpenAPI.
- [x] Persist `etag` and `versionId` through in-memory and Prisma repository mappings.
- [x] Add Prisma schema fields and migration SQL for `FileObject.etag` and `FileObject.versionId`.
- [x] Add production env validation for `FILE_STORAGE_CALLBACK_SIGNING_SECRET`.
- [x] Update status documentation and `.env.example`.

## Verification Note

- `npm --prefix apps/api test -- files.service`: passed, 20 tests.
- `npm --prefix apps/api test -- files.controller`: passed, 13 tests.
- `npm --prefix apps/api test -- files.validation`: passed, 7 tests.
- `npm --prefix apps/api test -- prisma-migration`: passed, 13 tests.
- `npm --prefix apps/api test -- openapi-stage-1`: passed, 23 tests.
- `npm --prefix apps/api test -- files`: passed, 5 suites / 54 tests.
- `npm --prefix apps/api test -- env`: passed, 17 tests.
- `npm --prefix apps/api run typecheck`: passed.
- `npm --prefix apps/api run lint`: passed.
- `npm --prefix apps/api run prisma:validate`: passed.
- `npm --prefix apps/api test`: passed, 46 suites / 441 tests.
- `npm run api:build`: passed.
- `npm --prefix apps/api run db:postgres:doctor`: failed because Docker CLI is missing and `localhost:5432` PostgreSQL is unreachable; Prisma returned `P1001`.

## Self Review

- Placeholder scan: none.
- Scope check: first slice only; native cloud events, async retry, virus scanning, thumbnails, and true bucket acceptance remain out of scope.
- Security check: callbacks fail closed when `FILE_STORAGE_CALLBACK_SIGNING_SECRET` is absent.
