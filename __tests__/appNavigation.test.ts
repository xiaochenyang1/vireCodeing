import {
  appNavigationReducer,
  initialAppNavigationState,
  type AppNavigationState,
} from '../src/navigation/appNavigation';

test('resets only the screen and keeps other navigation fields', () => {
  const state: AppNavigationState = {
    screen: 'auth',
    orderListFilter: 'waiting',
    orderDetailReturnTarget: 'orders',
    homeSupportView: 'messages',
  };

  expect(appNavigationReducer(state, { type: 'RESET', screen: 'home' })).toEqual(
    { ...state, screen: 'home' },
  );
});

test('go home defaults the support view to home and overrides it when provided', () => {
  expect(
    appNavigationReducer(initialAppNavigationState, { type: 'GO_HOME' }),
  ).toMatchObject({ screen: 'home', homeSupportView: 'home' });

  expect(
    appNavigationReducer(
      { ...initialAppNavigationState, homeSupportView: 'messages' },
      { type: 'GO_HOME' },
    ),
  ).toMatchObject({ screen: 'home', homeSupportView: 'home' });

  expect(
    appNavigationReducer(initialAppNavigationState, {
      type: 'GO_HOME',
      supportView: 'help',
    }),
  ).toMatchObject({ screen: 'home', homeSupportView: 'help' });
});

test('go auth resets the support view alongside the screen', () => {
  expect(
    appNavigationReducer(
      { ...initialAppNavigationState, homeSupportView: 'messages' },
      { type: 'GO_AUTH' },
    ),
  ).toMatchObject({ screen: 'auth', homeSupportView: 'home' });
});

test('go orders keeps the current filter when none is provided', () => {
  const state: AppNavigationState = {
    ...initialAppNavigationState,
    screen: 'order-detail',
    orderListFilter: 'confirming',
  };

  expect(appNavigationReducer(state, { type: 'GO_ORDERS' })).toMatchObject({
    screen: 'orders',
    orderListFilter: 'confirming',
  });

  expect(
    appNavigationReducer(state, { type: 'GO_ORDERS', filter: 'completed' }),
  ).toMatchObject({ screen: 'orders', orderListFilter: 'completed' });
});

test('go order detail derives the support view from the return target', () => {
  expect(
    appNavigationReducer(initialAppNavigationState, {
      type: 'GO_ORDER_DETAIL',
      returnTarget: 'messages',
    }),
  ).toMatchObject({
    screen: 'order-detail',
    orderDetailReturnTarget: 'messages',
    homeSupportView: 'messages',
  });

  expect(
    appNavigationReducer(initialAppNavigationState, {
      type: 'GO_ORDER_DETAIL',
      returnTarget: 'home',
    }),
  ).toMatchObject({
    screen: 'order-detail',
    orderDetailReturnTarget: 'home',
    homeSupportView: 'home',
  });

  // Returning to the order list must not disturb the support view.
  expect(
    appNavigationReducer(
      { ...initialAppNavigationState, homeSupportView: 'help' },
      { type: 'GO_ORDER_DETAIL', returnTarget: 'orders' },
    ),
  ).toMatchObject({
    screen: 'order-detail',
    orderDetailReturnTarget: 'orders',
    homeSupportView: 'help',
  });
});

test('simple screen transitions only change the screen field', () => {
  expect(
    appNavigationReducer(initialAppNavigationState, { type: 'GO_DRIVER_HOME' })
      .screen,
  ).toBe('driver-home');
  expect(
    appNavigationReducer(initialAppNavigationState, { type: 'GO_NETWORK_ERROR' })
      .screen,
  ).toBe('network-error');
  expect(
    appNavigationReducer(initialAppNavigationState, { type: 'GO_ORDER_DRAFT' })
      .screen,
  ).toBe('order-draft');
  expect(
    appNavigationReducer(initialAppNavigationState, { type: 'GO_ONBOARDING' })
      .screen,
  ).toBe('onboarding');
});
