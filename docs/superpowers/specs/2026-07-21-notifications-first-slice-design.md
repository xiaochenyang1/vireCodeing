# Notifications First Slice Design

## Goal

Replace local mock message-center data with platform inbox messages generated from real order events, and introduce a push provider abstraction defaulting to sandbox. Full IM chat is out of scope.

## Current Evidence

- Mobile message center is local-only (`messageCenterItems` mock, AsyncStorage runtime state).
- Architecture requires: inbox messages and system push are separate; important order events must create inbox records; push is only a delivery channel.
- No message tables, no notification APIs, no push provider module exist yet.

## Scope

### In Scope

- Prisma models:
  - `InboxMessage`
  - `PushDeliveryAttempt` (optional first-slice log, or store as JSON on outbox)
- APIs:
  - `GET /me/messages`
  - `POST /me/messages/{messageId}/read`
  - `POST /me/messages/read-all`
- Event writers for high-value order facts:
  - shipper order created / accepted / status advanced / completed / cancelled
  - driver accepted / status advanced
  - exception case created / resolved / compensation executed / appeal requested
- Sandbox `PushProvider` that records delivery attempts without vendor SDK
- Mobile:
  - `platformMessagesApi`
  - Home message center loads platform messages when logged in
  - mark-read syncs to platform
- OpenAPI, tests, status docs

### Out of Scope

- Real JPush / FCM / APNs vendor integration
- WebSocket realtime fan-out
- Full IM chat sessions between shipper and driver
- Customer-service live chat
- Rich notification templates center / marketing campaigns

## Data Model

```prisma
enum InboxMessageCategory {
  order
  system
  service
  finance
}

enum InboxMessageAudience {
  shipper
  driver
  admin
}

model InboxMessage {
  id              String
  userId          String
  audience        InboxMessageAudience
  category        InboxMessageCategory
  title           String
  content         String
  orderId         String?
  orderNo         String?
  referenceType   String?
  referenceId     String?
  unread          Boolean  @default(true)
  readAt          DateTime?
  createdAt       DateTime
  updatedAt       DateTime
}

model PushDeliveryAttempt {
  id              String
  messageId       String
  channel         String   // sandbox
  status          String   // succeeded | skipped | failed
  providerMessageId String?
  errorMessage    String?
  createdAt       DateTime
}
```

## Event Mapping (first slice)

| Event | Audience | Category | Title example |
|---|---|---|---|
| order created | shipper | order | 订单发布成功 |
| driver accepted | shipper + driver | order | 司机已接单 / 接单成功 |
| status advanced | shipper + driver | order | 订单状态更新 |
| completed | shipper + driver | order | 订单已完成 |
| cancelled | shipper (+driver if assigned) | order | 订单已取消 |
| exception case created | shipper + driver | service | 异常工单已创建 |
| exception resolved | shipper + driver | service | 异常工单已解决 |
| compensation executed | beneficiary role | finance | 异常赔付已执行 |
| appeal requested | counterparty + admin optional later | service | 异常工单申诉已提交 |

## Push Provider

```ts
interface PushProvider {
  send(input: {
    userId: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<{ status: 'succeeded' | 'skipped'; providerMessageId?: string }>;
}
```

Sandbox always returns `succeeded` with deterministic id and stores attempt row. Real vendors come later.

## Mobile

- On open message center / home hydrate: if platform adapter + token available, `GET /me/messages`
- Keep local mock only as offline fallback
- Mark read calls platform API; on success update local list
- Unread badge uses platform list when available

## Honesty Boundary

This is inbox + sandbox push foundation, not realtime IM and not production push delivery.
