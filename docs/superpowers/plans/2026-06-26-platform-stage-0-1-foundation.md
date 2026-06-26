# Platform Stage 0/1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立完整货运平台的第一块真实地基：平台工程文档、NestJS 后端骨架、PostgreSQL 数据模型初稿、认证 API 草案和移动端 API adapter 边界。

**Architecture:** 采用模块化单体后端，新增 `apps/api` 承载 NestJS 服务；当前 React Native 货主端保持现有本地行为，只新增可测试的 API adapter 和迁移文档，不直接替换页面行为。阶段 0/1 只覆盖平台准备与认证基础，司机端、后台、地图、支付、推送、上传、IM 在后续计划中拆分。

**Tech Stack:** React Native 0.86, TypeScript, Jest, NestJS, Prisma, PostgreSQL, Redis design notes, OpenAPI 3.0.

---

## File Structure

### Create

- `docs/platform/README.md`：完整平台工程说明和目录边界。
- `docs/platform/api-conventions.md`：API 统一约定、错误码、分页、幂等和金额单位。
- `docs/platform/erd-stage-1.md`：阶段 1 数据模型和关系说明。
- `docs/platform/openapi-stage-1.yaml`：认证、用户资料和文件上传签名的 OpenAPI 初稿。
- `docs/platform/mobile-migration-stage-1.md`：当前 RN 货主端从本地认证迁移到 API adapter 的策略。
- `apps/api/package.json`：NestJS 后端包配置。
- `apps/api/tsconfig.json`：后端 TypeScript 配置。
- `apps/api/jest.config.js`：后端 Jest 配置。
- `apps/api/.env.example`：后端环境变量样例。
- `apps/api/prisma/schema.prisma`：PostgreSQL 数据模型初稿。
- `apps/api/src/main.ts`：后端启动入口。
- `apps/api/src/app.module.ts`：根模块。
- `apps/api/src/health/health.controller.ts`：健康检查接口。
- `apps/api/src/health/health.controller.spec.ts`：健康检查单元测试。
- `apps/api/src/common/api-response.ts`：统一响应类型。
- `apps/api/src/common/errors.ts`：统一业务错误码。
- `apps/api/src/config/env.ts`：环境变量解析。
- `apps/api/src/auth/auth.module.ts`：认证模块。
- `apps/api/src/auth/auth.controller.ts`：认证接口。
- `apps/api/src/auth/auth.service.ts`：认证业务服务。
- `apps/api/src/auth/auth.service.spec.ts`：验证码、登录和刷新 token 测试。
- `apps/api/src/auth/dto.ts`：认证 DTO。
- `apps/api/src/auth/token.service.ts`：token 签发和刷新逻辑边界。
- `apps/api/src/auth/verification-code.store.ts`：验证码存储接口和内存实现。
- `src/services/platformApiClient.ts`：RN 端平台 API client。
- `src/services/platformAuthApi.ts`：RN 端认证 API adapter。
- `__tests__/platformAuthApi.test.ts`：RN 端认证 adapter 测试。

### Modify

- `README.md`：补充完整平台规划入口和阶段 0/1 运行方式。
- `package.json`：新增根脚本 `api:test`、`api:typecheck`、`api:build`，不影响现有 RN 脚本。

## Task 1: Add Platform Stage 0 Documentation

**Files:**
- Create: `docs/platform/README.md`
- Create: `docs/platform/api-conventions.md`
- Create: `docs/platform/erd-stage-1.md`
- Create: `docs/platform/openapi-stage-1.yaml`
- Create: `docs/platform/mobile-migration-stage-1.md`
- Modify: `README.md`

- [ ] **Step 1: Write the documentation coverage check**

Run this before creating the files:

```powershell
Test-Path docs/platform/README.md
Test-Path docs/platform/openapi-stage-1.yaml
```

Expected: both commands output `False`.

- [ ] **Step 2: Create `docs/platform/README.md`**

