import type {
  BatchIssueShipperCouponsResult,
  IssueShipperCouponRequest,
  ShipperCouponRecord,
} from './dto';
import type { AdminCouponIssueOperation } from './profile-coupons.idempotency';

export type AdminCouponIssueResponse =
  | ShipperCouponRecord
  | BatchIssueShipperCouponsResult;

export type ExecuteAdminCouponIssueInput = {
  actorAdminId: string;
  operation: AdminCouponIssueOperation;
  idempotencyKey: string;
  requestFingerprint: string;
  couponInputs: IssueShipperCouponRequest[];
  issuedAtIso: string;
  expiresAtIso: string;
};

export type ExecuteAdminCouponIssueResult =
  | {
      kind: 'success';
      response: AdminCouponIssueResponse;
      replayed: boolean;
    }
  | { kind: 'key-reused' }
  | { kind: 'key-expired' };

type InMemoryAdminCouponIssueIdempotencyRecord = {
  actorAdminId: string;
  operation: AdminCouponIssueOperation;
  idempotencyKey: string;
  requestFingerprint: string;
  responseSnapshot: AdminCouponIssueResponse;
  createdAtIso: string;
  expiresAtIso: string;
};

export interface ProfileCouponsRepository {
  listCoupons(shipperId: string): Promise<ShipperCouponRecord[]>;
  listAllCoupons(): Promise<ShipperCouponRecord[]>;
  createCoupon(
    input: IssueShipperCouponRequest,
    issuedAt: Date,
  ): Promise<ShipperCouponRecord>;
  createCoupons(
    inputs: IssueShipperCouponRequest[],
    issuedAt: Date,
  ): Promise<ShipperCouponRecord[]>;
  executeIdempotentCouponIssue(
    input: ExecuteAdminCouponIssueInput,
  ): Promise<ExecuteAdminCouponIssueResult>;
  lockCoupon(
    shipperId: string,
    couponId: string,
    lockedAt: Date,
    orderNo?: string,
  ): Promise<ShipperCouponRecord | undefined>;
  bindLockedCouponToOrder(
    shipperId: string,
    couponId: string,
    orderNo: string,
  ): Promise<ShipperCouponRecord | undefined>;
  releaseCoupon(
    shipperId: string,
    couponId: string,
    orderNo?: string,
  ): Promise<ShipperCouponRecord | undefined>;
  redeemCoupon(
    shipperId: string,
    couponId: string,
    orderNo: string,
    usedAt: Date,
  ): Promise<ShipperCouponRecord | undefined>;
}

export class InMemoryProfileCouponsStore {
  coupons: ShipperCouponRecord[];
  couponIssueIdempotencyRecords: InMemoryAdminCouponIssueIdempotencyRecord[];

  constructor(
    seed: {
      coupons?: ShipperCouponRecord[];
      couponIssueIdempotencyRecords?: InMemoryAdminCouponIssueIdempotencyRecord[];
    } = {},
  ) {
    this.coupons = structuredClone(seed.coupons ?? []);
    this.couponIssueIdempotencyRecords = structuredClone(
      seed.couponIssueIdempotencyRecords ?? [],
    );
  }

  clone() {
    return structuredClone(this.coupons);
  }

  replace(coupons: ShipperCouponRecord[]) {
    this.coupons = structuredClone(coupons);
  }
}

