import {
  PlatformApiError,
  platformGet,
  platformPost,
  type PlatformApiConfig,
} from './platformApiClient';

export type PlatformMobileUserType = 'shipper' | 'driver';
export type PlatformVerificationPurpose = 'login' | 'register' | 'reset';

export type PlatformSendCodeRequest = {
  phone: string;
  purpose: PlatformVerificationPurpose;
};

export type PlatformSendCodeResult = {
  expireSeconds: number;
  devCode?: string;
};

export type PlatformAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type PlatformAuthenticatedUser = {
  id: string;
  phone: string;
  userType: PlatformMobileUserType;
};

export type PlatformLoginRequest = {
  phone: string;
  code: string;
  userType: PlatformMobileUserType;
  deviceId: string;
};

export type PlatformLoginResult = {
  user: PlatformAuthenticatedUser;
  tokens: PlatformAuthTokens;
};

export type PlatformPasswordLoginRequest = {
  phone: string;
  password: string;
  userType: PlatformMobileUserType;
  deviceId: string;
};

export type PlatformPasswordLoginResult = PlatformLoginResult;

export type PlatformRegisterRequest = PlatformLoginRequest & {
  password: string;
};

export type PlatformRegisterResult = PlatformLoginResult;

export type PlatformResetPasswordRequest = {
  phone: string;
  code: string;
  password: string;
};

export type PlatformResetPasswordResult = {
  reset: true;
};

export type PlatformChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

export type PlatformChangePasswordResult = {
  changed: true;
};

export type PlatformRefreshRequest = {
  refreshToken: string;
  deviceId: string;
};

export type PlatformLogoutRequest = {
  refreshToken: string;
  deviceId: string;
};

export type PlatformLogoutResult = {
  loggedOut: true;
};

export function createPlatformAuthApi(config: PlatformApiConfig) {
  return {
    sendCode(request: PlatformSendCodeRequest) {
      return platformPost<PlatformSendCodeRequest, PlatformSendCodeResult>(
        config,
        '/auth/send-code',
        request,
        { includeAuth: false },
      );
    },
    login(request: PlatformLoginRequest) {
      return platformPost<PlatformLoginRequest, PlatformLoginResult>(
        config,
        '/auth/login',
        request,
        { includeAuth: false },
      );
    },
    passwordLogin(request: PlatformPasswordLoginRequest) {
      return platformPost<
        PlatformPasswordLoginRequest,
        PlatformPasswordLoginResult
      >(config, '/auth/password-login', request, { includeAuth: false });
    },
    register(request: PlatformRegisterRequest) {
      return platformPost<PlatformRegisterRequest, PlatformRegisterResult>(
        config,
        '/auth/register',
        request,
        { includeAuth: false },
      );
    },
    resetPassword(request: PlatformResetPasswordRequest) {
      return platformPost<
        PlatformResetPasswordRequest,
        PlatformResetPasswordResult
      >(config, '/auth/reset-password', request, { includeAuth: false });
    },
    changePassword(request: PlatformChangePasswordRequest) {
      return platformPost<
        PlatformChangePasswordRequest,
        PlatformChangePasswordResult
      >(config, '/auth/change-password', request);
    },
    async refresh(request: PlatformRefreshRequest) {
      const normalizedRequest = normalizeTokenSessionRequest(request);

      return platformPost<PlatformRefreshRequest, PlatformAuthTokens>(
        config,
        '/auth/refresh',
        normalizedRequest,
        { includeAuth: false },
      );
    },
    async logout(request: PlatformLogoutRequest) {
      const normalizedRequest = normalizeTokenSessionRequest(request);

      return platformPost<PlatformLogoutRequest, PlatformLogoutResult>(
        config,
        '/auth/logout',
        normalizedRequest,
        { includeAuth: false },
      );
    },
    getMe() {
      return platformGet<PlatformAuthenticatedUser>(config, '/me');
    },
  };
}

function normalizeTokenSessionRequest(
  request: PlatformRefreshRequest | PlatformLogoutRequest,
): PlatformRefreshRequest | PlatformLogoutRequest {
  if (!isPlainObject(request)) {
    throwInvalidTokenSessionRequest('Auth token session request is invalid');
  }

  return {
    refreshToken: normalizeRefreshToken(request.refreshToken),
    deviceId: normalizeRequiredTrimmedString(
      request.deviceId,
      'Auth token session device id is invalid',
    ),
  };
}

function normalizeRefreshToken(value: unknown) {
  const normalizedValue = normalizeRequiredTrimmedString(
    value,
    'Auth refresh token is invalid',
  );

  if (
    !/^refresh\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalizedValue,
    )
  ) {
    throwInvalidTokenSessionRequest('Auth refresh token is invalid');
  }

  return normalizedValue;
}

function normalizeRequiredTrimmedString(value: unknown, message: string) {
  if (typeof value !== 'string') {
    throwInvalidTokenSessionRequest(message);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throwInvalidTokenSessionRequest(message);
  }

  return normalizedValue;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwInvalidTokenSessionRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_AUTH_TOKEN_SESSION_REQUEST_INVALID',
    0,
  );
}