```markdown
# 完整货运平台工程说明

当前仓库从 React Native 货主端本地 MVP 起步，完整平台按移动端、后端、后台和第三方能力分阶段演进。

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
- 阶段 1：NestJS 后端骨架、认证接口、token/refresh token 边界、移动端 API adapter。

阶段 0/1 不实现司机端、后台、地图、支付、推送、上传真实直传和 IM。

## 目录规划

- `apps/api`：NestJS 后端服务。
- `src/services`：React Native 端 API client 和 adapter。
- `docs/platform`：平台级架构、ERD、OpenAPI 和迁移说明。
- `docs/superpowers/specs`：已批准设计规格。
- `docs/superpowers/plans`：可执行实施计划。
```

- [ ] **Step 3: Create `docs/platform/api-conventions.md`**

````markdown
# API 统一约定

## 通用响应

```json
{
  "code": "OK",
  "message": "success",
  "data": {},
  "requestId": "req_202606260001",
  "timestamp": "2026-06-26T06:00:00.000Z"
}
```

## 错误响应

```json
{
  "code": "AUTH_CODE_EXPIRED",
  "message": "验证码已过期",
  "requestId": "req_202606260002",
  "timestamp": "2026-06-26T06:00:00.000Z"
}
```

## 认证

移动端请求使用：

```http
Authorization: Bearer <accessToken>
X-Client-Platform: android
X-App-Version: 0.0.1
X-Request-Id: req_client_generated_id
```

## 分页

列表接口使用 `page` 和 `pageSize`，响应返回：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

## 金额

后端内部金额统一使用整数分，移动端展示时转换为元。

## 幂等

创建订单、支付、退款、提现和上传提交接口必须支持：

```http
Idempotency-Key: idem_client_generated_id
```
````

- [ ] **Step 4: Create `docs/platform/erd-stage-1.md`**

```markdown
# 阶段 1 数据模型草案

## users

- `id`: UUID primary key
- `phone`: unique string
- `user_type`: `shipper` | `driver` | `admin`
- `status`: `active` | `disabled`
- `created_at`: timestamp
- `updated_at`: timestamp

## auth_sessions

- `id`: UUID primary key
- `user_id`: references `users.id`
- `refresh_token_hash`: string
- `device_id`: string
- `expires_at`: timestamp
- `revoked_at`: nullable timestamp
- `created_at`: timestamp

## verification_codes

- `id`: UUID primary key
- `phone`: string
- `purpose`: `login` | `register` | `reset`
- `code_hash`: string
- `expires_at`: timestamp
- `consumed_at`: nullable timestamp
- `created_at`: timestamp

## files

- `id`: UUID primary key
- `owner_user_id`: references `users.id`
- `purpose`: `identity` | `cargo` | `exception` | `receipt` | `invoice`
- `object_key`: string
- `public_url`: nullable string
- `status`: `pending` | `uploaded` | `rejected`
- `created_at`: timestamp

## shipper_profiles

- `user_id`: references `users.id`
- `display_name`: string
- `enterprise_status`: `unverified` | `reviewing` | `verified` | `rejected`
- `identity_status`: `unverified` | `reviewing` | `verified` | `rejected`

## 关系

- 一个 `users` 可以有多个 `auth_sessions`。
- 一个 `users` 可以有多个 `files`。
- 货主资料通过 `shipper_profiles.user_id` 关联 `users.id`。
```

- [ ] **Step 5: Create `docs/platform/openapi-stage-1.yaml`**

```yaml
openapi: 3.0.3
info:
  title: Truck Platform Stage 1 API
  version: 0.1.0
servers:
  - url: http://localhost:3000
paths:
  /health:
    get:
      summary: Health check
      responses:
        '200':
          description: Service is healthy
  /auth/send-code:
    post:
      summary: Send verification code
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SendCodeRequest'
      responses:
        '200':
          description: Code sent
  /auth/login:
    post:
      summary: Login with phone and verification code
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LoginRequest'
      responses:
        '200':
          description: Login success
  /auth/refresh:
    post:
      summary: Refresh access token
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RefreshRequest'
      responses:
        '200':
          description: Refresh success
  /me:
    get:
      summary: Current user profile
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Current user
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    SendCodeRequest:
      type: object
      required: [phone, purpose]
      properties:
        phone:
          type: string
          example: '13800138000'
        purpose:
          type: string
          enum: [login, register, reset]
    LoginRequest:
      type: object
      required: [phone, code, userType]
      properties:
        phone:
          type: string
        code:
          type: string
        userType:
          type: string
          enum: [shipper, driver]
    RefreshRequest:
      type: object
      required: [refreshToken]
      properties:
        refreshToken:
          type: string
```

