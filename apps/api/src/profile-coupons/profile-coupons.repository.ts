import type {
  IssueShipperCouponRequest,
  ShipperCouponRecord,
} from './dto';

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

  constructor(seed: { coupons?: ShipperCouponRecord[] } = {}) {
    this.coupons = structuredClone(seed.coupons ?? []);
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

  constructor(
    seed: {
      coupons?: ShipperCouponRecord[];
      store?: InMemoryProfileCouponsStore;
    } = {},
  ) {
    this.store =
      seed.store ?? new InMemoryProfileCouponsStore({ coupons: seed.coupons });
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
};

export class PrismaProfileCouponsRepository
  implements ProfileCouponsRepository
{
  constructor(private readonly prisma: PrismaProfileCouponsClient) {}

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
