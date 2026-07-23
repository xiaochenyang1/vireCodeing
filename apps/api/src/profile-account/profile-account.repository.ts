import type {
  SaveShipperProfileAccountRequest,
  ShipperProfileAccountRecord,
} from './dto';
import { ApiErrorCode, BusinessError } from '../common/errors';

export interface ProfileAccountRepository {
  findAccountByShipperId(
    shipperId: string,
    phone: string,
  ): Promise<ShipperProfileAccountRecord | undefined>;
  saveAccount(
    shipperId: string,
    phone: string,
    input: SaveShipperProfileAccountRequest,
  ): Promise<ShipperProfileAccountRecord>;
}

const defaultProfileAccountSnapshot = {
  phoneProtectionEnabled: true,
  loginProtectionEnabled: true,
  orderNotificationEnabled: true,
  promotionNotificationEnabled: false,
} as const;

type ResolvedProfileAccountSnapshot = {
  phoneProtectionEnabled: boolean;
  loginProtectionEnabled: boolean;
  orderNotificationEnabled: boolean;
  promotionNotificationEnabled: boolean;
  privacyConfirmedAtIso?: string;
  privacyPolicyVersion?: string | null;
  privacyPolicyVersionTitle?: string | null;
};

export class InMemoryProfileAccountRepository implements ProfileAccountRepository {
  private readonly accounts = new Map<string, ShipperProfileAccountRecord>();

  async findAccountByShipperId(shipperId: string, phone: string) {
    const account = this.accounts.get(shipperId);

    if (!account) {
      return undefined;
    }

    return {
      ...account,
      phone,
    };
  }

  async saveAccount(
    shipperId: string,
    phone: string,
    input: SaveShipperProfileAccountRequest,
  ): Promise<ShipperProfileAccountRecord> {
    const currentAccount = this.accounts.get(shipperId);
    const avatarFileId = resolveAvatarFileId(input, currentAccount);
    const accountSnapshot = resolveProfileAccountSnapshot(input, currentAccount);
    const nextPhone = input.phone ?? phone;
    const account: ShipperProfileAccountRecord = {
      shipperId,
      displayName: input.displayName,
      phone: nextPhone,
      phoneProtectionEnabled: accountSnapshot.phoneProtectionEnabled,
      loginProtectionEnabled: accountSnapshot.loginProtectionEnabled,
      orderNotificationEnabled: accountSnapshot.orderNotificationEnabled,
      promotionNotificationEnabled: accountSnapshot.promotionNotificationEnabled,
      ...(accountSnapshot.privacyConfirmedAtIso
        ? { privacyConfirmedAtIso: accountSnapshot.privacyConfirmedAtIso }
        : {}),
      ...(accountSnapshot.privacyPolicyVersion
        ? { privacyPolicyVersion: accountSnapshot.privacyPolicyVersion }
        : {}),
      ...(accountSnapshot.privacyPolicyVersionTitle
        ? { privacyPolicyVersionTitle: accountSnapshot.privacyPolicyVersionTitle }
        : {}),
      ...(avatarFileId ? { avatarFileId } : {}),
    };

    this.accounts.set(shipperId, account);

    return account;
  }
}

export type PrismaProfileAccountRecord = {
  userId: string;
  displayName: string;
  avatarFileId: string | null;
  phoneProtectionEnabled: boolean;
  loginProtectionEnabled: boolean;
  orderNotificationEnabled: boolean;
  promotionNotificationEnabled: boolean;
  privacyConfirmedAt: Date | null;
  privacyPolicyVersion: string | null;
  privacyPolicyVersionTitle: string | null;
};

type PrismaUserPhoneRecord = {
  id: string;
  phone: string;
};