- [ ] **Step 6: Create `docs/platform/mobile-migration-stage-1.md`**

```markdown
# 移动端阶段 1 迁移策略

## 原则

- 保留现有本地认证流程作为测试基线。
- 新增 API adapter，不在页面中直接调用 `fetch`。
- 后端不可用时不破坏当前 176 个测试覆盖的本地 MVP 行为。

## 第一批新增文件

- `src/services/platformApiClient.ts`
- `src/services/platformAuthApi.ts`
- `__tests__/platformAuthApi.test.ts`

## 迁移步骤

1. 为认证 API 新增独立 adapter。
2. 用 Jest mock `fetch` 验证请求路径、请求体和响应映射。
3. 在 `AuthScreen` 接入前，先保持 adapter 独立可测。
4. 后端认证稳定后，再把 `AuthScreen` 从本地固定验证码切到 adapter。

## 不在阶段 1 修改

- 发单、订单列表、订单详情。
- 个人中心、优惠券、发票。
- 地图、支付、推送、IM。
```

- [ ] **Step 7: Update `README.md` with platform entry links**

Append this section near the top, below the project title or before the default React Native guide:

```markdown
## 平台规划入口

当前仓库已从 React Native 默认模板演进为货主端本地 MVP。完整平台建设按阶段推进：

- 总体设计：`docs/superpowers/specs/2026-06-26-complete-platform-architecture-design.md`
- 阶段 0/1 计划：`docs/superpowers/plans/2026-06-26-platform-stage-0-1-foundation.md`
- 平台工程说明：`docs/platform/README.md`
- API 规范：`docs/platform/api-conventions.md`
- OpenAPI 初稿：`docs/platform/openapi-stage-1.yaml`
```

- [ ] **Step 8: Verify documentation coverage**

Run:

```powershell
Test-Path docs/platform/README.md
Test-Path docs/platform/api-conventions.md
Test-Path docs/platform/erd-stage-1.md
Test-Path docs/platform/openapi-stage-1.yaml
Test-Path docs/platform/mobile-migration-stage-1.md
Select-String -Path README.md -Pattern '平台规划入口'
```

Expected: all `Test-Path` commands output `True`, and `Select-String` prints the `平台规划入口` line.

- [ ] **Step 9: Commit documentation slice**

```powershell
git add README.md docs/platform/README.md docs/platform/api-conventions.md docs/platform/erd-stage-1.md docs/platform/openapi-stage-1.yaml docs/platform/mobile-migration-stage-1.md
git commit -m "docs: add platform stage 0 foundation"
```

## Task 2: Scaffold NestJS API Workspace

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/jest.config.js`
- Create: `apps/api/.env.example`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.controller.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing health test**

Create `apps/api/src/health/health.controller.spec.ts`:

```ts
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns service health metadata', () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'truck-platform-api',
      version: '0.1.0',
    });
  });
});
```

- [ ] **Step 2: Create API package files**

Create `apps/api/package.json`:

```json
{
  "name": "@truck-platform/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start": "nest start",
    "start:dev": "nest start --watch",
    "build": "nest build",
    "test": "jest --config jest.config.js --runInBand",
    "typecheck": "tsc --noEmit",
    "lint": "eslint \"src/**/*.ts\""
  },
  "dependencies": {
    "@nestjs/common": "^10.4.15",
    "@nestjs/core": "^10.4.15",
    "@nestjs/platform-express": "^10.4.15",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.9",
    "@nestjs/testing": "^10.4.15",
    "@types/jest": "^29.5.13",
    "@types/node": "^22.10.2",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.8.3"
  }
}
```

Create `apps/api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `apps/api/jest.config.js`:

```js
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  testEnvironment: 'node',
};
```

Create `apps/api/.env.example`:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://truck:truck@localhost:5432/truck_platform
JWT_ACCESS_SECRET=replace-with-dev-access-secret
JWT_REFRESH_SECRET=replace-with-dev-refresh-secret
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=604800
```

- [ ] **Step 3: Run the health test to verify it fails**

Run:

```powershell
Set-Location apps/api
npm install
npm test -- health.controller.spec.ts
```

Expected: FAIL with `Cannot find module './health.controller'`.

- [ ] **Step 4: Implement health controller and root module**

Create `apps/api/src/health/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';

