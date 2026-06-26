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