type PrismaShipperProfileAccountDelegate = {
  findUnique(args: {
    where: { userId: string };
  }): Promise<PrismaProfileAccountRecord | null>;
  upsert(args: {
    where: { userId: string };
    create: {
      userId: string;
      displayName: string;
      avatarFileId?: string | null;
      phoneProtectionEnabled: boolean;
      loginProtectionEnabled: boolean;
      orderNotificationEnabled: boolean;
      promotionNotificationEnabled: boolean;
      privacyConfirmedAt?: Date | null;
      privacyPolicyVersion?: string | null;
      privacyPolicyVersionTitle?: string | null;
      identityStatus: string;
      enterpriseStatus: string;
    };
    update: {
      displayName: string;
      avatarFileId?: string | null;
      phoneProtectionEnabled: boolean;
      loginProtectionEnabled: boolean;
      orderNotificationEnabled: boolean;
      promotionNotificationEnabled: boolean;
      privacyConfirmedAt?: Date | null;
      privacyPolicyVersion?: string | null;
      privacyPolicyVersionTitle?: string | null;
    };
  }): Promise<PrismaProfileAccountRecord>;
};

type PrismaUserProfileAccountDelegate = {
  update(args: {
    where: { id: string };
    data: { phone: string };
  }): Promise<PrismaUserPhoneRecord>;
};

type PrismaProfileAccountTransactionClient = {
  shipperProfile: PrismaShipperProfileAccountDelegate;
  user: PrismaUserProfileAccountDelegate;
};

export type PrismaProfileAccountClient = PrismaProfileAccountTransactionClient & {
  $transaction<T>(
    callback: (transaction: PrismaProfileAccountTransactionClient) => Promise<T>,
  ): Promise<T>;
};

export class PrismaProfileAccountRepository implements ProfileAccountRepository {
  constructor(private readonly prisma: PrismaProfileAccountClient) {}

  async findAccountByShipperId(shipperId: string, phone: string) {
    const account = await this.prisma.shipperProfile.findUnique({
      where: { userId: shipperId },
    });

    return account ? mapPrismaProfileAccount(account, phone) : undefined;
  }

  async saveAccount(
    shipperId: string,
    phone: string,
    input: SaveShipperProfileAccountRequest,
  ): Promise<ShipperProfileAccountRecord> {
    const currentAccount = await this.prisma.shipperProfile.findUnique({
      where: { userId: shipperId },
    });
    const avatarFileId = resolveAvatarFileId(input, currentAccount);
    const accountSnapshot = resolveProfileAccountSnapshot(input, currentAccount);
    const nextPhone = input.phone ?? phone;

    const account = await this.prisma.$transaction(async transaction => {
      if (input.phone && input.phone !== phone) {
        try {
          await transaction.user.update({
            where: { id: shipperId },
            data: { phone: input.phone },
          });
        } catch (error) {
          if (isPhoneUniqueConflict(error)) {
            throw new BusinessError(
              ApiErrorCode.VALIDATION_ERROR,
              '手机号已被其他账号占用',
            );
          }

          throw error;
        }
      }

      return transaction.shipperProfile.upsert({
        where: { userId: shipperId },
        create: {
          userId: shipperId,
          displayName: input.displayName,
          ...createPrismaAvatarFileIdField(avatarFileId),
          phoneProtectionEnabled: accountSnapshot.phoneProtectionEnabled,
          loginProtectionEnabled: accountSnapshot.loginProtectionEnabled,
          orderNotificationEnabled: accountSnapshot.orderNotificationEnabled,
          promotionNotificationEnabled:
            accountSnapshot.promotionNotificationEnabled,
          ...(accountSnapshot.privacyConfirmedAtIso
            ? { privacyConfirmedAt: new Date(accountSnapshot.privacyConfirmedAtIso) }
            : {}),
          ...createPrismaPrivacyPolicyVersionFields(accountSnapshot),
          identityStatus: 'unverified',
          enterpriseStatus: 'unverified',
        },
        update: {
          displayName: input.displayName,
          ...createPrismaAvatarFileIdField(avatarFileId),
          phoneProtectionEnabled: accountSnapshot.phoneProtectionEnabled,
          loginProtectionEnabled: accountSnapshot.loginProtectionEnabled,
          orderNotificationEnabled: accountSnapshot.orderNotificationEnabled,
          promotionNotificationEnabled:
            accountSnapshot.promotionNotificationEnabled,
          ...(accountSnapshot.privacyConfirmedAtIso
            ? { privacyConfirmedAt: new Date(accountSnapshot.privacyConfirmedAtIso) }
            : {}),
          ...createPrismaPrivacyPolicyVersionFields(accountSnapshot),
        },
      });
    });

    return mapPrismaProfileAccount(account, nextPhone);
  }
}