type HealthResponse = {
  status: 'ok';
  service: 'truck-platform-api';
  version: '0.1.0';
};

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'truck-platform-api',
      version: '0.1.0',
    };
  }
}
```

Create `apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

@Module({
  controllers: [HealthController],
})
export class AppModule {}
```

Create `apps/api/src/main.ts`:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);

  app.setGlobalPrefix('api');
  await app.listen(port);
}

void bootstrap();
```

- [ ] **Step 5: Add root scripts**

Modify root `package.json` `scripts`:

```json
{
  "android": "react-native run-android",
  "ios": "react-native run-ios",
  "lint": "eslint .",
  "start": "react-native start",
  "test": "jest",
  "api:test": "npm --prefix apps/api test",
  "api:typecheck": "npm --prefix apps/api run typecheck",
  "api:build": "npm --prefix apps/api run build"
}
```

- [ ] **Step 6: Verify API scaffold**

Run:

```powershell
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm run api:test
```

Expected: all commands PASS.

- [ ] **Step 7: Commit API scaffold**

```powershell
git add package.json apps/api/package.json apps/api/package-lock.json apps/api/tsconfig.json apps/api/jest.config.js apps/api/.env.example apps/api/src/main.ts apps/api/src/app.module.ts apps/api/src/health/health.controller.ts apps/api/src/health/health.controller.spec.ts
git commit -m "feat(api): scaffold NestJS service"
```

## Task 3: Add Stage 1 Database Schema and API Common Types

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/common/api-response.ts`
- Create: `apps/api/src/common/errors.ts`
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/config/env.spec.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install schema and config dependencies**

Run:

```powershell
npm --prefix apps/api install @prisma/client @nestjs/config zod
npm --prefix apps/api install --save-dev prisma
```

Expected: `apps/api/package.json` and `apps/api/package-lock.json` update.

- [ ] **Step 2: Write failing environment parser test**

Create `apps/api/src/config/env.spec.ts`:

```ts
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('parses required API environment values', () => {
    expect(
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_SECONDS: 604800,
    });
  });

  it('rejects missing JWT secrets', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
      }),
    ).toThrow('Invalid API environment');
  });
});
```

- [ ] **Step 3: Run env test to verify it fails**

Run:

```powershell
npm --prefix apps/api test -- env.spec.ts
```

Expected: FAIL with `Cannot find module './env'`.

- [ ] **Step 4: Implement environment parser**

Create `apps/api/src/config/env.ts`:

```ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(604800),
});

export type ApiEnv = z.infer<typeof envSchema>;

export function parseEnv(input: NodeJS.ProcessEnv): ApiEnv {
  const parsed = envSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(`Invalid API environment: ${parsed.error.message}`);
  }

  return parsed.data;
}
```

- [ ] **Step 5: Add API response and error types**

Create `apps/api/src/common/api-response.ts`:

```ts
export type ApiResponse<T> = {
  code: 'OK';
  message: 'success';
  data: T;
  requestId: string;
  timestamp: string;
};

export function ok<T>(data: T, requestId = 'req_local'): ApiResponse<T> {
  return {
    code: 'OK',
    message: 'success',
    data,
    requestId,
    timestamp: new Date().toISOString(),
  };
}
```

Create `apps/api/src/common/errors.ts`:

```ts
export const ApiErrorCode = {
  AUTH_CODE_EXPIRED: 'AUTH_CODE_EXPIRED',
  AUTH_CODE_INVALID: 'AUTH_CODE_INVALID',
  AUTH_REFRESH_TOKEN_INVALID: 'AUTH_REFRESH_TOKEN_INVALID',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export class BusinessError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}
```

- [ ] **Step 6: Create Prisma schema**

Create `apps/api/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserType {
  shipper
  driver
  admin
}

enum UserStatus {
  active
  disabled
}

enum VerificationPurpose {
  login
  register
  reset
}

enum FilePurpose {
  identity
  cargo
  exception
  receipt
  invoice
}

