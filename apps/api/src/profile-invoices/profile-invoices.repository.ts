import type {
  CreateShipperInvoiceApplicationRequest,
  ShipperEnterpriseVerificationSnapshot,
  ShipperInvoiceApplicationRecord,
  ShipperInvoiceOrderRecord,
} from './dto';

export interface ProfileInvoicesRepository {
  listApplications(
    shipperId: string,
  ): Promise<ShipperInvoiceApplicationRecord[]>;
  createEligibleApplication(
    shipperId: string,
    input: CreateShipperInvoiceApplicationRequest,
  ): Promise<CreateEligibleInvoiceApplicationResult>;
  findEnterpriseVerification(
    shipperId: string,
  ): Promise<ShipperEnterpriseVerificationSnapshot | undefined>;
}

export type CreateEligibleInvoiceApplicationResult =
  | { kind: 'success'; application: ShipperInvoiceApplicationRecord }
  | { kind: 'orders-not-found' }
  | { kind: 'order-not-completed' }
  | { kind: 'financially-ineligible' }
  | { kind: 'order-occupied' };

export class InMemoryProfileInvoicesRepository
  implements ProfileInvoicesRepository
{
  private readonly applications = new Map<
    string,
    ShipperInvoiceApplicationRecord[]
  >();
  private readonly orders: ShipperInvoiceOrderRecord[];
  private readonly enterpriseVerifications = new Map<
    string,
    ShipperEnterpriseVerificationSnapshot
  >();

  constructor(
    private readonly now: () => Date = () => new Date(),
    seed: {
      applications?: ShipperInvoiceApplicationRecord[];
      orders?: ShipperInvoiceOrderRecord[];
      enterpriseVerifications?: Record<
        string,
        ShipperEnterpriseVerificationSnapshot
      >;
    } = {},
  ) {
    this.orders = [...(seed.orders ?? [])];

    for (const application of seed.applications ?? []) {
      const currentApplications =
        this.applications.get(application.shipperId) ?? [];

      currentApplications.push(application);
      this.applications.set(application.shipperId, currentApplications);
    }

    for (const [shipperId, verification] of Object.entries(
      seed.enterpriseVerifications ?? {},
    )) {
      this.enterpriseVerifications.set(shipperId, verification);
    }
  }

  async listApplications(shipperId: string) {
    return [...(this.applications.get(shipperId) ?? [])].sort((left, right) =>
      right.createdAtIso.localeCompare(left.createdAtIso),
    );
  }

  async createEligibleApplication(
    shipperId: string,
    input: CreateShipperInvoiceApplicationRequest,
  ): Promise<CreateEligibleInvoiceApplicationResult> {
    const selectedOrders = selectInvoiceOrders(
      this.orders,
      shipperId,
      input.orderIds,
    );
    const eligibility = evaluateInvoiceOrders(selectedOrders, input.orderIds);
    if (eligibility.kind !== 'eligible') {
      return eligibility;
    }

    const occupiedOrderIds = new Set(
      [...(this.applications.get(shipperId) ?? [])]
        .filter(application => application.status !== 'rejected')
        .flatMap(application => application.orderIds),
    );
    if (input.orderIds.some(orderId => occupiedOrderIds.has(orderId))) {
      return { kind: 'order-occupied' };
    }

    const nowIso = this.now().toISOString();
    const application: ShipperInvoiceApplicationRecord = {
      id: `invoice-application-${getApplicationCount(this.applications) + 1}`,
      shipperId,
      invoiceType: input.invoiceType,
      invoiceTitleType: input.invoiceTitleType,
      invoiceTitle: input.invoiceTitle,
      receiverEmail: input.receiverEmail,
      orderIds: [...input.orderIds],
      orderNos: eligibility.orders.map(order => order.orderNo),
      amountCents: eligibility.amountCents,
      status: 'reviewing',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    const currentApplications = this.applications.get(shipperId) ?? [];

    currentApplications.push(application);
    this.applications.set(shipperId, currentApplications);

    return { kind: 'success', application };
  }

  async findEnterpriseVerification(shipperId: string) {
    return this.enterpriseVerifications.get(shipperId);
  }
}

export type PrismaShipperInvoiceApplicationRecord = {
  id: string;
  shipperId: string;
  invoiceType: string;
  invoiceTitleType: string;
  invoiceTitle: string;
  receiverEmail: string;
  orderIds: unknown;
  orderNos: unknown;
  amountCents: number;
  status: ShipperInvoiceApplicationRecord['status'];
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PrismaProfileInvoicesOrderRecord = {
  id: string;
  shipperId: string;
  orderNo: string;
  status: ShipperInvoiceOrderRecord['status'];
  paymentStatus: ShipperInvoiceOrderRecord['paymentStatus'];
  settlement: { grossAmountCents: number } | null;
  paymentOrders: Array<{ amountCents: number }>;
  refunds: Array<{ amountCents: number }>;
};

export type PrismaProfileInvoicesEnterpriseVerificationRecord = {
  status: ShipperEnterpriseVerificationSnapshot['status'];
  rejectionReason: string | null;
};

export type PrismaProfileInvoicesClient = {
  $transaction<T>(
    callback: (transaction: PrismaProfileInvoicesTransactionClient) => Promise<T>,
  ): Promise<T>;
  shipperInvoiceApplication: {
    findMany(args: {
      where: { shipperId: string };
      orderBy: { createdAt: 'desc' };
    }): Promise<PrismaShipperInvoiceApplicationRecord[]>;
  };
  shipperEnterpriseVerification: {
    findUnique(args: {
      where: { shipperId: string };
      select: {
        status: true;
        rejectionReason: true;
      };
    }): Promise<PrismaProfileInvoicesEnterpriseVerificationRecord | null>;
  };
};

export type PrismaProfileInvoicesTransactionClient = {
  $queryRawUnsafe<T = unknown>(
    query: string,
    ...values: unknown[]
  ): Promise<T>;
  shipperInvoiceApplication: {
    findFirst(args: {
      where: {
        shipperId: string;
        status: { not: 'rejected' };
        OR: Array<{
          orderIds: { array_contains: string[] };
        }>;
      };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        shipperId: string;
        invoiceType: string;
        invoiceTitleType: string;
        invoiceTitle: string;
        receiverEmail: string;
        orderIds: string[];
        orderNos: string[];
        amountCents: number;
        status: 'reviewing';
        rejectionReason: null;
      };
    }): Promise<PrismaShipperInvoiceApplicationRecord>;
  };
  order: {
    findMany(args: {
      where: {
        shipperId: string;
        id: { in: string[] };
      };
      select: {
        id: true;
        shipperId: true;
        orderNo: true;
        status: true;
        paymentStatus: true;
        settlement: {
          select: { grossAmountCents: true };
        };
        paymentOrders: {
          where: { status: 'settled' };
          select: { amountCents: true };
          orderBy: { createdAt: 'desc' };
          take: 1;
        };
        refunds: {
          where: { status: 'succeeded' };
          select: { amountCents: true };
        };
      };
    }): Promise<PrismaProfileInvoicesOrderRecord[]>;
  };
};

export class PrismaProfileInvoicesRepository implements ProfileInvoicesRepository {
  constructor(private readonly prisma: PrismaProfileInvoicesClient) {}

  async listApplications(shipperId: string) {
    const applications = await this.prisma.shipperInvoiceApplication.findMany({
      where: { shipperId },
      orderBy: { createdAt: 'desc' },
    });

    return applications.map(mapPrismaInvoiceApplication);
  }

  async createEligibleApplication(
    shipperId: string,
    input: CreateShipperInvoiceApplicationRequest,
  ): Promise<CreateEligibleInvoiceApplicationResult> {
    return this.prisma.$transaction(async transaction => {
      const orderIds = [...input.orderIds].sort();
      await transaction.$queryRawUnsafe(
        'SELECT "id" FROM "Order" WHERE "shipperId" = $1 AND "id" = ANY($2::text[]) ORDER BY "id" FOR UPDATE',
        shipperId,
        orderIds,
      );

      const orders = await transaction.order.findMany({
        where: {
          shipperId,
          id: { in: input.orderIds },
        },
        select: {
          id: true,
          shipperId: true,
          orderNo: true,
          status: true,
          paymentStatus: true,
          settlement: {
            select: { grossAmountCents: true },
          },
          paymentOrders: {
            where: { status: 'settled' },
            select: { amountCents: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          refunds: {
            where: { status: 'succeeded' },
            select: { amountCents: true },
          },
        },
      });
      const selectedOrders = input.orderIds.map(orderId =>
        orders.find(order => order.id === orderId),
      );
      const eligibility = evaluateInvoiceOrders(
        selectedOrders.filter(
          (order): order is PrismaProfileInvoicesOrderRecord => Boolean(order),
        ).map(mapPrismaInvoiceOrder),
        input.orderIds,
      );
      if (eligibility.kind !== 'eligible') {
        return eligibility;
      }

      const occupied =
        await transaction.shipperInvoiceApplication.findFirst({
          where: {
            shipperId,
            status: { not: 'rejected' },
            OR: input.orderIds.map(orderId => ({
              orderIds: { array_contains: [orderId] },
            })),
          },
          select: { id: true },
        });
      if (occupied) {
        return { kind: 'order-occupied' as const };
      }

      const application =
        await transaction.shipperInvoiceApplication.create({
          data: {
            shipperId,
            invoiceType: input.invoiceType,
            invoiceTitleType: input.invoiceTitleType,
            invoiceTitle: input.invoiceTitle,
            receiverEmail: input.receiverEmail,
            orderIds: input.orderIds,
            orderNos: eligibility.orders.map(order => order.orderNo),
            amountCents: eligibility.amountCents,
            status: 'reviewing',
            rejectionReason: null,
          },
        });

      return {
        kind: 'success' as const,
        application: mapPrismaInvoiceApplication(application),
      };
    });
  }

  async findEnterpriseVerification(shipperId: string) {
    const verification =
      await this.prisma.shipperEnterpriseVerification.findUnique({
        where: { shipperId },
        select: {
          status: true,
          rejectionReason: true,
        },
      });

    return verification
      ? {
          status: verification.status,
          ...(verification.rejectionReason
            ? { rejectionReason: verification.rejectionReason }
            : {}),
        }
      : undefined;
  }
}

type InvoiceOrdersEligibility =
  | {
      kind: 'eligible';
      orders: ShipperInvoiceOrderRecord[];
      amountCents: number;
    }
  | Exclude<CreateEligibleInvoiceApplicationResult, { kind: 'success' }>;

function selectInvoiceOrders(
  orders: ShipperInvoiceOrderRecord[],
  shipperId: string,
  orderIds: string[],
) {
  const ordersById = new Map(
    orders
      .filter(order => order.shipperId === shipperId)
      .map(order => [order.id, order]),
  );
  return orderIds
    .map(orderId => ordersById.get(orderId))
    .filter((order): order is ShipperInvoiceOrderRecord => Boolean(order));
}

function evaluateInvoiceOrders(
  orders: ShipperInvoiceOrderRecord[],
  orderIds: string[],
): InvoiceOrdersEligibility {
  if (orders.length !== orderIds.length) {
    return { kind: 'orders-not-found' };
  }
  if (orders.some(order => order.status !== 'completed')) {
    return { kind: 'order-not-completed' };
  }

  let amountCents = 0;
  for (const order of orders) {
    const financialAmountCents =
      order.settlementAmountCents ?? order.paymentAmountCents;
    const refundedAmountCents = order.succeededRefundAmountCents ?? 0;
    if (
      order.paymentStatus !== 'settled' ||
      !Number.isSafeInteger(financialAmountCents) ||
      !financialAmountCents ||
      financialAmountCents <= 0 ||
      !Number.isSafeInteger(refundedAmountCents) ||
      refundedAmountCents < 0 ||
      refundedAmountCents >= financialAmountCents
    ) {
      return { kind: 'financially-ineligible' };
    }
    amountCents += financialAmountCents - refundedAmountCents;
  }

  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return { kind: 'financially-ineligible' };
  }

  return { kind: 'eligible', orders, amountCents };
}

function mapPrismaInvoiceOrder(
  order: PrismaProfileInvoicesOrderRecord,
): ShipperInvoiceOrderRecord {
  const refundedAmountCents = order.refunds.reduce(
    (total, refund) => total + refund.amountCents,
    0,
  );

  return {
    id: order.id,
    shipperId: order.shipperId,
    orderNo: order.orderNo,
    status: order.status,
    paymentStatus: order.paymentStatus,
    ...(order.settlement
      ? { settlementAmountCents: order.settlement.grossAmountCents }
      : {}),
    ...(order.paymentOrders[0]
      ? { paymentAmountCents: order.paymentOrders[0].amountCents }
      : {}),
    ...(refundedAmountCents > 0
      ? { succeededRefundAmountCents: refundedAmountCents }
      : {}),
  };
}

function getApplicationCount(
  applications: Map<string, ShipperInvoiceApplicationRecord[]>,
) {
  return [...applications.values()].reduce(
    (count, shipperApplications) => count + shipperApplications.length,
    0,
  );
}

function mapPrismaInvoiceApplication(
  application: PrismaShipperInvoiceApplicationRecord,
): ShipperInvoiceApplicationRecord {
  return {
    id: application.id,
    shipperId: application.shipperId,
    invoiceType: normalizeInvoiceType(application.invoiceType),
    invoiceTitleType: normalizeInvoiceTitleType(application.invoiceTitleType),
    invoiceTitle: application.invoiceTitle,
    receiverEmail: application.receiverEmail,
    orderIds: parseStringArray(application.orderIds),
    orderNos: parseStringArray(application.orderNos),
    amountCents: application.amountCents,
    status: application.status,
    ...(application.rejectionReason
      ? { rejectionReason: application.rejectionReason }
      : {}),
    createdAtIso: application.createdAt.toISOString(),
    updatedAtIso: application.updatedAt.toISOString(),
  };
}

function normalizeInvoiceType(
  invoiceType: string,
): ShipperInvoiceApplicationRecord['invoiceType'] {
  return invoiceType === 'vat-special' ? invoiceType : 'normal';
}

function normalizeInvoiceTitleType(
  invoiceTitleType: string,
): ShipperInvoiceApplicationRecord['invoiceTitleType'] {
  return invoiceTitleType === 'enterprise' ? invoiceTitleType : 'personal';
}

function parseStringArray(value: unknown) {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
    ? value
    : [];
}
