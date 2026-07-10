export type VerificationPurpose = 'login' | 'register' | 'reset';
export type MobileUserType = 'shipper' | 'driver';
export type PlatformUserType = MobileUserType | 'admin';
export type MobileUserStatus = 'active' | 'disabled';

export type SendCodeRequest = {
  phone: string;
  purpose: VerificationPurpose;
};

export type SendCodeResult = {
  expireSeconds: number;
  devCode?: string;
};

export type LoginRequest = {
  phone: string;
  code: string;
  userType: MobileUserType;
  deviceId: string;
};

export type PasswordLoginRequest = {
  phone: string;
  password: string;
  userType: MobileUserType;
  deviceId: string;
};

export type RegisterRequest = {
  phone: string;
  code: string;
  userType: MobileUserType;
  deviceId: string;
  password: string;
};

export type ResetPasswordRequest = {
  phone: string;
  code: string;
  password: string;
};

export type ResetPasswordResult = {
  reset: true;
};

export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResult = {
  changed: true;
};

export type RefreshRequest = {
  refreshToken: string;
  deviceId: string;
};

export type LogoutRequest = {
  refreshToken: string;
  deviceId: string;
};

export type LogoutResult = {
  loggedOut: true;
};

export type AuthenticatedUser = {
  id: string;
  phone: string;
  userType: PlatformUserType;
};

export type AuthenticatedUserRecord = AuthenticatedUser & {
  status: MobileUserStatus;
  passwordHash?: string;
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

export type RegisterResult = LoginResult;
export type PasswordLoginResult = LoginResult;