enum FileStatus {
  pending
  uploaded
  rejected
}

model User {
  id        String      @id @default(uuid())
  phone     String      @unique
  userType  UserType
  status    UserStatus  @default(active)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  sessions  AuthSession[]
  files     FileObject[]
  shipperProfile ShipperProfile?
}

model AuthSession {
  id               String    @id @default(uuid())
  userId           String
  refreshTokenHash String
  deviceId         String
  expiresAt        DateTime
  revokedAt        DateTime?
  createdAt        DateTime  @default(now())
  user             User      @relation(fields: [userId], references: [id])
}

model VerificationCode {
  id         String              @id @default(uuid())
  phone      String
  purpose    VerificationPurpose
  codeHash   String
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime            @default(now())

  @@index([phone, purpose])
}

model FileObject {
  id          String      @id @default(uuid())
  ownerUserId String
  purpose     FilePurpose
  objectKey   String
  publicUrl   String?
  status      FileStatus  @default(pending)
  createdAt   DateTime    @default(now())
  owner        User        @relation(fields: [ownerUserId], references: [id])
}

model ShipperProfile {
  userId           String @id
  displayName      String
  identityStatus   String @default("unverified")
  enterpriseStatus String @default("unverified")
  user             User   @relation(fields: [userId], references: [id])
}
```

- [ ] **Step 7: Add Prisma scripts**

Modify `apps/api/package.json` scripts:

```json
{
  "start": "nest start",
  "start:dev": "nest start --watch",
  "build": "nest build",
  "test": "jest --config jest.config.js --runInBand",
  "typecheck": "tsc --noEmit",
  "lint": "eslint \"src/**/*.ts\"",
  "prisma:validate": "prisma validate",
  "prisma:generate": "prisma generate"
}
```

- [ ] **Step 8: Verify schema and config**

Run:

```powershell
npm --prefix apps/api test -- env.spec.ts
npm --prefix apps/api run prisma:validate
npm --prefix apps/api run typecheck
```

Expected: all commands PASS.

- [ ] **Step 9: Commit database and common foundation**

```powershell
git add apps/api/package.json apps/api/package-lock.json apps/api/prisma/schema.prisma apps/api/src/common/api-response.ts apps/api/src/common/errors.ts apps/api/src/config/env.ts apps/api/src/config/env.spec.ts
git commit -m "feat(api): add stage one schema and config"
```

## Task 4: Implement Auth Domain Service

**Files:**
- Create: `apps/api/src/auth/dto.ts`
- Create: `apps/api/src/auth/token.service.ts`
- Create: `apps/api/src/auth/verification-code.store.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.service.spec.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing auth service tests**

Create `apps/api/src/auth/auth.service.spec.ts`:

```ts
import { BusinessError, ApiErrorCode } from '../common/errors';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { InMemoryVerificationCodeStore } from './verification-code.store';

describe('AuthService', () => {
  const now = new Date('2026-06-26T06:00:00.000Z');

  function createService() {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
    });

    return {
      service: new AuthService(codeStore, tokenService, () => now),
      codeStore,
    };
  }

  it('sends a local development verification code', async () => {
    const { service, codeStore } = createService();

    const result = await service.sendCode({
      phone: '13800138000',
      purpose: 'login',
    });

    expect(result).toEqual({
      expireSeconds: 300,
      devCode: '123456',
    });
    expect(codeStore.findActiveCode('13800138000', 'login')).toMatchObject({
      code: '123456',
    });
  });

  it('logs in with a valid code and returns token pair', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'login' });
    const result = await service.login({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-1',
    });

    expect(result.user).toEqual({
      id: 'local-user-13800138000',
      phone: '13800138000',
      userType: 'shipper',
    });
    expect(result.tokens.accessToken).toContain('access.local-user-13800138000');
    expect(result.tokens.refreshToken).toContain('refresh.local-user-13800138000');
  });

  it('rejects an invalid code', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'login' });

    await expect(
      service.login({
        phone: '13800138000',
        code: '000000',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.AUTH_CODE_INVALID, '验证码错误'),
    );
  });

  it('refreshes a local token pair', async () => {
    const { service } = createService();

    const result = await service.refresh({
      refreshToken: 'refresh.local-user-13800138000.604800',
      deviceId: 'device-1',
    });

    expect(result.accessToken).toBe('access.local-user-13800138000.900');
    expect(result.refreshToken).toBe('refresh.local-user-13800138000.604800');
  });
});
```

