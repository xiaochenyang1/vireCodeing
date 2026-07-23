import type {
  DriverProfileRecord,
  SaveDriverProfileRequest,
} from './dto';
import { ApiErrorCode, BusinessError } from '../common/errors';

export interface ProfileDriverRepository {
  findProfileByDriverId(
    driverId: string,
    phone: string,
  ): Promise<DriverProfileRecord | undefined>;
  saveProfile(
    driverId: string,
    phone: string,
    input: SaveDriverProfileRequest,
  ): Promise<DriverProfileRecord>;
}

const defaultDriverProfileSnapshot = {
  phoneProtectionEnabled: true,
  loginProtectionEnabled: true,
  orderNotificationEnabled: true,
  promotionNotificationEnabled: false,
} as const;

type ResolvedDriverProfileSnapshot = {
  phoneProtectionEnabled: boolean;
  loginProtectionEnabled: boolean;
  orderNotificationEnabled: boolean;
  promotionNotificationEnabled: boolean;
  privacyConfirmedAtIso?: string;
  privacyPolicyVersion?: string | null;
  privacyPolicyVersionTitle?: string | null;
};

export class InMemoryProfileDriverRepository
  implements ProfileDriverRepository
{
  private readonly profiles = new Map<string, DriverProfileRecord>();

  async findProfileByDriverId(driverId: string, phone: string) {
    const profile = this.profiles.get(driverId);

    if (!profile) {
      return undefined;
    }

    return {
      ...profile,
      phone,
    };
  }

  async saveProfile(
    driverId: string,
    phone: string,
    input: SaveDriverProfileRequest,
  ): Promise<DriverProfileRecord> {
    const currentProfile = this.profiles.get(driverId);
    const avatarFileId = resolveAvatarFileId(input, currentProfile);
    const profileSnapshot = resolveDriverProfileSnapshot(input, currentProfile);
    const nextPhone = input.phone ?? phone;
    const profile: DriverProfileRecord = {
      driverId,
      displayName: input.displayName,
      phone: nextPhone,
      phoneProtectionEnabled: profileSnapshot.phoneProtectionEnabled,
      loginProtectionEnabled: profileSnapshot.loginProtectionEnabled,
      orderNotificationEnabled: profileSnapshot.orderNotificationEnabled,
      promotionNotificationEnabled:
        profileSnapshot.promotionNotificationEnabled,
      ...(profileSnapshot.privacyConfirmedAtIso
        ? { privacyConfirmedAtIso: profileSnapshot.privacyConfirmedAtIso }
        : {}),
      ...(profileSnapshot.privacyPolicyVersion
        ? { privacyPolicyVersion: profileSnapshot.privacyPolicyVersion }
        : {}),
      ...(profileSnapshot.privacyPolicyVersionTitle
        ? { privacyPolicyVersionTitle: profileSnapshot.privacyPolicyVersionTitle }
        : {}),
      ...(avatarFileId ? { avatarFileId } : {}),
    };

    this.profiles.set(driverId, profile);

    return profile;
  }
}

