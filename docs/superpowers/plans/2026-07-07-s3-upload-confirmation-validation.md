# S3 Upload Confirmation Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate S3-compatible remote object metadata before marking a file upload as completed.

**Architecture:** Extend the existing `FileStorageProvider` contract with `verifyUploadedFile()`. Local storage keeps a no-op implementation; S3-compatible storage performs a signed `HEAD` request and `FilesService.confirmUploaded()` gates status transition on that verification.

**Tech Stack:** NestJS, TypeScript, Node `crypto`, injected fetch-compatible function for tests, Jest.

---

## Tasks

- [x] Add failing provider tests for signed S3 `HEAD` verification and metadata mismatch.
- [x] Implement `verifyUploadedFile()` on local and S3-compatible providers.
- [x] Add failing service test proving `confirmUploaded()` calls provider verification and keeps the file pending on failure.
- [x] Update `FilesService.confirmUploaded()` to run provider verification before `markFileUploaded()`.
- [x] Run `npm --prefix apps/api test -- file-storage.provider`.
- [x] Run `npm --prefix apps/api test -- files.service`.
- [x] Run full focused/API verification.
- [x] Update status documentation.

## Verification Note

- `npm --prefix apps/api test -- file-storage.provider`: passed, 8 tests.
- `npm --prefix apps/api test -- files.service`: passed, 16 tests.
- `npm --prefix apps/api test -- files`: passed, 5 suites / 45 tests.
- `npm --prefix apps/api run typecheck`: passed.
- `npm --prefix apps/api run lint`: passed.
- `npm --prefix apps/api test`: passed, 46 suites / 428 tests.
- `npm run api:build`: passed.
- `npm --prefix apps/api run prisma:validate`: passed.
- `npm --prefix apps/api run db:postgres:doctor`: failed because Docker CLI is missing and `localhost:5432` PostgreSQL is unreachable; Prisma returned `P1001`.

## Self Review

- Spec coverage: covers remote HEAD verification, service gating, and pending preservation.
- Placeholder scan: clear.
- Type consistency: `verifyUploadedFile()` is consistently named across provider and service.
