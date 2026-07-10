# 货车接单平台 - API接口文档

## 文档说明

**版本**：v1.0  
**基础URL**：`https://api.truck-platform.com/v1`  
**协议**：HTTPS  
**数据格式**：JSON

---

## 通用说明

### 请求头
```http
Content-Type: application/json
Authorization: Bearer {token}
Platform: android
App-Version: 1.0.0
```

### 通用响应格式
```json
{
  "code": 200,
  "message": "success",
  "data": {},
  "timestamp": 1719043200000
}
```

### 状态码说明
| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权/Token失效 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |

---

## 一、用户认证模块

### 1.1 发送验证码
**接口**: `POST /auth/send-code`

**请求参数**:
```json
{
  "phone": "13800138000",
  "type": "login"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| phone | string | 是 | 手机号 |
| type | string | 是 | 类型: login/register/reset |

**响应示例**:
```json
{
  "code": 200,
  "message": "验证码已发送",
  "data": {
    "expireTime": 300
  }
}
```

### 1.2 注册
**接口**: `POST /auth/register`

**请求参数**:
```json
{
  "phone": "13800138000",
  "code": "123456",
  "password": "abc123456",
  "userType": 1,
  "inviteCode": ""
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| phone | string | 是 | 手机号 |
| code | string | 是 | 验证码 |
| password | string | 是 | 密码(6-20位) |
| userType | int | 是 | 1-货主 2-车主 |
| inviteCode | string | 否 | 邀请码 |

**响应示例**:
```json
{
  "code": 200,
  "message": "注册成功",
  "data": {
    "userId": "1001",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "userType": 1
  }
}
```

### 1.3 登录
**接口**: `POST /auth/login`

**请求参数**:
```json
{
  "phone": "13800138000",
  "password": "abc123456"
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "userId": "1001",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "userType": 1,
    "userInfo": {
      "nickname": "张三",
      "avatar": "https://...",
      "isRealAuth": true,
      "isVehicleAuth": false
    }
  }
}
```

### 1.4 退出登录
**接口**: `POST /auth/logout`

**请求头**: 需要Token

**响应示例**:
```json
{
  "code": 200,
  "message": "退出成功"
}
```

---

## 二、用户信息模块

### 2.1 获取用户信息
**接口**: `GET /user/info`

**响应示例**:
```json
{
  "code": 200,
  "data": {
    "userId": "1001",
    "phone": "138****8000",
    "nickname": "张三",
    "avatar": "https://...",
    "userType": 1,
    "isRealAuth": true,
    "isVehicleAuth": false,
    "balance": 1500.50,
    "credit": 95
  }
}
```

### 2.2 更新用户信息
**接口**: `PUT /user/info`

**请求参数**:
```json
{
  "nickname": "李四",
  "avatar": "https://..."
}
```

### 2.3 实名认证
**接口**: `POST /user/real-auth`

**请求参数**:
```json
{
  "realName": "张三",
  "idCard": "110101199001011234",
  "idCardFront": "https://...",
  "idCardBack": "https://..."
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "提交成功，等待审核",
  "data": {
    "authId": "A10001",
    "status": 0
  }
}
```

### 2.4 车辆认证（车主端）
**接口**: `POST /user/vehicle-auth`

**请求参数**:
```json
{
  "vehicleType": 1,
  "vehicleLength": 4.2,
  "vehicleLoad": 2.0,
  "plateNumber": "京A12345",
  "drivingLicense": "https://...",
  "vehiclePhoto": "https://...",
  "driverLicense": "https://...",
  "transportLicense": "https://..."
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| vehicleType | int | 是 | 1-小货车 2-中货车 3-大货车 |
| vehicleLength | float | 是 | 车长(米) |
| vehicleLoad | float | 是 | 载重(吨) |
| plateNumber | string | 是 | 车牌号 |
| drivingLicense | string | 是 | 行驶证照片 |
| vehiclePhoto | string | 是 | 车辆照片 |
| driverLicense | string | 是 | 驾驶证照片 |
| transportLicense | string | 否 | 道路运输证 |

---

## 三、订单模块（货主端）

### 3.1 创建订单
**接口**: `POST /order/create`

**请求参数**:
```json
{
  "cargoInfo": {
    "cargoType": 1,
    "cargoName": "电子产品",
    "cargoWeight": 500,
    "cargoVolume": 2.5,
    "cargoCount": 10,
    "cargoValue": 50000,
    "specialRequire": "防震包装"
  },
  "pickupInfo": {
    "address": "北京市朝阳区xxx路xxx号",
    "longitude": 116.407526,
    "latitude": 39.904030,
    "contactName": "张三",
    "contactPhone": "13800138000",
    "pickupTime": "2026-06-23 09:00:00"
  },
  "deliveryInfo": {
    "address": "上海市浦东新区xxx路xxx号",
    "longitude": 121.472644,
    "latitude": 31.231706,
    "contactName": "李四",
    "contactPhone": "13900139000",
    "expectTime": "2026-06-25 18:00:00"
  },
  "vehicleRequire": {
    "vehicleType": 2,
    "minLength": 6.8,
    "minLoad": 5.0
  },
  "freightInfo": {
    "freight": 3000,
    "payType": 1
  }
}
```

**参数说明**:
- cargoType: 1-普货 2-危险品 3-冷链
- vehicleType: 1-小货车 2-中货车 3-大货车
- payType: 1-预付 2-到付

**响应示例**:
```json
{
  "code": 200,
  "message": "订单创建成功",
  "data": {
    "orderId": "O202606230001",
    "orderNo": "20260623123456789",
    "status": 0,
    "distance": 1200.5,
    "estimatedFreight": 3000
  }
}
```

### 3.2 订单列表
**接口**: `GET /order/list`

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | int | 否 | 0-待接单 1-待装货 2-运输中 3-已送达 4-已完成 5-已取消 |
| page | int | 是 | 页码，从1开始 |
| pageSize | int | 是 | 每页数量 |

**响应示例**:
```json
{
  "code": 200,
  "data": {
    "total": 50,
    "page": 1,
    "pageSize": 10,
    "list": [
      {
        "orderId": "O202606230001",
        "orderNo": "20260623123456789",
        "status": 2,
        "statusText": "运输中",
        "cargoName": "电子产品",
        "pickupAddress": "北京市朝阳区...",
        "deliveryAddress": "上海市浦东新区...",
        "freight": 3000,
        "distance": 1200.5,
        "driverInfo": {
          "driverId": "D1001",
          "driverName": "王师傅",
          "driverPhone": "139****9000",
          "plateNumber": "京A12345"
        },
        "createTime": "2026-06-23 08:30:00"
      }
    ]
  }
}
```

### 3.3 订单详情
**接口**: `GET /order/detail/{orderId}`

**响应示例**:
```json
{
  "code": 200,
  "data": {
    "orderId": "O202606230001",
    "orderNo": "20260623123456789",
    "status": 2,
    "statusText": "运输中",
    "cargoInfo": {
      "cargoType": 1,
      "cargoName": "电子产品",
      "cargoWeight": 500,
      "cargoVolume": 2.5,
      "cargoCount": 10
    },
    "pickupInfo": {
      "address": "北京市朝阳区xxx路xxx号",
      "longitude": 116.407526,
      "latitude": 39.904030,
      "contactName": "张三",
      "contactPhone": "13800138000",
      "pickupTime": "2026-06-23 09:00:00",
      "actualPickupTime": "2026-06-23 09:15:00",
      "pickupPhotos": ["https://...", "https://..."]
    },
    "deliveryInfo": {
      "address": "上海市浦东新区xxx路xxx号",
      "longitude": 121.472644,
      "latitude": 31.231706,
      "contactName": "李四",
      "contactPhone": "13900139000",
      "expectTime": "2026-06-25 18:00:00"
    },
    "driverInfo": {
      "driverId": "D1001",
      "driverName": "王师傅",
      "driverPhone": "139****9000",
      "plateNumber": "京A12345",
      "vehicleType": 2,
      "credit": 98
    },
    "freightInfo": {
      "freight": 3000,
      "payType": 1,
      "payStatus": 1,
      "payTime": "2026-06-23 08:35:00"
    },
    "distance": 1200.5,
    "createTime": "2026-06-23 08:30:00",
    "acceptTime": "2026-06-23 08:45:00"
  }
}
```

### 3.4 取消订单
**接口**: `POST /order/cancel`

**请求参数**:
```json
{
  "orderId": "O202606230001",
  "cancelReason": "临时取消"
}
```

### 3.5 确认收货
**接口**: `POST /order/confirm-delivery`

**请求参数**:
```json
{
  "orderId": "O202606230001"
}
```

### 3.6 评价订单
**接口**: `POST /order/evaluate`

**请求参数**:
```json
{
  "orderId": "O202606230001",
  "score": 5,
  "content": "师傅服务很好，准时送达",
  "tags": ["准时", "服务好", "货物完好"]
}
```

---

## 四、订单模块（车主端）

### 4.1 订单大厅
**接口**: `GET /driver/order/hall`

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| longitude | float | 是 | 当前经度 |
| latitude | float | 是 | 当前纬度 |
| orderBy | string | 否 | distance-距离 freight-运费 time-时间 |
| vehicleType | int | 否 | 车型筛选 |
| minFreight | float | 否 | 最低运费 |
| maxFreight | float | 否 | 最高运费 |
| page | int | 是 | 页码 |
| pageSize | int | 是 | 每页数量 |

**响应示例**:
```json
{
  "code": 200,
  "data": {
    "total": 100,
    "list": [
      {
        "orderId": "O202606230002",
        "orderNo": "20260623123456790",
        "cargoName": "日用品",
        "cargoWeight": 300,
        "pickupAddress": "北京市海淀区...",
        "deliveryAddress": "天津市南开区...",
        "distance": 150.5,
        "freight": 800,
        "vehicleRequire": {
          "vehicleType": 1,
          "minLength": 4.2
        },
        "pickupTime": "2026-06-23 14:00:00",
        "createTime": "2026-06-23 10:00:00",
        "distanceFromMe": 5.2
      }
    ]
  }
}
```