export class InMemoryProfileCouponsRepository
  implements ProfileCouponsRepository
{
  private readonly store: InMemoryProfileCouponsStore;
  private readonly now: () => Date;

  constructor(
    seed: {
      coupons?: ShipperCouponRecord[];
      store?: InMemoryProfileCouponsStore;
      now?: () => Date;
    } = {},
  ) {
    this.store =
      seed.store ?? new InMemoryProfileCouponsStore({ coupons: seed.coupons });
    this.now = seed.now ?? (() => new Date());
  }

  async listCoupons(shipperId: string) {
    return (await this.listAllCoupons())
      .filter(coupon => coupon.shipperId === shipperId)
      .sort((left, right) => right.issuedAtIso.localeCompare(left.issuedAtIso));
  }

  async listAllCoupons() {
    return [...this.store.coupons].sort((left, right) =>
      right.issuedAtIso.localeCompare(left.issuedAtIso),
    );
  }

  async createCoupon(input: IssueShipperCouponRequest, issuedAt: Date) {
    const coupon: ShipperCouponRecord = {
      id: `coupon-${this.store.coupons.length + 1}`,
      shipperId: input.shipperId,
      title: input.title,
      status: 'usable',
      conditionText: input.conditionText,
      discountCents: input.discountCents,
      minOrderAmountCents: input.minOrderAmountCents,
      validFromIso: input.validFromIso,
      validUntilIso: input.validUntilIso,
      sourceText: input.sourceText ?? '后台手工发放',
      issuedAtIso: issuedAt.toISOString(),
    };

    this.store.coupons.push(coupon);

    return coupon;
  }

  async createCoupons(inputs: IssueShipperCouponRequest[], issuedAt: Date) {
    const created: ShipperCouponRecord[] = [];

    for (const input of inputs) {
      created.push(await this.createCoupon(input, issuedAt));
    }

    return created;
  }

  async executeIdempotentCouponIssue(input: ExecuteAdminCouponIssueInput) {
    const existing = this.store.couponIssueIdempotencyRecords.find(
      record =>
        record.actorAdminId === input.actorAdminId &&
        record.operation === input.operation &&
        record.idempotencyKey === input.idempotencyKey,
    );

    if (existing) {
      return mapExistingCouponIssueRecord(existing, input, this.now());
    }

    const stagedCoupons = structuredClone(this.store.coupons);
    const issuedAt = new Date(input.issuedAtIso);
    const coupons = input.couponInputs.map((couponInput, index) =>
      createInMemoryCoupon(
        couponInput,
        issuedAt,
        stagedCoupons.length + index + 1,
      ),
    );
    stagedCoupons.push(...coupons);
    const response = createCouponIssueResponse(input.operation, coupons);
    const record: InMemoryAdminCouponIssueIdempotencyRecord = {
      actorAdminId: input.actorAdminId,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      responseSnapshot: cloneJsonValue(response),
      createdAtIso: this.now().toISOString(),
      expiresAtIso: input.expiresAtIso,
    };

    this.store.coupons.splice(
      0,
      this.store.coupons.length,
      ...stagedCoupons,
    );
    this.store.couponIssueIdempotencyRecords.push(record);

    return {
      kind: 'success' as const,
      response: cloneJsonValue(response),
      replayed: false,
    };
  }

  async lockCoupon(
    shipperId: string,
    couponId: string,
    lockedAt: Date,
    orderNo?: string,
  ) {
    const coupon = this.store.coupons.find(
      item => item.shipperId === shipperId && item.id === couponId,
    );

    if (!coupon || coupon.status !== 'usable') {
      return undefined;
    }

    coupon.status = 'locked';
    coupon.lockedAtIso = lockedAt.toISOString();
    if (orderNo) {
      coupon.lockedOrderNo = orderNo;
    } else {
      delete coupon.lockedOrderNo;
    }
    delete coupon.usedOrderNo;
    delete coupon.usedAtIso;

    return coupon;
  }

  async bindLockedCouponToOrder(
    shipperId: string,
    couponId: string,
    orderNo: string,
  ) {
    const coupon = this.store.coupons.find(
      item => item.shipperId === shipperId && item.id === couponId,
    );

    if (
      !coupon ||
      coupon.status !== 'locked' ||
      (coupon.lockedOrderNo && coupon.lockedOrderNo !== orderNo)
    ) {
      return undefined;
    }

    coupon.lockedOrderNo = orderNo;

    return coupon;
  }

  async releaseCoupon(shipperId: string, couponId: string, orderNo?: string) {
    const coupon = this.store.coupons.find(
      item => item.shipperId === shipperId && item.id === couponId,
    );

    if (
      !coupon ||
      coupon.status !== 'locked' ||
      (orderNo && coupon.lockedOrderNo && coupon.lockedOrderNo !== orderNo)
    ) {
      return undefined;
    }

    coupon.status = 'usable';
    delete coupon.lockedOrderNo;
    delete coupon.lockedAtIso;
    delete coupon.usedOrderNo;
    delete coupon.usedAtIso;

    return coupon;
  }

  async redeemCoupon(
    shipperId: string,
    couponId: string,
    orderNo: string,
    usedAt: Date,
  ) {
    const coupon = this.store.coupons.find(
      item => item.shipperId === shipperId && item.id === couponId,
    );

    if (
      !coupon ||
      coupon.status !== 'locked' ||
      (coupon.lockedOrderNo && coupon.lockedOrderNo !== orderNo)
    ) {
      return undefined;
    }

    coupon.status = 'used';
    delete coupon.lockedOrderNo;
    delete coupon.lockedAtIso;
    coupon.usedOrderNo = orderNo;
    coupon.usedAtIso = usedAt.toISOString();

    return coupon;
  }
}

