import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  PrismaProfileAccountRepository,
  type PrismaProfileAccountClient,
} from './profile-account.repository';

describe('PrismaProfileAccountRepository', () => {
  type MockPrismaProfileAccountClient = {
    shipperProfile: {
      findUnique: jest.MockedFunction<
        PrismaProfileAccountClient['shipperProfile']['findUnique']
      >;
      upsert: jest.MockedFunction<
        PrismaProfileAccountClient['shipperProfile']['upsert']
      >;
    };
    user: {
      update: jest.MockedFunction<PrismaProfileAccountClient['user']['update']>;
    };
    $transaction: PrismaProfileAccountClient['$transaction'];
  };

  function createPrismaClient(): MockPrismaProfileAccountClient {
    const transactionClient = {
      shipperProfile: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      user: {
        update: jest.fn(),
      },
    };

    return {
      ...transactionClient,
      $transaction: async callback => callback(transactionClient),
    };
  }

  it('updates the user phone when account save includes a new bound phone', async () => {
    const prisma = createPrismaClient();
    prisma.shipperProfile.findUnique.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({
      id: 'shipper-1',
      phone: '13900139999',
    });
    prisma.shipperProfile.upsert.mockResolvedValue({
      userId: 'shipper-1',
      displayName: '晨星货主',
      avatarFileId: null,
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
      privacyConfirmedAt: null,
      privacyPolicyVersion: null,
      privacyPolicyVersionTitle: null,
    });
    const repository = new PrismaProfileAccountRepository(
      prisma as unknown as PrismaProfileAccountClient,
    );

    await expect(
      repository.saveAccount('shipper-1', '13800138000', {
        displayName: '晨星货主',
        phone: '13900139999',
        phoneProtectionEnabled: true,
        loginProtectionEnabled: true,
        orderNotificationEnabled: true,
        promotionNotificationEnabled: false,
      }),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13900139999',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'shipper-1' },
      data: { phone: '13900139999' },
    });
  });

  it('clears stale privacy policy version snapshots when only a new confirm time is saved', async () => {
    const prisma = createPrismaClient();
    prisma.shipperProfile.findUnique.mockResolvedValue({
      userId: 'shipper-1',
      displayName: '晨星货主',
      avatarFileId: null,
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
      privacyConfirmedAt: new Date('2026-07-22T08:30:00.000Z'),
      privacyPolicyVersion: 'privacy-policy-v2026-07-22',
      privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
    });
    prisma.shipperProfile.upsert.mockResolvedValue({
      userId: 'shipper-1',
      displayName: '晨星货主',
      avatarFileId: null,
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
      privacyConfirmedAt: new Date('2026-07-23T08:30:00.000Z'),
      privacyPolicyVersion: null,
      privacyPolicyVersionTitle: null,
    });
    const repository = new PrismaProfileAccountRepository(
      prisma as unknown as PrismaProfileAccountClient,
    );

    await expect(
      repository.saveAccount('shipper-1', '13800138000', {
        displayName: '晨星货主',
        privacyConfirmedAtIso: '2026-07-23T08:30:00.000Z',
      }),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13800138000',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
      privacyConfirmedAtIso: '2026-07-23T08:30:00.000Z',
    });
    expect(prisma.shipperProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          privacyPolicyVersion: null,
          privacyPolicyVersionTitle: null,
        }),
      }),
    );
  });

  it('maps a duplicate bound phone conflict to a validation error', async () => {
    const prisma = createPrismaClient();
    prisma.shipperProfile.findUnique.mockResolvedValue(null);
    prisma.user.update.mockRejectedValue({
      code: 'P2002',
      meta: {
        target: ['phone'],
      },
    });
    const repository = new PrismaProfileAccountRepository(
      prisma as unknown as PrismaProfileAccountClient,
    );

    await expect(
      repository.saveAccount('shipper-1', '13800138000', {
        displayName: '晨星货主',
        phone: '13900139999',
      }),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.VALIDATION_ERROR, '手机号已被其他账号占用'),
    );
    expect(prisma.shipperProfile.upsert).not.toHaveBeenCalled();
  });

  it('clears the persisted avatar reference when avatarFileId is null', async () => {
    const prisma = createPrismaClient();
    prisma.shipperProfile.findUnique.mockResolvedValue({
      userId: 'shipper-1',
      displayName: '晨星货主',
      avatarFileId: 'file-avatar-1',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
      privacyConfirmedAt: null,
      privacyPolicyVersion: null,
      privacyPolicyVersionTitle: null,
    });
    prisma.shipperProfile.upsert.mockResolvedValue({
      userId: 'shipper-1',
      displayName: '晨星货主',
      avatarFileId: null,
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
      privacyConfirmedAt: null,
      privacyPolicyVersion: null,
      privacyPolicyVersionTitle: null,
    });
    const repository = new PrismaProfileAccountRepository(
      prisma as unknown as PrismaProfileAccountClient,
    );

    await expect(
      repository.saveAccount('shipper-1', '13800138000', {
        displayName: '晨星货主',
        avatarFileId: null,
      }),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13800138000',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
    });
    expect(prisma.shipperProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          avatarFileId: null,
        }),
      }),
    );
  });
});
