export type SaveShipperProfileAccountRequest = {
  displayName: string;
  avatarFileId?: string | null;
  phone?: string;
  phoneProtectionEnabled?: boolean;
  loginProtectionEnabled?: boolean;
  orderNotificationEnabled?: boolean;
  promotionNotificationEnabled?: boolean;
  privacyConfirmedAtIso?: string;
  privacyPolicyVersion?: string;
  privacyPolicyVersionTitle?: string;
};

export type ShipperProfileAccountRecord = {
  shipperId: string;
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
