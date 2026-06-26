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
