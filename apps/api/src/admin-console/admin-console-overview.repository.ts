import { buildAdminAuthSessionRiskProfile } from '../auth/admin-auth-session-risk';

const SUPPORT_TICKET_FIRST_RESPONSE_TARGET_MS = 30 * 60 * 1000;
const SUPPORT_TICKET_RESOLUTION_TARGET_MS = 24 * 60 * 60 * 1000;
const ORDER_EXCEPTION_ACCEPTANCE_TARGET_MS = 15 * 60 * 1000;
const ORDER_EXCEPTION_RESOLUTION_TARGET_MS = 4 * 60 * 60 * 1000;

export type AdminConsoleOverviewStats = {
  driverCertification: {
    reviewingDriverCount: number;
    identityReviewingCount: number;
    vehicleReviewingCount: number;
  };
  orderManagement: {
    totalCount: number;
    waitingCount: number;
    activeCount: number;
  };
  sessionGovernance: {
    riskySessionCount: number;
    sharedDeviceCount: number;
    adminMultiDeviceUserCount: number;
  };
  accountManagement: {
    totalUserCount: number;
    disabledUserCount: number;
    riskyUserCount: number;
  };
  orderAttachments: {
    auditableOrderCount: number;
    cargoPhotoOrderCount: number;
  };
  fileMaintenance: {
    totalCount: number;
    rejectedCount: number;
    expiredPendingCount: number;
  };
  supportTickets: {
    pendingCount: number;
    processingCount: number;
    openCount: number;
    overdueCount: number;
  };
  orderExceptions: {
    pendingCount: number;
    processingCount: number;
    openCount: number;
    overdueCount: number;
  };
  shipperCoupons: {
    usableCount: number;
    lockedCount: number;
    expiredCount: number;
  };
  evaluations: {
    shipperToDriverOrderCount: number;
    driverToShipperOrderCount: number;
    repliedOrderCount: number;
  };
  finance: {
    paymentPendingCount: number;
    refundFailedCount: number;
    deadOutboxCount: number;
    reviewingWithdrawalCount: number;
    settlementCount: number;
  };
};

export interface AdminConsoleOverviewRepository {
  getStats(): Promise<AdminConsoleOverviewStats>;
}

type PrismaAdminConsoleAuthSession = {
  id: string;
  userId: string;
  deviceId: string;
  createdAt: Date;
  expiresAt: Date;
  user?: {
    userType: 'shipper' | 'driver' | 'admin';
  } | null;
};

export type PrismaAdminConsoleOverviewClient = {
  user: {
    count(args: unknown): Promise<number>;
  };
  driverIdentityCertification: {
    count(args: unknown): Promise<number>;
  };
  driverVehicleCertification: {
    count(args: unknown): Promise<number>;
  };
  authSession: {
    findMany(args: {
      where: {
        revokedAt: null;
        expiresAt: { gt: Date };
      };
      orderBy: { createdAt: 'desc' };
      select: {
        id: true;
        userId: true;
        deviceId: true;
        createdAt: true;
        expiresAt: true;
        user: {
          select: {
            userType: true;
          };
        };
      };
    }): Promise<PrismaAdminConsoleAuthSession[]>;
  };
  order: {
    count(args: unknown): Promise<number>;
  };
  orderCargo: {
    count(args: unknown): Promise<number>;
  };
  fileObject: {
    count(args?: {
      where?: {
        status?: 'pending' | 'uploaded' | 'rejected';
        createdAt?: { lt: Date };
      };
    }): Promise<number>;
  };
  shipperSupportTicket: {
    count(args: unknown): Promise<number>;
  };
  orderExceptionCase: {
    count(args: unknown): Promise<number>;
  };
  shipperCoupon: {
    count(args: unknown): Promise<number>;
  };
  paymentOrder: {
    count(args: unknown): Promise<number>;
  };
  refund: {
    count(args: unknown): Promise<number>;
  };
  financialOutboxEvent: {
    count(args: unknown): Promise<number>;
  };
  driverWithdrawal: {
    count(args: unknown): Promise<number>;
  };
  settlement: {
    count(args: unknown): Promise<number>;
  };
};

const attachmentAuditEventTypes = [
  'exception_reported',
  'driver_exception_reported',
  'evaluation_submitted',
  'shipper_evaluation_submitted',
] as const;

const defaultFileUploadExpiresInSeconds = 15 * 60;

type AdminConsoleOverviewRepositoryConfig = {
  now?: () => Date;
  fileUploadExpiresInSeconds?: number;
};

