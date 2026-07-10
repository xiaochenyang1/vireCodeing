# Driver Order Execution First Slice Design

## Goal

Add the next driver-side MVP slice after accepting an order: a driver can open accepted order details and advance the order through the execution statuses.

## Scope

This slice includes:

- Driver API to list the current driver's accepted/executing orders.
- Driver API to get one accepted/executing order detail.
- Driver API to advance an accepted order from `loading` to `transporting`, and from `transporting` to `confirming`.
- Mobile driver home showing accepted/executing orders separately from the public order hall.
- Mobile driver controls for opening details and advancing status.
- OpenAPI and status documentation.

This slice does not include maps, live location, proof uploads, payment settlement, income, push, IM, admin review, driver certification, vehicle certification, or final shipper confirmation. Completion still belongs to the shipper `/complete` flow in this slice.

## Architecture

The backend keeps using the existing `Order` and `OrderEvent` model. A driver-owned order is identified by a `driver_accepted` event whose `actorUserId` is the current driver, avoiding a schema migration while PostgreSQL is unavailable. Driver status changes append `driver_status_changed` events and reuse the same order status enum.

The mobile adapter extends `platformDriverOrderApi` with `listMyOrders`, `getOrder`, and `advanceOrderStatus`. `DriverHomeScreen` keeps one compact driver workspace: public hall first, accepted orders second, with a selected detail panel.

## API Design

- `GET /driver/orders?statuses=loading,transporting,confirming`
  Returns current driver's accepted/executing orders.
- `GET /driver/orders/{orderId}`
  Returns order detail only if the current driver accepted it.
- `POST /driver/orders/{orderId}/status`
  Body: `{ "nextStatus": "transporting" | "confirming" }`.

Allowed transitions:

- `loading -> transporting`
- `transporting -> confirming`

Rejected transitions return `409 ORDER_STATE_INVALID`. Non-driver users return `403 AUTH_FORBIDDEN`. Orders not accepted by the current driver return `404 ORDER_NOT_FOUND`.

## Mobile Design

`DriverHomeScreen` remains utilitarian and dense:

- Top actions: refresh hall, refresh my orders, logout.
- Hall cards: existing quote and accept behavior.
- My orders section: accepted/executing order cards with status and route.
- Detail panel: selected order's contacts, cargo, vehicle requirement, event count, and next status action.
- Failure notices stay in the existing notice card.

## Testing

Backend tests cover authorization, current-driver ownership, list/detail, allowed transitions, and rejected transitions. Mobile adapter tests cover new paths and request validation. App tests cover accepted orders loading after driver login, opening detail, advancing status, and failure notices.
