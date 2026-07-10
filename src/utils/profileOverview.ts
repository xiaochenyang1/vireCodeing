import {
  accountTypeCopy,
  shipperSummary,
  verificationCopy,
} from '../data/mockData';
import type { ShipperSummary, VerificationStatus } from '../types';
import type {
  EnterpriseVerificationRequest,
  IdentityVerificationRequest,
  ProfileVerificationStatus,
  SavedAccountSettings,
} from './profileLocalState';

export type ProfileSectionId =
  | 'addresses'
  | 'contacts'
  | 'evaluations'
  | 'spending'
  | 'identity-verification'
  | 'enterprise-verification'
  | 'invoices'
  | 'coupons'
  | 'settings';

export type ProfileEntryConfig = {
  id: ProfileSectionId;
  title: string;
  description: string;
};

export type ProfileOverviewModelInput = {
  account: SavedAccountSettings;
  identityVerification?: IdentityVerificationRequest;
  enterpriseVerification?: EnterpriseVerificationRequest;
  monthlyOrderCount: number;
  unreadMessageCount: number;
  baseSummary?: ShipperSummary;
};

export type ProfileOverviewModel = {
  avatarInitial: string;
  displayName: string;
  accountTypeLabel: string;
  maskedPhone: string;
  verificationLabel: string;
  enterpriseVerificationLabel: string;
  creditScore: number;
  monthlyOrderCount: number;
  unreadMessageCount: number;
};

export const profileEntryConfigs: ProfileEntryConfig[] = [
  {
    id: 'addresses',
    title: '常用地址',
    description: '管理装货和卸货地址，本地版展示高频地址',
  },
  {
    id: 'contacts',
    title: '常用联系人',
    description: '保存装卸联系人，本地版展示高频联系人',
  },
  {
    id: 'evaluations',
    title: '我的评价',
    description: '查看已提交的司机评价记录',
  },
  {
    id: 'spending',
    title: '消费记录',
    description: '展示支付、退款和货到付款记录',
  },
  {
    id: 'identity-verification',
    title: '实名认证',
    description: '提交身份信息后可用于发单认证门禁',
  },
  {
    id: 'enterprise-verification',
    title: '企业认证',
    description: '提交企业信息后可用于发票与企业货主能力',
  },
  {
    id: 'invoices',
    title: '发票管理',
    description: '企业认证后可申请电子发票',
  },
  {
    id: 'coupons',
    title: '优惠券',
    description: '查看优惠券状态，本地版演示筛选和使用',
  },
  {
    id: 'settings',
    title: '设置',
    description: '账号安全、通知和隐私设置入口',
  },
];

export function createProfileOverviewModel({
  account,
  identityVerification,
  enterpriseVerification,
  monthlyOrderCount,
  unreadMessageCount,
  baseSummary = shipperSummary,
}: ProfileOverviewModelInput): ProfileOverviewModel {
  const verificationStatus = getEffectiveProfileVerificationStatus(
    identityVerification,
    baseSummary.verificationStatus,
  );
  const enterpriseVerificationStatus = getEffectiveProfileVerificationStatus(
    enterpriseVerification,
    baseSummary.enterpriseVerificationStatus,
  );
  const accountType =
    enterpriseVerification && !enterpriseVerification.rejectionReason
      ? 'enterprise'
      : baseSummary.accountType;

  return {
    avatarInitial: account.displayName.trim().charAt(0) || '货',
    displayName: account.displayName,
    accountTypeLabel: accountTypeCopy[accountType],
    maskedPhone: maskProfilePhoneNumber(account.boundPhone),
    verificationLabel: verificationCopy[verificationStatus].label,
    enterpriseVerificationLabel:
      verificationCopy[enterpriseVerificationStatus].label,
    creditScore: calculateProfileCreditScore({
      verificationStatus,
      enterpriseVerificationStatus,
    }),
    monthlyOrderCount,
    unreadMessageCount,
  };
}

export function maskProfilePhoneNumber(phoneNumber: string) {
  return phoneNumber.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

export function calculateProfileCreditScore({
  verificationStatus,
  enterpriseVerificationStatus,
}: {
  verificationStatus: VerificationStatus;
  enterpriseVerificationStatus: VerificationStatus;
}) {
  return (
    92 +
    (isCreditPositiveVerificationStatus(verificationStatus) ? 4 : 0) +
    (isCreditPositiveVerificationStatus(enterpriseVerificationStatus) ? 2 : 0)
  );
}

function getEffectiveProfileVerificationStatus(
  verification:
    | Pick<IdentityVerificationRequest, 'rejectionReason' | 'status'>
    | Pick<EnterpriseVerificationRequest, 'rejectionReason' | 'status'>
    | undefined,
  fallbackStatus: VerificationStatus,
) {
  const explicitStatus = mapProfileVerificationStatus(verification?.status);

  if (explicitStatus) {
    return explicitStatus;
  }

  if (verification?.rejectionReason) {
    return 'rejected';
  }

  if (verification) {
    return 'reviewing';
  }

  return fallbackStatus;
}

function isCreditPositiveVerificationStatus(status: VerificationStatus) {
  return status === 'verified' || status === 'reviewing';
}

function mapProfileVerificationStatus(
  status: ProfileVerificationStatus | undefined,
): VerificationStatus | undefined {
  if (status === 'approved') {
    return 'verified';
  }

  if (status === 'reviewing' || status === 'rejected') {
    return status;
  }

  return undefined;
}
