import {
  PrismaAdminConsoleOverviewRepository,
  type PrismaAdminConsoleOverviewClient,
} from './admin-console-overview.repository';

describe('PrismaAdminConsoleOverviewRepository', () => {
  it('aggregates live admin console counts from certification, orders, coupons and finance', async () => {
    const prisma = createPrismaClient();
    prisma.user.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(2);
    prisma.driverIdentityCertification.count.mockResolvedValue(4);
    prisma.driverVehicleCertification.count.mockResolvedValue(5);
    prisma.authSession.findMany.mockResolvedValue([
      {
        id: 'session-driver-risk',
        userId: 'driver-1',
        deviceId: 'shared-device',
        createdAt: new Date('2026-07-18T03:19:00.000Z'),
        expiresAt: new Date('2026-07-25T03:19:00.000Z'),
        user: {
          userType: 'driver',
        },
      },
      {
        id: 'session-admin-2',
        userId: 'admin-1',
        deviceId: 'admin-laptop',
        createdAt: new Date('2026-07-18T03:18:00.000Z'),
        expiresAt: new Date('2026-07-25T03:18:00.000Z'),
        user: {
          userType: 'admin',
        },
      },
      {
        id: 'session-driver-2',
        userId: 'driver-1',
        deviceId: 'driver-android-2',
        createdAt: new Date('2026-07-18T03:17:00.000Z'),
        expiresAt: new Date('2026-07-25T03:17:00.000Z'),
        user: {
          userType: 'driver',
        },
      },
      {
        id: 'session-admin-1',
        userId: 'admin-1',
        deviceId: 'admin-console-device',
        createdAt: new Date('2026-07-18T03:16:00.000Z'),
        expiresAt: new Date('2026-07-25T03:16:00.000Z'),
        user: {
          userType: 'admin',
        },
      },
      {
        id: 'session-shipper-shared',
        userId: 'shipper-1',
        deviceId: 'shared-device',
        createdAt: new Date('2026-07-18T03:15:00.000Z'),
        expiresAt: new Date('2026-07-25T03:15:00.000Z'),
        user: {
          userType: 'shipper',
        },
      },
      {
        id: 'session-driver-3',
        userId: 'driver-1',
        deviceId: 'driver-web-1',
        createdAt: new Date('2026-07-18T03:14:00.000Z'),
        expiresAt: new Date('2026-07-25T03:14:00.000Z'),
        user: {
          userType: 'driver',
        },
      },
      {
        id: 'session-shipper-safe',
        userId: 'shipper-2',
        deviceId: 'shipper-ios-2',
        createdAt: new Date('2026-07-18T03:13:00.000Z'),
        expiresAt: new Date('2026-07-25T03:13:00.000Z'),
        user: {
          userType: 'shipper',
        },
      },
    ]);
    prisma.order.count
      .mockResolvedValueOnce(28)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(11)
      .mockResolvedValueOnce(18)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(2);
    prisma.orderCargo.count.mockResolvedValue(11);
    prisma.fileObject.count
      .mockResolvedValueOnce(40)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(3);
    prisma.shipperSupportTicket.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);
    prisma.orderExceptionCase.count
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(4);
    prisma.shipperCoupon.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(6);
    prisma.paymentOrder.count.mockResolvedValue(8);
    prisma.refund.count.mockResolvedValue(2);
    prisma.financialOutboxEvent.count.mockResolvedValue(1);
    prisma.driverWithdrawal.count.mockResolvedValue(5);
    prisma.settlement.count.mockResolvedValue(14);
    const repository = new PrismaAdminConsoleOverviewRepository(
      prisma as unknown as PrismaAdminConsoleOverviewClient,
      {
        now: () => new Date('2026-07-18T03:20:00.000Z'),
        fileUploadExpiresInSeconds: 900,
      },
    );

    await expect(repository.getStats()).resolves.toEqual({
      driverCertification: {
        reviewingDriverCount: 3,
        identityReviewingCount: 4,
        vehicleReviewingCount: 5,
      },
      orderManagement: {
        totalCount: 28,
        waitingCount: 6,
        activeCount: 11,
      },
      sessionGovernance: {
        riskySessionCount: 6,
        sharedDeviceCount: 1,
        adminMultiDeviceUserCount: 1,
      },
      accountManagement: {
        totalUserCount: 12,
        disabledUserCount: 2,
        riskyUserCount: 3,
      },
      orderAttachments: {
        auditableOrderCount: 18,
        cargoPhotoOrderCount: 11,
      },
      fileMaintenance: {
        totalCount: 40,
        rejectedCount: 6,
        expiredPendingCount: 3,
      },
      supportTickets: {
        pendingCount: 5,
        processingCount: 2,
        openCount: 7,
      },
      orderExceptions: {
        pendingCount: 7,
        processingCount: 4,
        openCount: 11,
      },
      shipperCoupons: {
        usableCount: 12,
        lockedCount: 3,
        expiredCount: 6,
      },
      evaluations: {
        shipperToDriverOrderCount: 9,
        driverToShipperOrderCount: 6,
        repliedOrderCount: 2,
      },
      finance: {
        paymentPendingCount: 8,
        refundFailedCount: 2,
        deadOutboxCount: 1,
        reviewingWithdrawalCount: 5,
        settlementCount: 14,
      },
    });
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        userType: 'driver',
        OR: [
          {
            driverIdentityCertification: {
              is: { status: 'reviewing' },
            },
          },
          {
            driverVehicleCertification: {
              is: { status: 'reviewing' },
            },
          },
        ],
      },
    });
    expect(prisma.user.count).toHaveBeenNthCalledWith(2, {
      where: {},
    });
    expect(prisma.user.count).toHaveBeenNthCalledWith(3, {
      where: {
        status: 'disabled',
      },
    });
    expect(prisma.order.count).toHaveBeenNthCalledWith(1, {
      where: {},
    });
    expect(prisma.order.count).toHaveBeenNthCalledWith(2, {
      where: {
        status: 'waiting',
      },
    });
    expect(prisma.order.count).toHaveBeenNthCalledWith(3, {
      where: {
        status: {
          in: ['loading', 'transporting', 'confirming'],
        },
      },
    });
    expect(prisma.order.count).toHaveBeenNthCalledWith(4, {
      where: {
        OR: [
          {
            cargo: {
              is: {
                cargoPhotoCount: { gt: 0 },
              },
            },
          },
          {
            events: {
              some: {
                eventType: {
                  in: [
                    'exception_reported',
                    'driver_exception_reported',
                    'evaluation_submitted',
                    'shipper_evaluation_submitted',
                  ],
                },
              },
            },
          },
        ],
      },
    });
    expect(prisma.order.count).toHaveBeenNthCalledWith(5, {
      where: {
        events: {
          some: {
            eventType: 'evaluation_submitted',
          },
        },
      },
    });
    expect(prisma.authSession.findMany).toHaveBeenCalledWith({
      where: {
        revokedAt: null,
        expiresAt: {
          gt: new Date('2026-07-18T03:20:00.000Z'),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        userId: true,
        deviceId: true,
        createdAt: true,
        expiresAt: true,
        user: {
          select: {
            userType: true,
          },
        },
      },
    });
    expect(prisma.financialOutboxEvent.count).toHaveBeenCalledWith({
      where: {
        eventType: 'refund.requested',
        status: 'dead',
      },
    });
    expect(prisma.fileObject.count.mock.calls[0]).toEqual([]);
    expect(prisma.fileObject.count).toHaveBeenNthCalledWith(2, {
      where: { status: 'rejected' },
    });
    expect(prisma.fileObject.count).toHaveBeenNthCalledWith(3, {
      where: {
        status: 'pending',
        createdAt: { lt: new Date('2026-07-18T03:05:00.000Z') },
      },
    });
    expect(prisma.shipperSupportTicket.count).toHaveBeenNthCalledWith(1, {
      where: { status: 'pending' },
    });
    expect(prisma.shipperSupportTicket.count).toHaveBeenNthCalledWith(2, {
      where: { status: 'processing' },
    });
  });
});

function createPrismaClient() {
  return {
    user: { count: jest.fn() },
    driverIdentityCertification: { count: jest.fn() },
    driverVehicleCertification: { count: jest.fn() },
    authSession: { findMany: jest.fn() },
    order: { count: jest.fn() },
    orderCargo: { count: jest.fn() },
    fileObject: { count: jest.fn() },
    shipperSupportTicket: { count: jest.fn() },
    orderExceptionCase: { count: jest.fn() },
    shipperCoupon: { count: jest.fn() },
    paymentOrder: { count: jest.fn() },
    refund: { count: jest.fn() },
    financialOutboxEvent: { count: jest.fn() },
    driverWithdrawal: { count: jest.fn() },
    settlement: { count: jest.fn() },
  };
}
