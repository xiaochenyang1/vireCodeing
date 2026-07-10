# 货主端本地 MVP 收尾实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 稳住现有货主端本地 MVP，补齐可见的后端同步边界，并逐步拆分过大的页面文件，保证测试、类型检查和 lint 持续通过。

**Architecture:** 保持当前 React Native 本地状态架构，不引入真实后端、地图、支付或司机端。第一批行为补全在本地订单模型上增加同步状态和重试入口；后续拆分只移动已有 UI 组件边界，不改变用户路径。

**Tech Stack:** React Native 0.86, React 19, TypeScript, AsyncStorage, Jest, react-test-renderer.

---

### Task 1: Add visible local backend-sync boundary for orders

**Files:**
- Modify: `src/types.ts`
- Modify: `src/utils/order.ts`
- Modify: `src/screens/OrderDetailScreen.tsx`
- Modify: `__tests__/App.test.tsx`

- [x] **Step 1: Write the failing test**

Add a Jest test that publishes a local order, opens its detail, expects `后端同步：待同步`, presses `order-sync-retry`, and then expects `后端同步：已同步`.

Run: `npm test -- --runInBand __tests__/App.test.tsx -t "marks a newly published local order as pending backend sync"`
Expected: FAIL because order sync metadata and retry UI do not exist yet.

- [x] **Step 2: Add sync metadata to the order type**

Add `OrderSyncStatus` and optional `syncState` to `RecentOrder`, with status values `pending`, `synced`, and `failed`.

- [x] **Step 3: Mark newly created and edited local orders as pending**

Update `createLocalOrder()` and `createOrderUpdateFromDraft()` so new local orders and edited local orders record `syncState.status === 'pending'`.

- [x] **Step 4: Add sync retry action in order detail**

Render sync state in `OrderDetailScreen`; if status is `pending` or `failed`, show a retry button that updates the order to `synced`.

- [x] **Step 5: Verify the focused test passes**

Run: `npm test -- --runInBand __tests__/App.test.tsx -t "marks a newly published local order as pending backend sync"`
Expected: PASS.

### Task 2: Split order-detail local form components

**Files:**
- Create: `src/screens/order-detail/DriverInfoCard.tsx`
- Create: `src/screens/order-detail/DriverQuoteCard.tsx`
- Create: `src/screens/order-detail/TrackingCard.tsx`
- Create: `src/screens/order-detail/BonusForm.tsx`
- Create: `src/screens/order-detail/ExceptionReportForm.tsx`
- Create: `src/screens/order-detail/CancellationForm.tsx`
- Create: `src/screens/order-detail/ChangeRequestForm.tsx`
- Create: `src/screens/order-detail/DriverEvaluationForm.tsx`
- Modify: `src/screens/OrderDetailScreen.tsx`

- [x] **Step 1: Run current order detail tests as baseline**

Run: `npm test -- --runInBand __tests__/App.test.tsx -t "order|driver|exception|evaluation|cancel"`
Expected: PASS before refactor.

- [x] **Step 2: Move one component at a time**

Move each local component out of `OrderDetailScreen.tsx`, keep props unchanged, import the component back, and run the focused test group after each move.

- [x] **Step 3: Verify no behavior changed**

Run: `npm test -- --runInBand __tests__/App.test.tsx`
Expected: PASS.

### Task 3: Split draft form sections

**Files:**
- Create: `src/screens/order-draft/CargoSection.tsx`
- Create: `src/screens/order-draft/AddressSection.tsx`
- Create: `src/screens/order-draft/VehicleTimeSection.tsx`
- Create: `src/screens/order-draft/ValueAddedServicesSection.tsx`
- Create: `src/screens/order-draft/PriceSection.tsx`
- Modify: `src/screens/OrderDraftScreen.tsx`

- [x] **Step 1: Run draft tests as baseline**

Run: `npm test -- --runInBand __tests__/App.test.tsx -t "draft|publishes a local order|requires"`
Expected: PASS before refactor.

- [x] **Step 2: Extract sections without changing state ownership**

Keep form state and validation in `OrderDraftScreen.tsx`; move only rendering sections to focused components.

- [x] **Step 3: Verify full suite**

Run: `npm test -- --runInBand`
Expected: PASS.

### Task 4: Split profile center records

**Files:**
- Create: `src/screens/profile/AddressRecords.tsx`
- Create: `src/screens/profile/ContactRecords.tsx`
- Create: `src/screens/profile/EvaluationRecords.tsx`
- Create: `src/screens/profile/SpendingRecords.tsx`
- Create: `src/screens/profile/InvoiceRecords.tsx`
- Create: `src/screens/profile/CouponRecords.tsx`
- Create: `src/screens/profile/SettingRecords.tsx`
- Create: `src/screens/profile/profileRecordUtils.ts`
- Modify: `src/screens/ProfileCenterScreen.tsx`

- [x] **Step 1: Run profile tests as baseline**

Run: `npm test -- --runInBand __tests__/App.test.tsx -t "profile|invoice|coupon|setting|spending"`
Expected: PASS before refactor.

- [x] **Step 2: Extract one record module at a time**

Move each record view with its helper types and local helper functions where practical; keep shared profile state persistence in `ProfileCenterScreen.tsx`.

- [x] **Step 3: Verify full suite**

Run: `npm test -- --runInBand`
Expected: PASS.

### Task 5: Update status documentation and run gates

**Files:**
- Modify: `docs/03-项目当前状态与补全路线.md`

- [x] **Step 1: Update current status**

Record that local order backend-sync boundaries now exist and update the Jest count from 151 to the current passing count.

- [x] **Step 2: Run final gates**

Run:

```sh
npm test -- --runInBand
npx tsc --noEmit
npm run lint
```

Expected: all commands pass. npm may still print the local `Unknown user config "home"` warning.