function resolveAvatarFileId(
  input: SaveShipperProfileAccountRequest,
  currentAccount?:
    | Pick<ShipperProfileAccountRecord, 'avatarFileId'>
    | Pick<PrismaProfileAccountRecord, 'avatarFileId'>
    | null,
) {
  if (input.avatarFileId === null) {
    return null;
  }

  if (typeof input.avatarFileId === 'string') {
    return input.avatarFileId;
  }

  return getCurrentAvatarFileId(currentAccount);
}

function resolveProfileAccountSnapshot(
  input: SaveShipperProfileAccountRequest,
  currentAccount?:
    | Pick<
        ShipperProfileAccountRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAtIso'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | Pick<
        PrismaProfileAccountRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAt'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | null,
): ResolvedProfileAccountSnapshot {
  const currentPrivacyConfirmedAtIso = getCurrentPrivacyConfirmedAtIso(
    currentAccount,
  );
  const currentPrivacyPolicyVersion = getCurrentPrivacyPolicyVersion(
    currentAccount,
  );
  const currentPrivacyPolicyVersionTitle = getCurrentPrivacyPolicyVersionTitle(
    currentAccount,
  );
  const shouldClearPrivacyPolicyVersionSnapshot =
    input.privacyConfirmedAtIso !== undefined &&
    input.privacyConfirmedAtIso !== currentPrivacyConfirmedAtIso &&
    input.privacyPolicyVersion === undefined &&
    input.privacyPolicyVersionTitle === undefined;

  return {
    phoneProtectionEnabled:
      input.phoneProtectionEnabled ??
      currentAccount?.phoneProtectionEnabled ??
      defaultProfileAccountSnapshot.phoneProtectionEnabled,
    loginProtectionEnabled:
      input.loginProtectionEnabled ??
      currentAccount?.loginProtectionEnabled ??
      defaultProfileAccountSnapshot.loginProtectionEnabled,
    orderNotificationEnabled:
      input.orderNotificationEnabled ??
      currentAccount?.orderNotificationEnabled ??
      defaultProfileAccountSnapshot.orderNotificationEnabled,
    promotionNotificationEnabled:
      input.promotionNotificationEnabled ??
      currentAccount?.promotionNotificationEnabled ??
      defaultProfileAccountSnapshot.promotionNotificationEnabled,
    privacyConfirmedAtIso:
      input.privacyConfirmedAtIso ?? currentPrivacyConfirmedAtIso,
    privacyPolicyVersion:
      input.privacyPolicyVersion ??
      (shouldClearPrivacyPolicyVersionSnapshot
        ? null
        : currentPrivacyPolicyVersion),
    privacyPolicyVersionTitle:
      input.privacyPolicyVersionTitle ??
      (shouldClearPrivacyPolicyVersionSnapshot
        ? null
        : currentPrivacyPolicyVersionTitle),
  };
}

function getCurrentPrivacyConfirmedAtIso(
  currentAccount:
    | Pick<
        ShipperProfileAccountRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAtIso'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | Pick<
        PrismaProfileAccountRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAt'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | null
    | undefined,
) {
  if (!currentAccount) {
    return undefined;
  }

  if (hasLocalPrivacyConfirmedAtIso(currentAccount)) {
    return currentAccount.privacyConfirmedAtIso;
  }

  return currentAccount.privacyConfirmedAt?.toISOString();
}

function getCurrentAvatarFileId(
  currentAccount?:
    | Pick<ShipperProfileAccountRecord, 'avatarFileId'>
    | Pick<PrismaProfileAccountRecord, 'avatarFileId'>
    | null,
) {
  return typeof currentAccount?.avatarFileId === 'string'
    ? currentAccount.avatarFileId
    : undefined;
}

