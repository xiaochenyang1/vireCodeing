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
