# 地图/定位/导航第一片实施计划

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** 在没有真实高德 Key 的前提下，落地坐标地基、sandbox 地理编码、司机最新位置上报/读取与外跳导航。

**Architecture:** NestJS maps 模块 + sandbox provider；订单装/卸货坐标挂在 `OrderLocation`；司机只存最新位置快照；移动端 adapter + TrackingCard + deep-link 导航。

**Tech Stack:** NestJS、Prisma、PostgreSQL、React Native、Jest、Zod、OpenAPI。

---

## Task 1：Schema / migration / provider / env

- [ ] Prisma 扩 `OrderLocation` 坐标字段与 `DriverLocationSnapshot`
- [ ] `MAP_PROVIDER=sandbox` 环境项
- [ ] sandbox geocode + Haversine
- [ ] migration 契约测试

## Task 2：API

- [ ] `POST /maps/geocode`
- [ ] `POST /driver/location`
- [ ] `GET /shipper/orders/{orderId}/driver-location`
- [ ] `GET /driver/orders/{orderId}/navigation-targets`
- [ ] 订单 create/update 可选坐标 / sandbox 自动补齐
- [ ] OpenAPI

## Task 3：移动端

- [ ] `platformMapsApi`
- [ ] TrackingCard 读司机位置
- [ ] 外跳导航工具
- [ ] 发单 geocode 入口
- [ ] 测试

## Task 4：文档与验证

- [ ] 状态文档
- [ ] 聚焦测试 / typecheck / lint / prisma:validate
- [ ] 真实库不可达时如实记录
