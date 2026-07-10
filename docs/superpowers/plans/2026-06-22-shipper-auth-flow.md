# 货主端认证入口实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有货主端首页前增加本地登录/注册入口，登录成功后切回当前首页，并用测试覆盖这条主链路。

**Architecture:** `App.tsx` 持有一个轻量的屏幕状态，`AuthScreen` 负责表单和本地校验，`HomeScreen` 保留现在的首页 mock 数据与交互。认证不接后端，只做可测试的前端门禁和页面切换，避免把首页规格和后续页面耦合在一起。

**Tech Stack:** React Native 0.86, TypeScript, Jest, react-test-renderer.

---

### Task 1: Add auth screen and home gate in `App.tsx`

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Write the failing test**

```ts
test('logs in from the auth screen and reaches the shipper home', async () => {
  // 初始应看到登录页文案
  // 填入手机号和验证码后点击登录
  // 期望页面切换到首页并看到“立即发货”和“最近订单”
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --runInBand`
Expected: fail because `App.tsx` still only exposes the首页原型，没有认证门禁。

- [ ] **Step 3: Implement the minimal auth gate**

```tsx
type RootScreen = 'auth' | 'home';

function App() {
  const [screen, setScreen] = useState<RootScreen>('auth');

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics ?? fallbackSafeAreaMetrics}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <SafeAreaView style={styles.safeArea}>
        {screen === 'auth' ? (
          <AuthScreen onAuthenticated={() => setScreen('home')} />
        ) : (
          <HomeScreen onLogout={() => setScreen('auth')} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --runInBand`
Expected: PASS, and首页文案仍然可见。

### Task 2: Update verification coverage

**Files:**
- Modify: `__tests__/App.test.tsx`

- [ ] **Step 1: Add the auth-to-home interaction test**

```ts
expect(renderedText).toContain('登录');
expect(renderedText).toContain('注册');
expect(renderedText).toContain('立即发货');
expect(renderedText).toContain('最近订单');
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- --runInBand __tests__/App.test.tsx`
Expected: PASS.

- [ ] **Step 3: Keep the assertions narrow**

```ts
expect(renderedText).toContain('货运发单');
expect(renderedText).toContain('常用路线');
```

- [ ] **Step 4: Run the full suite**

Run: `npm test -- --runInBand`
Expected: PASS.

### Task 3: Final local verification

**Files:**
- No code changes

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Review the result**

If any command fails, fix the specific failure before moving to the next module.
