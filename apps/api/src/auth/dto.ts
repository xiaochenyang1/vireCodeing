export type VerificationPurpose = 'login' | 'register' | 'reset';
export type MobileUserType = 'shipper' | 'driver';

export type SendCodeRequest = {
  phone: string;
  purpose: VerificationPurpose;
};

export type SendCodeResult = {
  expireSeconds: number;
  devCode: string;
};

export type LoginRequest = {
  phone: string;
  code: string;
  userType: MobileUserType;
  deviceId: string;
};

export type RefreshRequest = {
  refreshToken: string;
  deviceId: string;
};

export type AuthenticatedUser = {
  id: string;
  phone: string;
  userType: MobileUserType;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type LoginResult = {
  user: AuthenticatedUser;
  tokens: TokenPair;
};