- [ ] **Step 2: Run auth tests to verify they fail**

Run:

```powershell
npm --prefix apps/api test -- auth.service.spec.ts
```

Expected: FAIL with missing auth modules.

- [ ] **Step 3: Create auth DTOs**

Create `apps/api/src/auth/dto.ts`:

```ts
export type VerificationPurpose = 'login' | 'register' | 'reset';
export type MobileUserType = 'shipper' | 'driver';

export type SendCodeRequest = {
  phone: string;
  purpose: VerificationPurpose;
};

export type SendCodeResult = {
  expireSeconds: number;
  devCode: string;
};

export type LoginRequest = {
  phone: string;
  code: string;
  userType: MobileUserType;
  deviceId: string;
};

export type RefreshRequest = {
  refreshToken: string;
  deviceId: string;
};

export type AuthenticatedUser = {
  id: string;
  phone: string;
  userType: MobileUserType;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type LoginResult = {
  user: AuthenticatedUser;
  tokens: TokenPair;
};
```

- [ ] **Step 4: Implement verification code store**

Create `apps/api/src/auth/verification-code.store.ts`:

```ts
import type { VerificationPurpose } from './dto';

export type VerificationCodeRecord = {
  phone: string;
  purpose: VerificationPurpose;
  code: string;
  expiresAt: Date;
  consumedAt?: Date;
};

export class InMemoryVerificationCodeStore {
  private readonly records: VerificationCodeRecord[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  saveCode(record: VerificationCodeRecord): void {
    this.records.push(record);
  }

  findActiveCode(
    phone: string,
    purpose: VerificationPurpose,
  ): VerificationCodeRecord | undefined {
    const now = this.now();

    return [...this.records]
      .reverse()
      .find(
        record =>
          record.phone === phone &&
          record.purpose === purpose &&
          !record.consumedAt &&
          record.expiresAt.getTime() > now.getTime(),
      );
  }

  consumeCode(record: VerificationCodeRecord): void {
    record.consumedAt = this.now();
  }
}
```

- [ ] **Step 5: Implement token service**

Create `apps/api/src/auth/token.service.ts`:

```ts
import type { TokenPair } from './dto';

type TokenServiceConfig = {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
};

export class TokenService {
  constructor(private readonly config: TokenServiceConfig) {}

  issueTokenPair(userId: string): TokenPair {
    return {
      accessToken: `access.${userId}.${this.config.accessTtlSeconds}`,
      refreshToken: `refresh.${userId}.${this.config.refreshTtlSeconds}`,
      expiresIn: this.config.accessTtlSeconds,
    };
  }

  refreshTokenPair(refreshToken: string): TokenPair {
    const [, userId] = refreshToken.split('.');

    if (!userId) {
      throw new Error('Invalid refresh token');
    }

    return this.issueTokenPair(userId);
  }
}
```

- [ ] **Step 6: Implement auth service**

Create `apps/api/src/auth/auth.service.ts`:

```ts
import { BusinessError, ApiErrorCode } from '../common/errors';
import type {
  AuthenticatedUser,
  LoginRequest,
  LoginResult,
  RefreshRequest,
  SendCodeRequest,
  SendCodeResult,
  TokenPair,
} from './dto';
import { TokenService } from './token.service';
import { InMemoryVerificationCodeStore } from './verification-code.store';

export class AuthService {
  constructor(
    private readonly codeStore: InMemoryVerificationCodeStore,
    private readonly tokenService: TokenService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async sendCode(request: SendCodeRequest): Promise<SendCodeResult> {
    const expiresAt = new Date(this.now().getTime() + 300 * 1000);

    this.codeStore.saveCode({
      phone: request.phone,
      purpose: request.purpose,
      code: '123456',
      expiresAt,
    });

    return {
      expireSeconds: 300,
      devCode: '123456',
    };
  }

  async login(request: LoginRequest): Promise<LoginResult> {
    const activeCode = this.codeStore.findActiveCode(
      request.phone,
      request.userType === 'shipper' ? 'login' : 'login',
    );

    if (!activeCode || activeCode.code !== request.code) {
      throw new BusinessError(ApiErrorCode.AUTH_CODE_INVALID, '验证码错误');
    }

    this.codeStore.consumeCode(activeCode);

    const user: AuthenticatedUser = {
      id: `local-user-${request.phone}`,
      phone: request.phone,
      userType: request.userType,
    };

    return {
      user,
      tokens: this.tokenService.issueTokenPair(user.id),
    };
  }

  async refresh(request: RefreshRequest): Promise<TokenPair> {
    return this.tokenService.refreshTokenPair(request.refreshToken);
  }
}
```