export type PrismaShipperCouponRecord = {
  id: string;
  shipperId: string;
  title: string;
  status: string;
  conditionText: string;
  discountCents: number;
  minOrderAmountCents: number;
  validFrom: Date;
  validUntil: Date;
  sourceText: string;
  issuedAt: Date;
  lockedOrderNo: string | null;
  lockedAt: Date | null;
  usedOrderNo: string | null;
  usedAt: Date | null;
};

export type PrismaAdminCouponIssueIdempotencyRecord = {
  id: string;
  actorAdminId: string;
  operation: string;
  idempotencyKey: string;
  requestFingerprint: string;
  responseSnapshot: unknown;
  createdAt: Date;
  expiresAt: Date;
};

type AdminCouponIssueIdempotencyWhereUnique = {
  AdminCouponIssueIdempotency_actor_operation_key_unique: {
    actorAdminId: string;
    operation: AdminCouponIssueOperation;
    idempotencyKey: string;
  };
};

export type PrismaProfileCouponsClient = {
  $transaction<T>(
    callback: (prisma: PrismaProfileCouponsClient) => Promise<T>,
  ): Promise<T>;
  shipperCoupon: {
    findMany(args: {
      where?: { shipperId?: string };
      orderBy?: { issuedAt: 'desc' | 'asc' };
    }): Promise<PrismaShipperCouponRecord[]>;
    create(args: {
      data: {
        shipperId: string;
        title: string;
        status: string;
        conditionText: string;
        discountCents: number;
        minOrderAmountCents: number;
        validFrom: Date;
        validUntil: Date;
        sourceText: string;
        issuedAt: Date;
      };
    }): Promise<PrismaShipperCouponRecord>;
    updateMany(args: {
      where: {
        id: string;
        shipperId: string;
        status: string;
        lockedOrderNo?: string | null;
        OR?: Array<{ lockedOrderNo: string | null }>;
      };
      data: {
        status: string;
        lockedOrderNo?: string | null;
        lockedAt?: Date | null;
        usedOrderNo?: string | null;
        usedAt?: Date | null;
      };
    }): Promise<{ count: number }>;
    findFirst(args: {
      where: {
        id: string;
        shipperId: string;
      };
    }): Promise<PrismaShipperCouponRecord | null>;
  };
  adminCouponIssueIdempotencyRecord: {
    findUnique(args: {
      where: AdminCouponIssueIdempotencyWhereUnique;
    }): Promise<PrismaAdminCouponIssueIdempotencyRecord | null>;
    create(args: {
      data: {
        actorAdminId: string;
        operation: AdminCouponIssueOperation;
        idempotencyKey: string;
        requestFingerprint: string;
        responseSnapshot: unknown;
        createdAt: Date;
        expiresAt: Date;
      };
    }): Promise<PrismaAdminCouponIssueIdempotencyRecord>;
    update(args: {
      where: { id: string };
      data: { responseSnapshot: unknown };
    }): Promise<PrismaAdminCouponIssueIdempotencyRecord>;
  };
};

