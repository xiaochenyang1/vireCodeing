import { ApiErrorCode } from '../common/errors';
import {
  PrismaProfileVerificationRepository,
  type PrismaShipperEnterpriseVerificationRecord,
  type PrismaShipperIdentityVerificationRecord,
} from './profile-verification.repository';

describe('PrismaProfileVerificationRepository review concurrency', () => {
  const createdAt = new Date('2026-07-26T09:00:00.000Z');
  const reviewedAt = new Date('2026-07-26T09:01:00.000Z');

  it('allows only one concurrent identity review transition', async () => {
    let current: PrismaShipperIdentityVerificationRecord = {
      shipperId: 'shipper-1',
      realName: '张先生',
      idNumber: '44030019900101123X',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
      faceVerified: true,
      status: 'reviewing',
      rejectionReason: null,
      createdAt,
      updatedAt: createdAt,
    };
    const identity = {
      findUnique: jest.fn(async () => ({ ...current })),
      findMany: jest.fn(),
      upsert: jest.fn(),
      updateManyAndReturn: jest.fn(async ({ where, data }) => {
        if (
          current.shipperId !== where.shipperId ||
          current.status !== where.status ||
          current.updatedAt.getTime() !== where.updatedAt.getTime()
        ) {
          return [];
        }
        current = { ...current, ...data, updatedAt: reviewedAt };
        return [{ ...current }];
      }),
    };
    const repository = new PrismaProfileVerificationRepository({
      shipperIdentityVerification: identity,
      shipperEnterpriseVerification: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
    });

    const results = await Promise.allSettled([
      repository.reviewIdentity('shipper-1', { status: 'approved' }),
      repository.reviewIdentity('shipper-1', {
        status: 'rejected',
        rejectionReason: '证件照片不清晰',
      }),
    ]);

    expectSingleWinner(results, 'approved');
    expect(identity.updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        shipperId: 'shipper-1',
        status: 'reviewing',
        updatedAt: createdAt,
      },
      data: { status: 'approved', rejectionReason: null },
    });
  });

  it('allows only one concurrent enterprise review transition', async () => {
    let current: PrismaShipperEnterpriseVerificationRecord = {
      shipperId: 'shipper-2',
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张先生',
      legalId: '44030019900101123X',
      enterprisePhone: '13900139088',
      licenseFileId: 'file-license',
      status: 'reviewing',
      rejectionReason: null,
      createdAt,
      updatedAt: createdAt,
    };
    const enterprise = {
      findUnique: jest.fn(async () => ({ ...current })),
      findMany: jest.fn(),
      upsert: jest.fn(),
      updateManyAndReturn: jest.fn(async ({ where, data }) => {
        if (
          current.shipperId !== where.shipperId ||
          current.status !== where.status ||
          current.updatedAt.getTime() !== where.updatedAt.getTime()
        ) {
          return [];
        }
        current = { ...current, ...data, updatedAt: reviewedAt };
        return [{ ...current }];
      }),
    };
    const repository = new PrismaProfileVerificationRepository({
      shipperIdentityVerification: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      shipperEnterpriseVerification: enterprise,
    });

    const results = await Promise.allSettled([
      repository.reviewEnterprise('shipper-2', { status: 'approved' }),
      repository.reviewEnterprise('shipper-2', {
        status: 'rejected',
        rejectionReason: '营业执照信息不完整',
      }),
    ]);

    expectSingleWinner(results, 'approved');
    expect(enterprise.updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        shipperId: 'shipper-2',
        status: 'reviewing',
        updatedAt: createdAt,
      },
      data: { status: 'approved', rejectionReason: null },
    });
  });
});

function expectSingleWinner(
  results: PromiseSettledResult<{ status: string }>[],
  winningStatus: string,
) {
  expect(results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        status: 'fulfilled',
        value: expect.objectContaining({ status: winningStatus }),
      }),
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({
          code: ApiErrorCode.SHIPPER_VERIFICATION_STATE_INVALID,
        }),
      }),
    ]),
  );
}