- [ ] **Step 7: Implement Nest module and controller**

Create `apps/api/src/auth/auth.controller.ts`:

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ok } from '../common/api-response';
import { AuthService } from './auth.service';
import type { LoginRequest, RefreshRequest, SendCodeRequest } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('send-code')
  async sendCode(@Body() body: SendCodeRequest) {
    return ok(await this.authService.sendCode(body));
  }

  @Post('login')
  async login(@Body() body: LoginRequest) {
    return ok(await this.authService.login(body));
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshRequest) {
    return ok(await this.authService.refresh(body));
  }
}
```

Create `apps/api/src/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { InMemoryVerificationCodeStore } from './verification-code.store';

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: InMemoryVerificationCodeStore,
      useFactory: () => new InMemoryVerificationCodeStore(),
    },
    {
      provide: TokenService,
      useFactory: () =>
        new TokenService({
          accessTtlSeconds: 900,
          refreshTtlSeconds: 604800,
        }),
    },
    {
      provide: AuthService,
      useFactory: (
        codeStore: InMemoryVerificationCodeStore,
        tokenService: TokenService,
      ) => new AuthService(codeStore, tokenService),
      inject: [InMemoryVerificationCodeStore, TokenService],
    },
  ],
})
export class AuthModule {}
```

Modify `apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 8: Verify auth service**

Run:

```powershell
npm --prefix apps/api test -- auth.service.spec.ts
npm --prefix apps/api test
npm --prefix apps/api run typecheck
```

Expected: all commands PASS.

- [ ] **Step 9: Commit auth foundation**

```powershell
git add apps/api/src/auth apps/api/src/app.module.ts
git commit -m "feat(api): add auth foundation"
```

## Task 5: Add React Native Platform Auth API Adapter

**Files:**
- Create: `src/services/platformApiClient.ts`
- Create: `src/services/platformAuthApi.ts`
- Create: `__tests__/platformAuthApi.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Create `__tests__/platformAuthApi.test.ts`:

```ts
import {
  createPlatformAuthApi,
  type PlatformAuthTokens,
} from '../src/services/platformAuthApi';

describe('platform auth api', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends a verification code request', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { expireSeconds: 300, devCode: '123456' },
        requestId: 'req_test',
        timestamp: '2026-06-26T06:00:00.000Z',
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });

    await expect(
      api.sendCode({ phone: '13800138000', purpose: 'login' }),
    ).resolves.toEqual({ expireSeconds: 300, devCode: '123456' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/send-code',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phone: '13800138000', purpose: 'login' }),
      }),
    );
  });

  it('maps login token response', async () => {
    const tokens: PlatformAuthTokens = {
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: 'refresh.local-user-13800138000.604800',
      expiresIn: 900,
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          user: {
            id: 'local-user-13800138000',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens,
        },
        requestId: 'req_test',
        timestamp: '2026-06-26T06:00:00.000Z',
      }),
    }) as unknown as typeof fetch;

    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });

    await expect(
      api.login({
        phone: '13800138000',
        code: '123456',
        userType: 'shipper',
        deviceId: 'test-device',
      }),
    ).resolves.toEqual({
      user: {
        id: 'local-user-13800138000',
        phone: '13800138000',
        userType: 'shipper',
      },
      tokens,
    });
  });
});
```

- [ ] **Step 2: Run adapter tests to verify they fail**

Run:

```powershell
npm test -- --runInBand __tests__/platformAuthApi.test.ts
```

Expected: FAIL with missing `platformAuthApi`.

- [ ] **Step 3: Implement platform API client**

Create `src/services/platformApiClient.ts`:

```ts
export type PlatformApiConfig = {
  baseUrl: string;
  getAccessToken?: () => string | undefined;
};