export class PrismaProfileCouponsRepository
  implements ProfileCouponsRepository
{
  constructor(
    private readonly prisma: PrismaProfileCouponsClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listCoupons(shipperId: string) {
    const coupons = await this.prisma.shipperCoupon.findMany({
      where: { shipperId },
      orderBy: { issuedAt: 'desc' },
    });

    return coupons.map(mapPrismaCoupon);
  }

  async listAllCoupons() {
    const coupons = await this.prisma.shipperCoupon.findMany({
      orderBy: { issuedAt: 'desc' },
    });

    return coupons.map(mapPrismaCoupon);
  }

  async createCoupon(input: IssueShipperCouponRequest, issuedAt: Date) {
    const coupon = await this.prisma.shipperCoupon.create({
      data: {
        shipperId: input.shipperId,
        title: input.title,
        status: 'usable',
        conditionText: input.conditionText,
        discountCents: input.discountCents,
        minOrderAmountCents: input.minOrderAmountCents,
        validFrom: new Date(input.validFromIso),
        validUntil: new Date(input.validUntilIso),
        sourceText: input.sourceText ?? '后台手工发放',
        issuedAt,
      },
    });

    return mapPrismaCoupon(coupon);
  }

  async createCoupons(inputs: IssueShipperCouponRequest[], issuedAt: Date) {
    return this.prisma.$transaction(async prisma => {
      const created = [];

      for (const input of inputs) {
        created.push(
          await prisma.shipperCoupon.create({
            data: {
              shipperId: input.shipperId,
              title: input.title,
              status: 'usable',
              conditionText: input.conditionText,
              discountCents: input.discountCents,
              minOrderAmountCents: input.minOrderAmountCents,
              validFrom: new Date(input.validFromIso),
              validUntil: new Date(input.validUntilIso),
              sourceText: input.sourceText ?? '后台手工发放',
              issuedAt,
            },
          }),
        );
      }

      return created.map(mapPrismaCoupon);
    });
  }

  async executeIdempotentCouponIssue(input: ExecuteAdminCouponIssueInput) {
    const existing = await this.findCouponIssueIdempotencyRecord(input);

    if (existing) {
      return mapExistingCouponIssueRecord(existing, input, this.now());
    }

    try {
      return await this.prisma.$transaction(async transaction => {
        const createdAt = this.now();
        const reservation =
          await transaction.adminCouponIssueIdempotencyRecord.create({
            data: {
              actorAdminId: input.actorAdminId,
              operation: input.operation,
              idempotencyKey: input.idempotencyKey,
              requestFingerprint: input.requestFingerprint,
              responseSnapshot: {},
              createdAt,
              expiresAt: new Date(input.expiresAtIso),
            },
          });
        const issuedAt = new Date(input.issuedAtIso);
        const coupons: ShipperCouponRecord[] = [];

        for (const couponInput of input.couponInputs) {
          const coupon = await transaction.shipperCoupon.create({
            data: createPrismaCouponData(couponInput, issuedAt),
          });
          coupons.push(mapPrismaCoupon(coupon));
        }

        const response = createCouponIssueResponse(input.operation, coupons);
        await transaction.adminCouponIssueIdempotencyRecord.update({
          where: { id: reservation.id },
          data: { responseSnapshot: response },
        });

        return {
          kind: 'success' as const,
          response: cloneJsonValue(response),
          replayed: false,
        };
      });
    } catch (error) {
      if (isPrismaErrorCode(error, 'P2002')) {
        const winningRecord =
          await this.findCouponIssueIdempotencyRecord(input);

        if (winningRecord) {
          return mapExistingCouponIssueRecord(
            winningRecord,
            input,
            this.now(),
          );
        }
      }

      throw error;
    }
  }

  async lockCoupon(
    shipperId: string,
    couponId: string,
    lockedAt: Date,
    orderNo?: string,
  ) {
    const result = await this.prisma.shipperCoupon.updateMany({
      where: {
        id: couponId,
        shipperId,
        status: 'usable',
      },
      data: {
        status: 'locked',
        lockedOrderNo: orderNo ?? null,
        lockedAt,
        usedOrderNo: null,
        usedAt: null,
      },
    });

    return result.count === 1 ? this.findCoupon(shipperId, couponId) : undefined;
  }

  async bindLockedCouponToOrder(
    shipperId: string,
    couponId: string,
    orderNo: string,
  ) {
    const result = await this.prisma.shipperCoupon.updateMany({
      where: {
        id: couponId,
        shipperId,
        status: 'locked',
        OR: [{ lockedOrderNo: orderNo }, { lockedOrderNo: null }],
      },
      data: {
        status: 'locked',
        lockedOrderNo: orderNo,
      },
    });

    return result.count === 1 ? this.findCoupon(shipperId, couponId) : undefined;
  }

  async releaseCoupon(shipperId: string, couponId: string, orderNo?: string) {
    const result = await this.prisma.shipperCoupon.updateMany({
      where: {
        id: couponId,
        shipperId,
        status: 'locked',
        ...(orderNo
          ? { OR: [{ lockedOrderNo: orderNo }, { lockedOrderNo: null }] }
          : {}),
      },
      data: {
        status: 'usable',
        lockedOrderNo: null,
        lockedAt: null,
        usedOrderNo: null,
        usedAt: null,
      },
    });

    return result.count === 1 ? this.findCoupon(shipperId, couponId) : undefined;
  }

  async redeemCoupon(
    shipperId: string,
    couponId: string,
    orderNo: string,
    usedAt: Date,
  ) {
    const result = await this.prisma.shipperCoupon.updateMany({
      where: {
        id: couponId,
        shipperId,
        status: 'locked',
        OR: [{ lockedOrderNo: orderNo }, { lockedOrderNo: null }],
      },
      data: {
        status: 'used',
        lockedOrderNo: null,
        lockedAt: null,
        usedOrderNo: orderNo,
        usedAt,
      },
    });

    return result.count === 1 ? this.findCoupon(shipperId, couponId) : undefined;
  }

  private async findCoupon(shipperId: string, couponId: string) {
    const coupon = await this.prisma.shipperCoupon.findFirst({
      where: {
        id: couponId,
        shipperId,
      },
    });

    return coupon ? mapPrismaCoupon(coupon) : undefined;
  }

  private findCouponIssueIdempotencyRecord(
    input: Pick<
      ExecuteAdminCouponIssueInput,
      'actorAdminId' | 'operation' | 'idempotencyKey'
    >,
  ) {
    return this.prisma.adminCouponIssueIdempotencyRecord.findUnique({
      where: createCouponIssueIdempotencyWhereUnique(input),
    });
  }
}

export function mapPrismaCoupon(
  coupon: PrismaShipperCouponRecord,
): ShipperCouponRecord {
  return {
    id: coupon.id,
    shipperId: coupon.shipperId,
    title: coupon.title,
    status: normalizeCouponStatus(coupon.status),
    conditionText: coupon.conditionText,
    discountCents: coupon.discountCents,
    minOrderAmountCents: coupon.minOrderAmountCents,
    validFromIso: coupon.validFrom.toISOString(),
    validUntilIso: coupon.validUntil.toISOString(),
    sourceText: coupon.sourceText,
    issuedAtIso: coupon.issuedAt.toISOString(),
    ...(coupon.lockedOrderNo ? { lockedOrderNo: coupon.lockedOrderNo } : {}),
    ...(coupon.lockedAt ? { lockedAtIso: coupon.lockedAt.toISOString() } : {}),
    ...(coupon.usedOrderNo ? { usedOrderNo: coupon.usedOrderNo } : {}),
    ...(coupon.usedAt ? { usedAtIso: coupon.usedAt.toISOString() } : {}),
  };
}

function normalizeCouponStatus(status: string): ShipperCouponRecord['status'] {
  if (status === 'locked' || status === 'used' || status === 'expired') {
    return status;
  }

  return 'usable';
}

function createInMemoryCoupon(
  input: IssueShipperCouponRequest,
  issuedAt: Date,
  sequence: number,
): ShipperCouponRecord {
  return {
    id: `coupon-${sequence}`,
    shipperId: input.shipperId,
    title: input.title,
    status: 'usable',
    conditionText: input.conditionText,
    discountCents: input.discountCents,
    minOrderAmountCents: input.minOrderAmountCents,
    validFromIso: input.validFromIso,
    validUntilIso: input.validUntilIso,
    sourceText: input.sourceText ?? '后台手工发放',
    issuedAtIso: issuedAt.toISOString(),
  };
}

function createPrismaCouponData(
  input: IssueShipperCouponRequest,
  issuedAt: Date,
) {
  return {
    shipperId: input.shipperId,
    title: input.title,
    status: 'usable',
    conditionText: input.conditionText,
    discountCents: input.discountCents,
    minOrderAmountCents: input.minOrderAmountCents,
    validFrom: new Date(input.validFromIso),
    validUntil: new Date(input.validUntilIso),
    sourceText: input.sourceText ?? '后台手工发放',
    issuedAt,
  };
}

function createCouponIssueResponse(
  operation: AdminCouponIssueOperation,
  coupons: ShipperCouponRecord[],
): AdminCouponIssueResponse {
  if (operation === 'single_issue') {
    const coupon = coupons[0];

    if (!coupon || coupons.length !== 1) {
      throw new Error('Single coupon issue must create exactly one coupon');
    }

    return cloneJsonValue(coupon);
  }

  return {
    requestedCount: coupons.length,
    issuedCount: coupons.length,
    coupons: cloneJsonValue(coupons),
  };
}

function mapExistingCouponIssueRecord(
  record:
    | InMemoryAdminCouponIssueIdempotencyRecord
    | PrismaAdminCouponIssueIdempotencyRecord,
  input: Pick<
    ExecuteAdminCouponIssueInput,
    'requestFingerprint'
  >,
  now: Date,
): ExecuteAdminCouponIssueResult {
  if (record.requestFingerprint !== input.requestFingerprint) {
    return { kind: 'key-reused' };
  }

  const expiresAt =
    'expiresAtIso' in record ? record.expiresAtIso : record.expiresAt.toISOString();
  if (Date.parse(expiresAt) <= now.getTime()) {
    return { kind: 'key-expired' };
  }

  return {
    kind: 'success',
    response: cloneJsonValue(
      record.responseSnapshot as AdminCouponIssueResponse,
    ),
    replayed: true,
  };
}

function createCouponIssueIdempotencyWhereUnique(
  input: Pick<
    ExecuteAdminCouponIssueInput,
    'actorAdminId' | 'operation' | 'idempotencyKey'
  >,
): AdminCouponIssueIdempotencyWhereUnique {
  return {
    AdminCouponIssueIdempotency_actor_operation_key_unique: {
      actorAdminId: input.actorAdminId,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
    },
  };
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPrismaErrorCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