export type PrismaDriverProfileRecord = {
  driverId: string;
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

type PrismaDriverProfileDelegate = {
  findUnique(args: { where: { driverId: string } }): Promise<PrismaDriverProfileRecord | null>;
  upsert(args: {
    where: { driverId: string };
    create: {
      driverId: string;
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
  }): Promise<PrismaDriverProfileRecord>;
};

type PrismaUserDriverProfileDelegate = {
  update(args: {
    where: { id: string };
    data: { phone: string };
  }): Promise<PrismaUserPhoneRecord>;
};

type PrismaDriverProfileTransactionClient = {
  driverProfile: PrismaDriverProfileDelegate;
  user: PrismaUserDriverProfileDelegate;
};

export type PrismaProfileDriverClient = PrismaDriverProfileTransactionClient & {
  $transaction<T>(
    callback: (transaction: PrismaDriverProfileTransactionClient) => Promise<T>,
  ): Promise<T>;
};

export class PrismaProfileDriverRepository implements ProfileDriverRepository {
  constructor(private readonly prisma: PrismaProfileDriverClient) {}

  async findProfileByDriverId(driverId: string, phone: string) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { driverId },
    });

    return profile ? mapPrismaDriverProfile(profile, phone) : undefined;
  }

  async saveProfile(
    driverId: string,
    phone: string,
    input: SaveDriverProfileRequest,
  ): Promise<DriverProfileRecord> {
    const currentProfile = await this.prisma.driverProfile.findUnique({
      where: { driverId },
    });
    const avatarFileId = resolveAvatarFileId(input, currentProfile);
    const profileSnapshot = resolveDriverProfileSnapshot(input, currentProfile);
    const nextPhone = input.phone ?? phone;

    const profile = await this.prisma.$transaction(async transaction => {
      if (input.phone && input.phone !== phone) {
        try {
          await transaction.user.update({
            where: { id: driverId },
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

      return transaction.driverProfile.upsert({
        where: { driverId },
        create: {
          driverId,
          displayName: input.displayName,
          ...createPrismaAvatarFileIdField(avatarFileId),
          phoneProtectionEnabled: profileSnapshot.phoneProtectionEnabled,
          loginProtectionEnabled: profileSnapshot.loginProtectionEnabled,
          orderNotificationEnabled: profileSnapshot.orderNotificationEnabled,
          promotionNotificationEnabled:
            profileSnapshot.promotionNotificationEnabled,
          ...(profileSnapshot.privacyConfirmedAtIso
            ? { privacyConfirmedAt: new Date(profileSnapshot.privacyConfirmedAtIso) }
            : {}),
          ...createPrismaPrivacyPolicyVersionFields(profileSnapshot),
        },
        update: {
          displayName: input.displayName,
          ...createPrismaAvatarFileIdField(avatarFileId),
          phoneProtectionEnabled: profileSnapshot.phoneProtectionEnabled,
          loginProtectionEnabled: profileSnapshot.loginProtectionEnabled,
          orderNotificationEnabled: profileSnapshot.orderNotificationEnabled,
          promotionNotificationEnabled:
            profileSnapshot.promotionNotificationEnabled,
          ...(profileSnapshot.privacyConfirmedAtIso
            ? { privacyConfirmedAt: new Date(profileSnapshot.privacyConfirmedAtIso) }
            : {}),
          ...createPrismaPrivacyPolicyVersionFields(profileSnapshot),
        },
      });
    });

    return mapPrismaDriverProfile(profile, nextPhone);
  }
}

function resolveAvatarFileId(
  input: SaveDriverProfileRequest,
  currentProfile?:
    | Pick<DriverProfileRecord, 'avatarFileId'>
    | Pick<PrismaDriverProfileRecord, 'avatarFileId'>
    | null,
) {
  if (input.avatarFileId === null) {
    return null;
  }

  if (typeof input.avatarFileId === 'string') {
    return input.avatarFileId;
  }

  return getCurrentAvatarFileId(currentProfile);
}

function resolveDriverProfileSnapshot(
  input: SaveDriverProfileRequest,
  currentProfile?:
    | Pick<
        DriverProfileRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAtIso'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | Pick<
        PrismaDriverProfileRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAt'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | null,
): ResolvedDriverProfileSnapshot {
  const currentPrivacyConfirmedAtIso = getCurrentPrivacyConfirmedAtIso(
    currentProfile,
  );
  const currentPrivacyPolicyVersion = getCurrentPrivacyPolicyVersion(
    currentProfile,
  );
  const currentPrivacyPolicyVersionTitle = getCurrentPrivacyPolicyVersionTitle(
    currentProfile,
  );
  const shouldClearPrivacyPolicyVersionSnapshot =
    input.privacyConfirmedAtIso !== undefined &&
    input.privacyConfirmedAtIso !== currentPrivacyConfirmedAtIso &&
    input.privacyPolicyVersion === undefined &&
    input.privacyPolicyVersionTitle === undefined;

  return {
    phoneProtectionEnabled:
      input.phoneProtectionEnabled ??
      currentProfile?.phoneProtectionEnabled ??
      defaultDriverProfileSnapshot.phoneProtectionEnabled,
    loginProtectionEnabled:
      input.loginProtectionEnabled ??
      currentProfile?.loginProtectionEnabled ??
      defaultDriverProfileSnapshot.loginProtectionEnabled,
    orderNotificationEnabled:
      input.orderNotificationEnabled ??
      currentProfile?.orderNotificationEnabled ??
      defaultDriverProfileSnapshot.orderNotificationEnabled,
    promotionNotificationEnabled:
      input.promotionNotificationEnabled ??
      currentProfile?.promotionNotificationEnabled ??
      defaultDriverProfileSnapshot.promotionNotificationEnabled,
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
  currentProfile?:
    | Pick<
        DriverProfileRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAtIso'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | Pick<
        PrismaDriverProfileRecord,
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
  if (!currentProfile) {
    return undefined;
  }

  if (hasLocalPrivacyConfirmedAtIso(currentProfile)) {
    return currentProfile.privacyConfirmedAtIso;
  }

  return currentProfile.privacyConfirmedAt?.toISOString();
}

function getCurrentAvatarFileId(
  currentProfile?:
    | Pick<DriverProfileRecord, 'avatarFileId'>
    | Pick<PrismaDriverProfileRecord, 'avatarFileId'>
    | null,
) {
  return typeof currentProfile?.avatarFileId === 'string'
    ? currentProfile.avatarFileId
    : undefined;
}

function hasLocalPrivacyConfirmedAtIso(
  currentProfile:
    | Pick<
        DriverProfileRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAtIso'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | Pick<
        PrismaDriverProfileRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAt'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >,
): currentProfile is Pick<
  DriverProfileRecord,
  | 'phoneProtectionEnabled'
  | 'loginProtectionEnabled'
  | 'orderNotificationEnabled'
  | 'promotionNotificationEnabled'
  | 'privacyConfirmedAtIso'
  | 'privacyPolicyVersion'
  | 'privacyPolicyVersionTitle'
> {
  return 'privacyConfirmedAtIso' in currentProfile;
}

function getCurrentPrivacyPolicyVersion(
  currentProfile?:
    | Pick<
        DriverProfileRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAtIso'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | Pick<
        PrismaDriverProfileRecord,
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
  return typeof currentProfile?.privacyPolicyVersion === 'string'
    ? currentProfile.privacyPolicyVersion
    : undefined;
}

function getCurrentPrivacyPolicyVersionTitle(
  currentProfile?:
    | Pick<
        DriverProfileRecord,
        | 'phoneProtectionEnabled'
        | 'loginProtectionEnabled'
        | 'orderNotificationEnabled'
        | 'promotionNotificationEnabled'
        | 'privacyConfirmedAtIso'
        | 'privacyPolicyVersion'
        | 'privacyPolicyVersionTitle'
      >
    | Pick<
        PrismaDriverProfileRecord,
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
  return typeof currentProfile?.privacyPolicyVersionTitle === 'string'
    ? currentProfile.privacyPolicyVersionTitle
    : undefined;
}

function mapPrismaDriverProfile(
  profile: PrismaDriverProfileRecord,
  phone: string,
): DriverProfileRecord {
  return {
    driverId: profile.driverId,
    displayName: profile.displayName,
    phone,
    phoneProtectionEnabled: profile.phoneProtectionEnabled,
    loginProtectionEnabled: profile.loginProtectionEnabled,
    orderNotificationEnabled: profile.orderNotificationEnabled,
    promotionNotificationEnabled: profile.promotionNotificationEnabled,
    ...(profile.privacyConfirmedAt
      ? { privacyConfirmedAtIso: profile.privacyConfirmedAt.toISOString() }
      : {}),
    ...(profile.privacyPolicyVersion
      ? { privacyPolicyVersion: profile.privacyPolicyVersion }
      : {}),
    ...(profile.privacyPolicyVersionTitle
      ? { privacyPolicyVersionTitle: profile.privacyPolicyVersionTitle }
      : {}),
    ...(profile.avatarFileId ? { avatarFileId: profile.avatarFileId } : {}),
  };
}

function createPrismaPrivacyPolicyVersionFields(
  profileSnapshot: ResolvedDriverProfileSnapshot,
) {
  const privacyPolicyVersionFields: {
    privacyPolicyVersion?: string | null;
    privacyPolicyVersionTitle?: string | null;
  } = {};

  if (profileSnapshot.privacyPolicyVersion !== undefined) {
    privacyPolicyVersionFields.privacyPolicyVersion =
      profileSnapshot.privacyPolicyVersion;
  }

  if (profileSnapshot.privacyPolicyVersionTitle !== undefined) {
    privacyPolicyVersionFields.privacyPolicyVersionTitle =
      profileSnapshot.privacyPolicyVersionTitle;
  }

  return privacyPolicyVersionFields;
}

function createPrismaAvatarFileIdField(
  avatarFileId: string | null | undefined,
) {
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
