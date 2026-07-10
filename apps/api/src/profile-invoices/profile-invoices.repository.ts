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
  createApplication(
    shipperId: string,
    input: CreateShipperInvoiceApplicationRequest & {
      orderNos: string[];
      amountCents: number;
    },
  ): Promise<ShipperInvoiceApplicationRecord>;
  findOrdersByIds(
    shipperId: string,
    orderIds: string[],
  ): Promise<ShipperInvoiceOrderRecord[]>;
  findEnterpriseVerification(
    shipperId: string,
  ): Promise<ShipperEnterpriseVerificationSnapshot | undefined>;
}

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

  async createApplication(
    shipperId: string,
    input: CreateShipperInvoiceApplicationRequest & {
      orderNos: string[];
      amountCents: number;
    },
  ): Promise<ShipperInvoiceApplicationRecord> {
    const nowIso = this.now().toISOString();
    const application: ShipperInvoiceApplicationRecord = {
      id: `invoice-application-${getApplicationCount(this.applications) + 1}`,
      shipperId,
      invoiceType: input.invoiceType,
      invoiceTitleType: input.invoiceTitleType,
      invoiceTitle: input.invoiceTitle,
      receiverEmail: input.receiverEmail,
      orderIds: [...input.orderIds],
      orderNos: [...input.orderNos],
      amountCents: input.amountCents,
      status: 'reviewing',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    const currentApplications = this.applications.get(shipperId) ?? [];

    currentApplications.push(application);
    this.applications.set(shipperId, currentApplications);

    return application;
  }

  async findOrdersByIds(shipperId: string, orderIds: string[]) {
    const orderIdSet = new Set(orderIds);

    return this.orders.filter(
      order => order.shipperId === shipperId && orderIdSet.has(order.id),
    );
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
  priceCents: number | null;
  payablePriceCents: number | null;
};

export type PrismaProfileInvoicesEnterpriseVerificationRecord = {
  status: ShipperEnterpriseVerificationSnapshot['status'];
  rejectionReason: string | null;
};

export type PrismaProfileInvoicesClient = {
  shipperInvoiceApplication: {
    findMany(args: {
      where: { shipperId: string };
      orderBy: { createdAt: 'desc' };
    }): Promise<PrismaShipperInvoiceApplicationRecord[]>;
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
        priceCents: true;
        payablePriceCents: true;
      };
    }): Promise<PrismaProfileInvoicesOrderRecord[]>;
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

export class PrismaProfileInvoicesRepository implements ProfileInvoicesRepository {
  constructor(private readonly prisma: PrismaProfileInvoicesClient) {}

  async listApplications(shipperId: string) {
    const applications = await this.prisma.shipperInvoiceApplication.findMany({
      where: { shipperId },
      orderBy: { createdAt: 'desc' },
    });

    return applications.map(mapPrismaInvoiceApplication);
  }

  async createApplication(
    shipperId: string,
    input: CreateShipperInvoiceApplicationRequest & {
      orderNos: string[];
      amountCents: number;
    },
  ): Promise<ShipperInvoiceApplicationRecord> {
    const application = await this.prisma.shipperInvoiceApplication.create({
      data: {
        shipperId,
        invoiceType: input.invoiceType,
        invoiceTitleType: input.invoiceTitleType,
        invoiceTitle: input.invoiceTitle,
        receiverEmail: input.receiverEmail,
        orderIds: input.orderIds,
        orderNos: input.orderNos,
        amountCents: input.amountCents,
        status: 'reviewing',
        rejectionReason: null,
      },
    });

    return mapPrismaInvoiceApplication(application);
  }

  async findOrdersByIds(shipperId: string, orderIds: string[]) {
    const orders = await this.prisma.order.findMany({
      where: {
        shipperId,
        id: {
          in: orderIds,
        },
      },
      select: {
        id: true,
        shipperId: true,
        orderNo: true,
        status: true,
        priceCents: true,
        payablePriceCents: true,
      },
    });

    return orders.map(order => ({
      id: order.id,
      shipperId: order.shipperId,
      orderNo: order.orderNo,
      status: order.status,
      ...(order.priceCents !== null ? { priceCents: order.priceCents } : {}),
      ...(order.payablePriceCents !== null
        ? { payablePriceCents: order.payablePriceCents }
        : {}),
    }));
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
