export type SaveDriverProfileRequest = {
  displayName: string;
  avatarFileId?: string | null;
  phoneProtectionEnabled?: boolean;
  loginProtectionEnabled?: boolean;
  orderNotificationEnabled?: boolean;
  promotionNotificationEnabled?: boolean;
  privacyConfirmedAtIso?: string;
  privacyPolicyVersion?: string;
  privacyPolicyVersionTitle?: string;
};

export type DriverProfileRecord = {
  driverId: string;
  displayName: string;
  phone: string;
  phoneProtectionEnabled: boolean;
  loginProtectionEnabled: boolean;
  orderNotificationEnabled: boolean;
  promotionNotificationEnabled: boolean;
  privacyConfirmedAtIso?: string;
  privacyPolicyVersion?: string;
  privacyPolicyVersionTitle?: string;
  avatarFileId?: string;
  avatarPublicUrl?: string;
};
