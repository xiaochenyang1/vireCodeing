import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { AuthScreen } from '../src/screens/AuthScreen';
import { PlatformApiError } from '../src/services/platformApiClient';
import type { PlatformAuthTokens } from '../src/services/platformAuthApi';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

describe('AuthScreen platform adapter', () => {
  it('shows platform authentication copy when the platform adapter is injected', async () => {
    const platformAuthApi = {
      sendCode: jest.fn(),
      login: jest.fn(),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen
          now={1000}
          platformAuthApi={platformAuthApi}
          onAuthenticated={jest.fn()}
        />,
      );
    });

    expect(getRenderedText(renderer)).toContain(
      '登录和注册已接入平台认证接口。',
    );
  });

  it('sends login verification code through the injected platform API', async () => {
    const platformAuthApi = {
      sendCode: jest.fn().mockResolvedValue({
        expireSeconds: 300,
        devCode: '123456',
      }),
      login: jest.fn(),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen
          now={1000}
          platformAuthApi={platformAuthApi}
          onAuthenticated={jest.fn()}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-login-code-send' })
        .props.onPress();
    });

    expect(platformAuthApi.sendCode).toHaveBeenCalledWith({
      phone: '13800138000',
      purpose: 'login',
    });
    expect(getRenderedText(renderer)).toContain(
      '验证码已发送到 138****8000，等待平台接口验证。',
    );
  });

  it('uses the platform verification code expiry when validating login submission', async () => {
    const platformAuthApi = {
      sendCode: jest.fn().mockResolvedValue({
        expireSeconds: 1,
        devCode: '123456',
      }),
      login: jest.fn().mockResolvedValue({
        user: {
          id: 'local-user-13800138000',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440000',
          expiresIn: 900,
        },
      }),
    };
    const onAuthenticated = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen
          now={1000}
          platformAuthApi={platformAuthApi}
          onAuthenticated={onAuthenticated}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
    });
    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-login-code-send' })
        .props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.update(
        <AuthScreen
          now={2500}
          platformAuthApi={platformAuthApi}
          onAuthenticated={onAuthenticated}
        />,
      );
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-code' })
        .props.onChangeText('123456');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-login-submit' })
        .props.onPress();
    });

    expect(platformAuthApi.login).not.toHaveBeenCalled();
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(getRenderedText(renderer)).toContain('验证码已过期，请重新获取');
  });

  it('shows an actionable message when platform verification code delivery fails', async () => {
    const platformAuthApi = {
      sendCode: jest.fn().mockRejectedValue(
        new PlatformApiError(
          '验证码发送失败',
          'AUTH_CODE_DELIVERY_FAILED',
          502,
          'req_sms_failed',
        ),
      ),
      login: jest.fn(),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen
          now={1000}
          platformAuthApi={platformAuthApi}
          onAuthenticated={jest.fn()}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-login-code-send' })
        .props.onPress();
    });

    expect(getRenderedText(renderer)).toContain(
      '短信服务暂不可用，请稍后重试',
    );
  });

  it('shows an actionable message when platform verification code requests are rate limited', async () => {
    const platformAuthApi = {
      sendCode: jest.fn().mockRejectedValue(
        new PlatformApiError(
          'Too many verification code requests',
          'AUTH_CODE_RATE_LIMITED',
          429,
          'req_rate_limited',
        ),
      ),
      login: jest.fn(),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen
          now={1000}
          platformAuthApi={platformAuthApi}
          onAuthenticated={jest.fn()}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-login-code-send' })
        .props.onPress();
    });

    expect(getRenderedText(renderer)).toContain(
      '获取验证码过于频繁，请稍后再试',
    );
  });

  it('shows an actionable message when platform login fails because the network is unavailable', async () => {
    const platformAuthApi = {
      sendCode: jest.fn().mockResolvedValue({
        expireSeconds: 300,
        devCode: '123456',
      }),
      login: jest.fn().mockRejectedValue(
        new PlatformApiError(
          'Network request failed',
          'NETWORK_ERROR',
          0,
          undefined,
        ),
      ),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen
          now={1000}
          platformAuthApi={platformAuthApi}
          onAuthenticated={jest.fn()}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
    });
    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-login-code-send' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-code' })
        .props.onChangeText('123456');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-login-submit' })
        .props.onPress();
    });

    expect(getRenderedText(renderer)).toContain(
      '网络连接不可用，请检查网络后重试',
    );
  });

  it('shows an actionable message when the platform rejects a disabled user', async () => {
    const onAuthenticated = jest.fn();
    const platformAuthApi = {
      sendCode: jest.fn().mockResolvedValue({
        expireSeconds: 300,
        devCode: '123456',
      }),
      login: jest.fn().mockRejectedValue(
        new PlatformApiError(
          '账号已禁用',
          'AUTH_USER_DISABLED',
          403,
          'req_user_disabled',
        ),
      ),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen
          now={1000}
          platformAuthApi={platformAuthApi}
          onAuthenticated={onAuthenticated}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
    });
    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-login-code-send' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-code' })
        .props.onChangeText('123456');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-login-submit' })
        .props.onPress();
    });

    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(getRenderedText(renderer)).toContain(
      '账号已禁用，请联系客服处理',
    );
  });

  it('logs in through the injected platform API and returns token metadata', async () => {
    const tokens: PlatformAuthTokens = {
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: 'refresh.local-user-13800138000.604800',
      expiresIn: 900,
    };
    const onAuthenticated = jest.fn();
    const platformAuthApi = {
      sendCode: jest.fn().mockResolvedValue({
        expireSeconds: 300,
        devCode: '123456',
      }),
      login: jest.fn().mockResolvedValue({
        user: {
          id: 'local-user-13800138000',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens,
      }),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen
          now={1000}
          platformAuthApi={platformAuthApi}
          onAuthenticated={onAuthenticated}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
    });
    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-login-code-send' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-code' })
        .props.onChangeText('654321');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-login-submit' })
        .props.onPress();
    });

    expect(platformAuthApi.login).toHaveBeenCalledWith({
      phone: '13800138000',
      code: '654321',
      userType: 'shipper',
      deviceId: 'local-device',
    });
    expect(onAuthenticated).toHaveBeenCalledWith({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    }, {
      id: 'local-user-13800138000',
      phone: '13800138000',
      userType: 'shipper',
    });
  });

  it('does not expose password login in local demo mode', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen now={1000} onAuthenticated={jest.fn()} />,
      );
    });

    expect(
      renderer.root.findAllByProps({ testID: 'auth-login-method-password' }),
    ).toHaveLength(0);
  });

  it('does not expose password reset in local demo mode', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen now={1000} onAuthenticated={jest.fn()} />,
      );
    });

    expect(
      renderer.root.findAllByProps({ testID: 'auth-reset-password-link' }),
    ).toHaveLength(0);
  });

  it('logs in with password through the injected platform API and returns token metadata', async () => {
    const tokens: PlatformAuthTokens = {
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: 'refresh.local-user-13800138000.604800',
      expiresIn: 900,
    };
    const onAuthenticated = jest.fn();
    const platformAuthApi = {
      sendCode: jest.fn(),
      login: jest.fn(),
      passwordLogin: jest.fn().mockResolvedValue({
        user: {
          id: 'local-user-13800138000',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens,
      }),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen
          now={1000}
          platformAuthApi={platformAuthApi}
          onAuthenticated={onAuthenticated}
          deviceId="device-password"
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-method-password' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
      renderer.root
        .findByProps({ testID: 'auth-login-password' })
        .props.onChangeText('abc123');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-login-submit' })
        .props.onPress();
    });

    expect(platformAuthApi.passwordLogin).toHaveBeenCalledWith({
      phone: '13800138000',
      password: 'abc123',
      userType: 'shipper',
      deviceId: 'device-password',
    });
    expect(platformAuthApi.login).not.toHaveBeenCalled();
    expect(onAuthenticated).toHaveBeenCalledWith({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    }, {
      id: 'local-user-13800138000',
      phone: '13800138000',
      userType: 'shipper',
    });
  });

  it('shows an actionable message when platform password login fails', async () => {
    const onAuthenticated = jest.fn();
    const platformAuthApi = {
      sendCode: jest.fn(),
      login: jest.fn(),
      passwordLogin: jest.fn().mockRejectedValue(
        new PlatformApiError(
          '手机号或密码错误',
          'AUTH_PASSWORD_INVALID',
          401,
          'req_password_invalid',
        ),
      ),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen
          now={1000}
          platformAuthApi={platformAuthApi}
          onAuthenticated={onAuthenticated}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-method-password' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
      renderer.root
        .findByProps({ testID: 'auth-login-password' })
        .props.onChangeText('wrong123');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-login-submit' })
        .props.onPress();
    });

    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(getRenderedText(renderer)).toContain('手机号或密码错误');
  });

  it('resets a password through the injected platform API without authenticating', async () => {
    const onAuthenticated = jest.fn();
    const platformAuthApi = {
      sendCode: jest.fn().mockResolvedValue({
        expireSeconds: 300,
        devCode: '123456',
      }),
      login: jest.fn(),
      passwordLogin: jest.fn(),
      resetPassword: jest.fn().mockResolvedValue({
        reset: true,
      }),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen
          now={1000}
          platformAuthApi={platformAuthApi}
          onAuthenticated={onAuthenticated}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-method-password' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-reset-password-link' })
        .props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-reset-code-send' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-reset-code' })
        .props.onChangeText('123456');
      renderer.root
        .findByProps({ testID: 'auth-reset-password' })
        .props.onChangeText('newabc123');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-reset-submit' })
        .props.onPress();
    });

    expect(platformAuthApi.sendCode).toHaveBeenCalledWith({
      phone: '13800138000',
      purpose: 'reset',
    });
    expect(platformAuthApi.resetPassword).toHaveBeenCalledWith({
      phone: '13800138000',
      code: '123456',
      password: 'newabc123',
    });
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(getRenderedText(renderer)).toContain(
      '密码已重置，请使用新密码登录',
    );
    expect(
      renderer.root.findAllByProps({ testID: 'auth-login-password' }),
    ).not.toHaveLength(0);
  });

  it('shows an actionable message when platform password reset fails', async () => {
    const onAuthenticated = jest.fn();
    const platformAuthApi = {
      sendCode: jest.fn().mockResolvedValue({
        expireSeconds: 300,
        devCode: '123456',
      }),
      login: jest.fn(),
      passwordLogin: jest.fn(),
      resetPassword: jest.fn().mockRejectedValue(
        new PlatformApiError(
          '手机号或验证码错误',
          'AUTH_PASSWORD_RESET_INVALID',
          401,
          'req_reset_invalid',
        ),
      ),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen
          now={1000}
          platformAuthApi={platformAuthApi}
          onAuthenticated={onAuthenticated}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-login-method-password' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-reset-password-link' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-reset-phone' })
        .props.onChangeText('13800138000');
    });
    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-reset-code-send' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-reset-code' })
        .props.onChangeText('000000');
      renderer.root
        .findByProps({ testID: 'auth-reset-password' })
        .props.onChangeText('newabc123');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-reset-submit' })
        .props.onPress();
    });

    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(getRenderedText(renderer)).toContain('手机号或验证码错误');
  });

  it('registers through the injected platform API and returns token metadata', async () => {
    const tokens: PlatformAuthTokens = {
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: 'refresh.local-user-13800138000.604800',
      expiresIn: 900,
    };
    const onAuthenticated = jest.fn();
    const platformAuthApi = {
      sendCode: jest.fn().mockResolvedValue({
        expireSeconds: 300,
        devCode: '123456',
      }),
      login: jest.fn(),
      register: jest.fn().mockResolvedValue({
        user: {
          id: 'local-user-13800138000',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens,
      }),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen
          now={1000}
          platformAuthApi={platformAuthApi}
          onAuthenticated={onAuthenticated}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'auth-tab-register' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-register-phone' })
        .props.onChangeText('13800138000');
    });
    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-register-code-send' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'auth-register-code' })
        .props.onChangeText('654321');
      renderer.root
        .findByProps({ testID: 'auth-register-password' })
        .props.onChangeText('abc123');
      renderer.root
        .findByProps({ testID: 'auth-register-agreement' })
        .props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'auth-register-submit' })
        .props.onPress();
    });

    expect(platformAuthApi.sendCode).toHaveBeenCalledWith({
      phone: '13800138000',
      purpose: 'register',
    });
    expect(platformAuthApi.register).toHaveBeenCalledWith({
      phone: '13800138000',
      code: '654321',
      userType: 'shipper',
      deviceId: 'local-device',
      password: 'abc123',
    });
    expect(onAuthenticated).toHaveBeenCalledWith({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    }, {
      id: 'local-user-13800138000',
      phone: '13800138000',
      userType: 'shipper',
    });
  });
});
