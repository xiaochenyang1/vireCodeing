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
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3);
    prisma.shipperSupportTicket.findMany.mockResolvedValue([
      createSupportTicketRecord({
        id: 'support-ticket-1',
        status: 'pending',
        statusHistory: [createSupportTicketClaimHistory('admin-1')],
      }),
      createSupportTicketRecord({
        id: 'support-ticket-2',
        status: 'pending',
        statusHistory: [createSupportTicketClaimHistory('admin-2')],
      }),
      createSupportTicketRecord({
        id: 'support-ticket-3',
        status: 'pending',
        statusHistory: [],
      }),
      createSupportTicketRecord({
        id: 'support-ticket-4',
        status: 'pending',
        statusHistory: [
          createSupportTicketClaimHistory('admin-3'),
          createSupportTicketUnclaimHistory('admin-3'),
        ],
      }),
      createSupportTicketRecord({
        id: 'support-ticket-5',
        status: 'pending',
        statusHistory: [],
      }),
      createSupportTicketRecord({
        id: 'support-ticket-6',
        status: 'processing',
        statusHistory: [createSupportTicketClaimHistory('admin-4')],
      }),
      createSupportTicketRecord({
        id: 'support-ticket-7',
        status: 'processing',
        statusHistory: [],
      }),
    ]);
    prisma.orderExceptionCase.count
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    prisma.orderExceptionCase.findMany.mockResolvedValue([
      createOrderExceptionCaseRecord({
        id: 'case-1',
        status: 'pending',
        actions: [createOrderExceptionClaimAction('action-1', 'admin-1')],
      }),
      createOrderExceptionCaseRecord({
        id: 'case-2',
        status: 'pending',
        actions: [createOrderExceptionClaimAction('action-2', 'admin-2')],
      }),
      createOrderExceptionCaseRecord({
        id: 'case-3',
        status: 'pending',
        actions: [],
      }),
      createOrderExceptionCaseRecord({
        id: 'case-4',
        status: 'pending',
        actions: [
          createOrderExceptionClaimAction('action-4-1', 'admin-3'),
          createOrderExceptionUnclaimAction('action-4-2', 'admin-3'),
        ],
      }),
      createOrderExceptionCaseRecord({
        id: 'case-5',
        status: 'pending',
        actions: [],
      }),
      createOrderExceptionCaseRecord({
        id: 'case-6',
        status: 'pending',
        actions: [createOrderExceptionClaimAction('action-6', 'admin-4')],
      }),
      createOrderExceptionCaseRecord({
        id: 'case-7',
        status: 'pending',
        actions: [],
      }),
      createOrderExceptionCaseRecord({
        id: 'case-8',
        status: 'processing',
        actions: [createOrderExceptionClaimAction('action-8', 'admin-5')],
      }),
      createOrderExceptionCaseRecord({
        id: 'case-9',
        status: 'processing',
        actions: [],
      }),
      createOrderExceptionCaseRecord({
        id: 'case-10',
        status: 'processing',
        actions: [
          createOrderExceptionClaimAction('action-10-1', 'admin-6'),
          createOrderExceptionUnclaimAction('action-10-2', 'admin-6'),
        ],
      }),
      createOrderExceptionCaseRecord({
        id: 'case-11',
        status: 'processing',
        actions: [],
      }),
    ]);
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
        claimedCount: 3,
        unclaimedCount: 4,
        overdueCount: 4,
      },
      orderExceptions: {
        pendingCount: 7,
        processingCount: 4,
        openCount: 11,
        claimedCount: 4,
        unclaimedCount: 7,
        overdueCount: 3,
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
    expect(prisma.shipperSupportTicket.count).toHaveBeenNthCalledWith(3, {
      where: {
        status: 'pending',
        createdAt: { lt: new Date('2026-07-18T02:50:00.000Z') },
      },
    });
    expect(prisma.shipperSupportTicket.count).toHaveBeenNthCalledWith(4, {
      where: {
        status: 'processing',
        updatedAt: { lt: new Date('2026-07-17T03:20:00.000Z') },
      },
    });
    expect(prisma.shipperSupportTicket.findMany).toHaveBeenCalledWith({
      where: {
        status: {
          in: ['pending', 'processing'],
        },
      },
      select: {
        id: true,
        shipperId: true,
        channelName: true,
        description: true,
        status: true,
        statusHistory: true,
        createdAtIso: true,
        updatedAtIso: true,
      },
    });
    expect(prisma.orderExceptionCase.count).toHaveBeenNthCalledWith(1, {
      where: { status: 'pending' },
    });
    expect(prisma.orderExceptionCase.count).toHaveBeenNthCalledWith(2, {
      where: { status: 'processing' },
    });
    expect(prisma.orderExceptionCase.count).toHaveBeenNthCalledWith(3, {
      where: {
        status: 'pending',
        createdAt: { lt: new Date('2026-07-18T03:05:00.000Z') },
      },
    });
    expect(prisma.orderExceptionCase.count).toHaveBeenNthCalledWith(4, {
      where: {
        status: 'processing',
        updatedAt: { lt: new Date('2026-07-17T23:20:00.000Z') },
      },
    });
    expect(prisma.orderExceptionCase.findMany).toHaveBeenCalledWith({
      where: {
        status: {
          in: ['pending', 'processing'],
        },
      },
      select: {
        id: true,
        caseNo: true,
        orderId: true,
        orderNo: true,
        sourceEventId: true,
        reporterUserId: true,
        sourceRole: true,
        typeLabel: true,
        description: true,
        attachmentFileIds: true,
        status: true,
        appealStatus: true,
        createdAtIso: true,
        updatedAtIso: true,
        actions: {
          orderBy: {
            createdAtIso: 'asc',
          },
          select: {
            id: true,
            adminUserId: true,
            fromStatus: true,
            toStatus: true,
            content: true,
            createdAtIso: true,
          },
        },
      },
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
    shipperSupportTicket: { count: jest.fn(), findMany: jest.fn() },
    orderExceptionCase: { count: jest.fn(), findMany: jest.fn() },
    shipperCoupon: { count: jest.fn() },
    paymentOrder: { count: jest.fn() },
    refund: { count: jest.fn() },
    financialOutboxEvent: { count: jest.fn() },
    driverWithdrawal: { count: jest.fn() },
    settlement: { count: jest.fn() },
  };
}

function createSupportTicketRecord(
  overrides: Partial<{
    id: string;
    status: 'pending' | 'processing';
    statusHistory: Array<{
      actionText: string;
      timestampIso: string;
      operatorUserId?: string;
      content?: string;
    }>;
  }> = {},
) {
  return {
    id: overrides.id ?? 'support-ticket-1',
    shipperId: 'shipper-1',
    channelName: '投诉建议',
    description: '司机沟通不及时，希望客服协助跟进',
    status: overrides.status ?? 'pending',
    statusHistory: overrides.statusHistory ?? [],
    createdAtIso: '2026-07-18T02:30:00.000Z',
    updatedAtIso: '2026-07-18T03:00:00.000Z',
  };
}

function createSupportTicketClaimHistory(adminUserId: string) {
  return {
    actionText: '客服已认领',
    timestampIso: '2026-07-18T02:45:00.000Z',
    operatorUserId: adminUserId,
    content: '当前客服已认领并接手跟进。',
  };
}

function createSupportTicketUnclaimHistory(adminUserId: string) {
  return {
    actionText: '客服已释放认领',
    timestampIso: '2026-07-18T02:50:00.000Z',
    operatorUserId: adminUserId,
    content: '当前客服已释放认领，工单回到未认领队列。',
  };
}

function createOrderExceptionCaseRecord(
  overrides: Partial<{
    id: string;
    status: 'pending' | 'processing';
    actions: Array<{
      id: string;
      adminUserId: string;
      fromStatus: 'pending' | 'processing';
      toStatus: 'pending' | 'processing';
      content: string;
      createdAtIso: string;
    }>;
  }> = {},
) {
  return {
    id: overrides.id ?? 'case-1',
    caseNo: 'YC202607180001',
    orderId: 'order-1',
    orderNo: 'HY202607180001',
    sourceEventId: 'event-1',
    reporterUserId: 'shipper-1',
    sourceRole: 'shipper' as const,
    typeLabel: '货损',
    description: '装货时发现货损',
    attachmentFileIds: [],
    status: overrides.status ?? 'pending',
    appealStatus: 'none' as const,
    createdAtIso: '2026-07-18T02:30:00.000Z',
    updatedAtIso: '2026-07-18T03:00:00.000Z',
    actions: overrides.actions ?? [],
  };
}

function createOrderExceptionClaimAction(id: string, adminUserId: string) {
  return {
    id,
    adminUserId,
    fromStatus: 'pending' as const,
    toStatus: 'pending' as const,
    content: '客服认领：当前客服已认领并接手跟进。',
    createdAtIso: '2026-07-18T02:45:00.000Z',
  };
}

function createOrderExceptionUnclaimAction(id: string, adminUserId: string) {
  return {
    id,
    adminUserId,
    fromStatus: 'pending' as const,
    toStatus: 'pending' as const,
    content: '客服释放认领：当前客服已释放认领，工单回到未认领队列。',
    createdAtIso: '2026-07-18T02:50:00.000Z',
  };
}