export type PlatformApiResponse<T> = {
  code: 'OK';
  message: 'success';
  data: T;
  requestId: string;
  timestamp: string;
};

export async function platformPost<TRequest, TResponse>(
  config: PlatformApiConfig,
  path: string,
  body: TRequest,
): Promise<TResponse> {
  const accessToken = config.getAccessToken?.();
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Platform API request failed: ${response.status}`);
  }

  const payload = (await response.json()) as PlatformApiResponse<TResponse>;

  if (payload.code !== 'OK') {
    throw new Error(payload.message);
  }

  return payload.data;
}
```

- [ ] **Step 4: Implement platform auth API**

Create `src/services/platformAuthApi.ts`:

```ts
import {
  platformPost,
  type PlatformApiConfig,
} from './platformApiClient';

export type PlatformMobileUserType = 'shipper' | 'driver';
export type PlatformVerificationPurpose = 'login' | 'register' | 'reset';

export type PlatformSendCodeRequest = {
  phone: string;
  purpose: PlatformVerificationPurpose;
};

export type PlatformSendCodeResult = {
  expireSeconds: number;
  devCode?: string;
};

export type PlatformAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type PlatformAuthenticatedUser = {
  id: string;
  phone: string;
  userType: PlatformMobileUserType;
};

export type PlatformLoginRequest = {
  phone: string;
  code: string;
  userType: PlatformMobileUserType;
  deviceId: string;
};

export type PlatformLoginResult = {
  user: PlatformAuthenticatedUser;
  tokens: PlatformAuthTokens;
};

export function createPlatformAuthApi(config: PlatformApiConfig) {
  return {
    sendCode(request: PlatformSendCodeRequest) {
      return platformPost<PlatformSendCodeRequest, PlatformSendCodeResult>(
        config,
        '/auth/send-code',
        request,
      );
    },
    login(request: PlatformLoginRequest) {
      return platformPost<PlatformLoginRequest, PlatformLoginResult>(
        config,
        '/auth/login',
        request,
      );
    },
  };
}
```

- [ ] **Step 5: Verify mobile adapter**

Run:

```powershell
npm test -- --runInBand __tests__/platformAuthApi.test.ts
npx tsc --noEmit
```

Expected: both commands PASS.

- [ ] **Step 6: Commit mobile API adapter**

```powershell
git add src/services/platformApiClient.ts src/services/platformAuthApi.ts __tests__/platformAuthApi.test.ts
git commit -m "feat(mobile): add platform auth api adapter"
```

## Task 6: Final Verification and Handoff

**Files:**
- Modify: `docs/03-项目当前状态与补全路线.md`

- [ ] **Step 1: Update project status document**

Add this note to `docs/03-项目当前状态与补全路线.md` under the current conclusion section:

```markdown
本轮完整平台规划已进入阶段 0/1 实施准备：新增完整平台总体架构规格和阶段 0/1 实施计划，默认采用 NestJS + PostgreSQL + Redis + S3 兼容对象存储 + 高德地图 + Web 后台路线。下一步先落后端认证地基和移动端 API adapter，不直接开司机端、后台、地图、支付、推送、上传和 IM。
```

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test -- --runInBand
npx tsc --noEmit
npm run lint
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run prisma:validate
```

Expected:

- RN Jest suite passes.
- RN TypeScript passes.
- RN lint passes.
- API Jest suite passes.
- API TypeScript passes.
- Prisma schema validates.

- [ ] **Step 3: Review git status**

Run:

```powershell
git status --short
```

Expected: only intentional files from this plan are modified or untracked.

- [ ] **Step 4: Commit final status update**

```powershell
git add docs/03-项目当前状态与补全路线.md
git commit -m "docs: update platform foundation status"
```

- [ ] **Step 5: Stop before later phases**

Do not start driver端、后台、地图、支付、推送、上传或 IM work in this plan. Create separate specs and plans for those stages after stage 0/1 is verified.
