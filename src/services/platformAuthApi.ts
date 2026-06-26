import { platformPost, type PlatformApiConfig } from './platformApiClient';

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

export function createPlatformAuthApi(config: PlatformApiConfig) {
  return {
    sendCode(request: PlatformSendCodeRequest) {
      return platformPost<PlatformSendCodeRequest, PlatformSendCodeResult>(
        config,
        '/auth/send-code',
        request,
      );
    },
    login(request: PlatformLoginRequest) {
      return platformPost<PlatformLoginRequest, PlatformLoginResult>(
        config,
        '/auth/login',
        request,
      );
    },
  };
}