function hasLocalPrivacyConfirmedAtIso(
  currentAccount:
    | Pick<
        ShipperProfileAccountRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAtIso'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | Pick<
        PrismaProfileAccountRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAt'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >,
): currentAccount is Pick<
  ShipperProfileAccountRecord,
  | 'phoneProtectionEnabled'
  | 'loginProtectionEnabled'
  | 'orderNotificationEnabled'
  | 'promotionNotificationEnabled'
  | 'privacyConfirmedAtIso'
  | 'privacyPolicyVersion'
  | 'privacyPolicyVersionTitle'
> {
  return 'privacyConfirmedAtIso' in currentAccount;
}

function getCurrentPrivacyPolicyVersion(
  currentAccount:
    | Pick<
        ShipperProfileAccountRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAtIso'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | Pick<
        PrismaProfileAccountRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAt'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | null
    | undefined,
) {
  return typeof currentAccount?.privacyPolicyVersion === 'string'
    ? currentAccount.privacyPolicyVersion
    : undefined;
}

function getCurrentPrivacyPolicyVersionTitle(
  currentAccount:
    | Pick<
        ShipperProfileAccountRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAtIso'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | Pick<
        PrismaProfileAccountRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAt'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | null
    | undefined,
) {
  return typeof currentAccount?.privacyPolicyVersionTitle === 'string'
    ? currentAccount.privacyPolicyVersionTitle
    : undefined;
}

function mapPrismaProfileAccount(
  account: PrismaProfileAccountRecord,
  phone: string,
): ShipperProfileAccountRecord {
  return {
    shipperId: account.userId,
    displayName: account.displayName,
    phone,
    phoneProtectionEnabled: account.phoneProtectionEnabled,
    loginProtectionEnabled: account.loginProtectionEnabled,
    orderNotificationEnabled: account.orderNotificationEnabled,
    promotionNotificationEnabled: account.promotionNotificationEnabled,
    ...(account.privacyConfirmedAt
      ? { privacyConfirmedAtIso: account.privacyConfirmedAt.toISOString() }
      : {}),
    ...(account.privacyPolicyVersion
      ? { privacyPolicyVersion: account.privacyPolicyVersion }
      : {}),
    ...(account.privacyPolicyVersionTitle
      ? { privacyPolicyVersionTitle: account.privacyPolicyVersionTitle }
      : {}),
    ...(account.avatarFileId ? { avatarFileId: account.avatarFileId } : {}),
  };
}

function createPrismaPrivacyPolicyVersionFields(
  accountSnapshot: ResolvedProfileAccountSnapshot,
) {
  const privacyPolicyVersionFields: {
    privacyPolicyVersion?: string | null;
    privacyPolicyVersionTitle?: string | null;
  } = {};

  if (accountSnapshot.privacyPolicyVersion !== undefined) {
    privacyPolicyVersionFields.privacyPolicyVersion =
      accountSnapshot.privacyPolicyVersion;
  }

  if (accountSnapshot.privacyPolicyVersionTitle !== undefined) {
    privacyPolicyVersionFields.privacyPolicyVersionTitle =
      accountSnapshot.privacyPolicyVersionTitle;
  }

  return privacyPolicyVersionFields;
}

function createPrismaAvatarFileIdField(avatarFileId: string | null | undefined) {
  if (avatarFileId === undefined) {
    return {};
  }

  return { avatarFileId };
}

function isPhoneUniqueConflict(error: unknown) {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    (error as { code?: unknown }).code !== 'P2002'
  ) {
    return false;
  }

  const meta = 'meta' in error ? (error as { meta?: unknown }).meta : undefined;

  if (
    typeof meta !== 'object' ||
    meta === null ||
    !('target' in meta)
  ) {
    return false;
  }

  const target = (meta as { target?: unknown }).target;

  if (typeof target === 'string') {
    return target.includes('phone');
  }

  return (
    Array.isArray(target) &&
    target.some(
      field => typeof field === 'string' && field.includes('phone'),
    )
  );
}
