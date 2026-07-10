# Driver Certification Admin Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the smallest backend admin review loop for driver identity and vehicle certification so submitted records can become `approved` or `rejected`.

**Architecture:** Reuse the existing `driver-certification` module and `CertificationStatus` enum. Add admin-only service/controller methods protected by `AccessTokenGuard`; do not add a Web admin UI, new tables, or migration in this slice. Driver-facing snapshots and order-action certification gates continue to read the same records.

**Tech Stack:** NestJS, TypeScript, Jest, Prisma, Zod, OpenAPI YAML.

---

## Scope Check

This slice covers:

- `admin` users can review one driver's identity certification.
- `admin` users can review one driver's vehicle certification.
- `approved` clears `rejectionReason`.
- `rejected` requires and stores a trimmed `rejectionReason`.
- Non-admin users receive `AUTH_FORBIDDEN`.
- Reviewing a missing certification record returns `DRIVER_CERTIFICATION_NOT_FOUND`.

This slice does not cover a Web admin UI, audit logs, role permissions beyond `userType: admin`, file ownership verification, real object-storage preview links, batch queues, or notification dispatch.

## File Structure

- Modify `apps/api/src/driver-certification/dto.ts`: add review request type.
- Modify `apps/api/src/driver-certification/driver-certification.validation.ts`: add review Zod schema and parser.
- Modify `apps/api/src/driver-certification/driver-certification.validation.spec.ts`: test approve/reject validation.
- Modify `apps/api/src/driver-certification/driver-certification.repository.ts`: add `reviewIdentity` and `reviewVehicle`.
- Modify `apps/api/src/driver-certification/driver-certification.service.ts`: add admin authorization and review methods.
- Modify `apps/api/src/driver-certification/driver-certification.service.spec.ts`: test admin review behavior.
- Modify `apps/api/src/driver-certification/driver-certification.controller.ts`: add admin routes.
- Modify `apps/api/src/driver-certification/driver-certification.controller.spec.ts`: test controller wiring.
- Modify `apps/api/src/common/errors.ts`: add `DRIVER_CERTIFICATION_NOT_FOUND`.
- Modify `apps/api/src/common/business-error.filter.ts`: map it to 404.
- Modify `apps/api/src/common/business-error.filter.spec.ts`: test 404 mapping.
- Modify `docs/platform/openapi-stage-1.yaml`: document admin review endpoints.
- Modify `apps/api/src/config/openapi-stage-1.spec.ts`: assert OpenAPI coverage.
- Modify `docs/03-项目当前状态与补全路线.md` and `docs/platform/README.md`: update status.

## Task 1: Validation

- [x] Write failing tests for admin review request parsing.
- [x] Run `npm --prefix apps/api test -- driver-certification.validation` and confirm failure.
- [x] Add `ReviewDriverCertificationRequest` and validation parser.
- [x] Re-run the validation test and confirm pass.

## Task 2: Backend Review Behavior

- [x] Write failing service tests for approve, reject, missing record, and non-admin rejection.
- [x] Run `npm --prefix apps/api test -- driver-certification.service` and confirm failure.
- [x] Implement repository and service review methods.
- [x] Re-run service tests and confirm pass.

## Task 3: Controller and Error Mapping

- [x] Write failing controller and business error filter tests.
- [x] Run targeted tests and confirm failure.
- [x] Add controller routes and error mapping.
- [x] Re-run targeted tests and confirm pass.

## Task 4: OpenAPI and Docs

- [x] Add OpenAPI contract assertions for admin review endpoints.
- [x] Update `docs/platform/openapi-stage-1.yaml`.
- [x] Update project status docs to say backend admin review API exists, while Web admin UI/audit/real upload still do not.

## Task 5: Verification

- [x] Run `npm --prefix apps/api test -- driver-certification business-error.filter openapi-stage-1`.
- [x] Run `npm --prefix apps/api run typecheck`.
- [x] Run `npm --prefix apps/api run lint`.
- [x] Run `npm --prefix apps/api run prisma:validate`.
- [x] Run `npm --prefix apps/api run db:postgres:doctor` and report the known Docker/PostgreSQL environment blocker if it still fails.