export class PrismaAdminConsoleOverviewRepository
  implements AdminConsoleOverviewRepository
{
  constructor(
    private readonly prisma: PrismaAdminConsoleOverviewClient,
    private readonly config: AdminConsoleOverviewRepositoryConfig = {},
  ) {}

  async getStats(): Promise<AdminConsoleOverviewStats> {
    const now = this.config.now ? this.config.now() : new Date();
    const expiredPendingCutoff = this.getFileExpiredPendingCutoff();
    const supportTicketFirstResponseCutoff = new Date(
      now.getTime() - SUPPORT_TICKET_FIRST_RESPONSE_TARGET_MS,
    );
    const supportTicketResolutionCutoff = new Date(
      now.getTime() - SUPPORT_TICKET_RESOLUTION_TARGET_MS,
    );
    const orderExceptionAcceptanceCutoff = new Date(
      now.getTime() - ORDER_EXCEPTION_ACCEPTANCE_TARGET_MS,
    );
    const orderExceptionResolutionCutoff = new Date(
      now.getTime() - ORDER_EXCEPTION_RESOLUTION_TARGET_MS,
    );
    const [
      reviewingDriverCount,
      identityReviewingCount,
      vehicleReviewingCount,
      activeSessions,
      totalUserCount,
      disabledUserCount,
      totalOrderCount,
      waitingOrderCount,
      activeOrderCount,
      auditableOrderCount,
      cargoPhotoOrderCount,
      totalFileCount,
      rejectedFileCount,
      expiredPendingFileCount,
      pendingSupportTicketCount,
      processingSupportTicketCount,
      pendingSupportTicketOverdueCount,
      processingSupportTicketOverdueCount,
      pendingCaseCount,
      processingCaseCount,
      pendingCaseOverdueCount,
      processingCaseOverdueCount,
      usableCouponCount,
      lockedCouponCount,
      expiredCouponCount,
      shipperToDriverOrderCount,
      driverToShipperOrderCount,
      repliedOrderCount,
      paymentPendingCount,
      refundFailedCount,
      deadOutboxCount,
      reviewingWithdrawalCount,
      settlementCount,
    ] = await Promise.all([
      this.prisma.user.count({
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
      }),
      this.prisma.driverIdentityCertification.count({
        where: { status: 'reviewing' },
      }),
      this.prisma.driverVehicleCertification.count({
        where: { status: 'reviewing' },
      }),
      this.prisma.authSession.findMany({
        where: {
          revokedAt: null,
          expiresAt: {
            gt: this.config.now ? this.config.now() : new Date(),
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
      }),
      this.prisma.user.count({
        where: {},
      }),
      this.prisma.user.count({
        where: {
          status: 'disabled',
        },
      }),
      this.prisma.order.count({
        where: {},
      }),
      this.prisma.order.count({
        where: { status: 'waiting' },
      }),
      this.prisma.order.count({
        where: {
          status: {
            in: ['loading', 'transporting', 'confirming'],
          },
        },
      }),
      this.prisma.order.count({
        where: {
          OR: [
            {
              cargo: {
                is: {
                  cargoPhotoCount: {
                    gt: 0,
                  },
                },
              },
            },
            {
              events: {
                some: {
                  eventType: {
                    in: [...attachmentAuditEventTypes],
                  },
                },
              },
            },
          ],
        },
      }),
      this.prisma.orderCargo.count({
        where: {
          cargoPhotoCount: {
            gt: 0,
          },
        },
      }),
      this.prisma.fileObject.count(),
      this.prisma.fileObject.count({
        where: { status: 'rejected' },
      }),
      this.prisma.fileObject.count({
        where: {
          status: 'pending',
          createdAt: { lt: expiredPendingCutoff },
        },
      }),
      this.prisma.shipperSupportTicket.count({
        where: { status: 'pending' },
      }),
      this.prisma.shipperSupportTicket.count({
        where: { status: 'processing' },
      }),
      this.prisma.shipperSupportTicket.count({
        where: {
          status: 'pending',
          createdAt: { lt: supportTicketFirstResponseCutoff },
        },
      }),
      this.prisma.shipperSupportTicket.count({
        where: {
          status: 'processing',
          updatedAt: { lt: supportTicketResolutionCutoff },
        },
      }),
      this.prisma.orderExceptionCase.count({
        where: { status: 'pending' },
      }),
      this.prisma.orderExceptionCase.count({
        where: { status: 'processing' },
      }),
      this.prisma.orderExceptionCase.count({
        where: {
          status: 'pending',
          createdAt: { lt: orderExceptionAcceptanceCutoff },
        },
      }),
      this.prisma.orderExceptionCase.count({
        where: {
          status: 'processing',
          updatedAt: { lt: orderExceptionResolutionCutoff },
        },
      }),
      this.prisma.shipperCoupon.count({
        where: { status: 'usable' },
      }),
      this.prisma.shipperCoupon.count({
        where: { status: 'locked' },
      }),
      this.prisma.shipperCoupon.count({
        where: { status: 'expired' },
      }),
      this.prisma.order.count({
        where: {
          events: {
            some: {
              eventType: 'evaluation_submitted',
            },
          },
        },
      }),
      this.prisma.order.count({
        where: {
          events: {
            some: {
              eventType: 'shipper_evaluation_submitted',
            },
          },
        },
      }),
      this.prisma.order.count({
        where: {
          events: {
            some: {
              eventType: 'evaluation_replied',
            },
          },
        },
      }),
      this.prisma.paymentOrder.count({
        where: {
          status: {
            in: ['pending', 'processing'],
          },
        },
      }),
      this.prisma.refund.count({
        where: { status: 'failed' },
      }),
      this.prisma.financialOutboxEvent.count({
        where: {
          eventType: 'refund.requested',
          status: 'dead',
        },
      }),
      this.prisma.driverWithdrawal.count({
        where: { status: 'reviewing' },
      }),
      this.prisma.settlement.count({ where: {} }),
    ]);
    const riskInputs = activeSessions
      .filter(
        (
          session,
        ): session is PrismaAdminConsoleAuthSession & {
          user: { userType: 'shipper' | 'driver' | 'admin' };
        } => session.user != null,
      )
      .map(session => ({
        id: session.id,
        userId: session.userId,
        userType: session.user.userType,
        deviceId: session.deviceId,
      }));
    const sessionGovernanceRiskProfile =
      buildAdminAuthSessionRiskProfile(riskInputs);
    const sessionGovernanceSummary = sessionGovernanceRiskProfile.summary;
    const riskyUserCount = new Set(
      riskInputs
        .filter(
          session =>
            (sessionGovernanceRiskProfile.bySessionId.get(session.id)?.riskLevel ??
              'none') !== 'none',
        )
        .map(session => session.userId),
    ).size;

    return {
      driverCertification: {
        reviewingDriverCount,
        identityReviewingCount,
        vehicleReviewingCount,
      },
      orderManagement: {
        totalCount: totalOrderCount,
        waitingCount: waitingOrderCount,
        activeCount: activeOrderCount,
      },
      sessionGovernance: {
        riskySessionCount: sessionGovernanceSummary.riskySessionCount,
        sharedDeviceCount: sessionGovernanceSummary.sharedDeviceCount,
        adminMultiDeviceUserCount:
          sessionGovernanceSummary.adminMultiDeviceUserCount,
      },
      accountManagement: {
        totalUserCount,
        disabledUserCount,
        riskyUserCount,
      },
      orderAttachments: {
        auditableOrderCount,
        cargoPhotoOrderCount,
      },
      fileMaintenance: {
        totalCount: totalFileCount,
        rejectedCount: rejectedFileCount,
        expiredPendingCount: expiredPendingFileCount,
      },
      supportTickets: {
        pendingCount: pendingSupportTicketCount,
        processingCount: processingSupportTicketCount,
        openCount: pendingSupportTicketCount + processingSupportTicketCount,
        overdueCount:
          pendingSupportTicketOverdueCount +
          processingSupportTicketOverdueCount,
      },
      orderExceptions: {
        pendingCount: pendingCaseCount,
        processingCount: processingCaseCount,
        openCount: pendingCaseCount + processingCaseCount,
        overdueCount: pendingCaseOverdueCount + processingCaseOverdueCount,
      },
      shipperCoupons: {
        usableCount: usableCouponCount,
        lockedCount: lockedCouponCount,
        expiredCount: expiredCouponCount,
      },
      evaluations: {
        shipperToDriverOrderCount,
        driverToShipperOrderCount,
        repliedOrderCount,
      },
      finance: {
        paymentPendingCount,
        refundFailedCount,
        deadOutboxCount,
        reviewingWithdrawalCount,
        settlementCount,
      },
    };
  }

  private getFileExpiredPendingCutoff() {
    const uploadExpiresInSeconds =
      this.config.fileUploadExpiresInSeconds ?? defaultFileUploadExpiresInSeconds;

    return new Date(
      (this.config.now ? this.config.now() : new Date()).getTime() -
        uploadExpiresInSeconds * 1000,
    );
  }
}
