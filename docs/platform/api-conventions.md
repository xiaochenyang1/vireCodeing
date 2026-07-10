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

常见业务错误状态：鉴权失败使用 HTTP 401，验证码发送频控使用 HTTP 429，验证码发送上游失败使用 HTTP 502。

## 认证

受保护接口移动端请求使用：

```http
Authorization: Bearer <accessToken>
X-Client-Platform: android
X-App-Version: 0.0.1
X-Request-Id: req_client_generated_id
```

`/auth/send-code`、`/auth/login`、`/auth/password-login`、`/auth/register`、`/auth/reset-password`、`/auth/refresh` 和 `/auth/logout` 不携带 bearer access token；`/me` 和 `/auth/change-password` 这类登录后接口才携带 `Authorization`。

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
