# vireCodeing

一个处于阶段 1 的货运平台仓库，不再是单纯的 React Native 模板。

当前仓库同时包含：

- React Native 移动端：货主端主链路 + 司机端第一批执行链路
- NestJS + Prisma API：认证、订单、司机执行、支付账本、文件、地图、消息等
- 一批由 API 直接返回的静态后台控制台第一页

更完整的状态审计和设计说明见：

- `docs/03-项目当前状态与补全路线.md`
- `docs/platform/README.md`
- `docs/platform/openapi-stage-1.yaml`
- `docs/superpowers/specs/`
- `docs/superpowers/plans/`

## 当前已落地

- 手机验证码/密码认证、refresh session、`/me`
- 货主发单草稿、发单、订单列表、订单详情、改单、取消、确认送达
- 订单高风险写操作的幂等与乐观并发第一片
- 优惠券锁定/释放/核销与发单原子性第一片
- 司机大厅、报价、接单、执行状态推进、异常上报、评价回复
- 司机实名/车辆认证与后台审核第一片
- 异常工单、赔付执行、申诉重开第一片
- 货主帮助中心平台工单第一片
- 支付/退款/结算/提现账本第一片与财务对账第一片
- 文件上传意图、确认、S3 兼容存储第一片、附件预览签名
- 货主账号资料/设置快照同步第一片
- 地图 geocode/reverse-geocode、司机位置上报、导航目标、货主跟踪、司机大厅附近单过滤/排序第一片
- 站内信消息中心与 sandbox push 第一片

## 仍未完成

- 真实微信/支付宝/银行卡支付与真实打款
- 真实短信供应商、真实对象存储生产联调
- 应用内地图 SDK、轨迹回放、ETA、实时热态附近单
- IM/WebSocket/真实推送 SDK
- 完整后台 RBAC、多角色工作台、双人复核
- 监控告警、备份恢复、正式发布链路

## 目录

- `src/`：React Native 页面、adapter、本地运行态、工具函数
- `apps/api/`：NestJS API、Prisma schema、migration、验证脚本
- `__tests__/`：移动端与 adapter 测试
- `docs/platform/`：平台工程说明、ERD、OpenAPI、迁移口径
- `docs/superpowers/specs/`：设计规格
- `docs/superpowers/plans/`：实施计划

## 本地运行

### 1. 安装依赖

根项目：

```sh
npm install
```

API 子项目：

```sh
npm --prefix apps/api install
```

### 2. 运行移动端

启动 Metro：

```sh
npm start
```

运行 Android：

```sh
npm run android
```

运行 iOS：

```sh
bundle install
bundle exec pod install
npm run ios
```

### 3. 让移动端接 API

移动端不写 `apiBaseUrl` 时，仍可跑本地 MVP fallback。

要切到平台 API，先写运行时配置：

```sh
TRUCK_PLATFORM_API_BASE_URL=http://127.0.0.1:3000/api npm run platform:config:write
```

配置文件会写到：

- `src/config/platformBuildConfig.ts`

## API 运行

### 基础环境

- Node `>= 22.11.0`
- PostgreSQL（需要真实 API/Prisma/migration 验收时）
- 可选：Docker Desktop / Docker CLI（本地 PostgreSQL 或 MinIO）

环境样例：

- `apps/api/.env.example`

常见本地环境变量包括：

- `DATABASE_URL`
- `TEST_DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `PAYMENT_PROVIDER_MODE`
- `MAP_PROVIDER`

### 启动 API

开发模式：

```sh
npm --prefix apps/api run start:dev
```

构建：

```sh
npm --prefix apps/api run build
```

Prisma 校验：

```sh
npm --prefix apps/api run prisma:validate
```

## 常用检查命令

根项目：

```sh
npm test
npx tsc --noEmit
npm run lint
```

API：

```sh
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run prisma:validate
npm --prefix apps/api run build
```

## PostgreSQL 验收

先看诊断：

```sh
npm --prefix apps/api run db:postgres:doctor
npm --prefix apps/api run db:test:postgres:doctor
```

本地 PostgreSQL：

```sh
npm --prefix apps/api run db:dev:postgres:up
npm --prefix apps/api run db:dev:postgres:down
```

完整测试库 bootstrap：

```sh
npm --prefix apps/api run db:test:postgres:bootstrap
```

更细的命令口径见：

- `docs/platform/README.md`
- `apps/api/package.json`

## 当前阅读顺序

如果你刚接手这个仓库，建议按下面顺序看：

1. `docs/03-项目当前状态与补全路线.md`
2. `docs/platform/README.md`
3. `docs/platform/openapi-stage-1.yaml`
4. `App.tsx`
5. `apps/api/src/app.module.ts`

## 备注

这个仓库现在的真实状态是“很多第一片已经打通，但还远没到生产完成”。不要把本地 fallback、静态后台页或 sandbox provider 当成完整平台能力。
