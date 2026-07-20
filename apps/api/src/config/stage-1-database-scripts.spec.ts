import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { verifyPassword } from '../auth/password-hasher';

const {
  STAGE_1_ADMIN_PASSWORD,
  buildApiForSmoke,
  cleanupSmokeBuildOutputRoot,
  createOrderMutationSmokeApiClient,
  parseArgs,
  runDriverCertificationSmoke,
  runAuthSmoke,
  runOrderSmoke,
  runOrderCouponAtomicityScenario,
  runOrderMutationConcurrencyScenario,
  seedStage1Database,
  summarizeConcurrentMutationResults,
  withOrderCouponLateFailureTrigger,
} = require('../../scripts/seed-stage-1');

class FakeStage1Prisma {
  readonly users: Array<{
    id: string;
    phone: string;
    userType: 'shipper' | 'driver' | 'admin';
    status: 'active' | 'disabled';
    passwordHash?: string;
  }> = [];
  readonly profiles: Array<{
    userId: string;
    displayName: string;
    identityStatus: string;
    enterpriseStatus: string;
  }> = [];
  readonly files: Array<{
    id: string;
    ownerUserId: string;
    purpose: 'identity';
    contentType: string;
    byteSize: number;
    objectKey: string;
    publicUrl: string;
    status: 'uploaded';
    createdAt: Date;
  }> = [];
  readonly identityCertifications: Array<{
    driverId: string;
    realName: string;
    identityNumber: string;
    identityFrontFileId: string;
    identityBackFileId: string;
    status: 'reviewing' | 'approved' | 'rejected';
    rejectionReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  readonly vehicleCertifications: Array<{
    driverId: string;
    plateNumber: string;
    vehicleType: string;
    vehicleLengthText: string;
    loadCapacityText: string;
    hasTailboard: boolean;
    drivingLicenseFileId: string;
    vehiclePhotoFileId: string;
    status: 'reviewing' | 'approved' | 'rejected';
    rejectionReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  readonly driverCertificationReviewEvents: Array<{
    id: string;
    driverId: string;
    reviewerAdminId: string;
    certificationType: 'identity' | 'vehicle';
    fromStatus: 'reviewing' | 'approved' | 'rejected';
    toStatus: 'reviewing' | 'approved' | 'rejected';
    rejectionReason: string | null;
    createdAt: Date;
  }> = [];
  readonly orders: Array<{
    id: string;
    orderNo: string;
    shipperId: string;
    status: 'waiting';
    pricingMode: 'fixed';
    priceCents: number;
    payablePriceCents: number;
    paymentMethod: 'cod';
    paymentStatus: 'not_required';
    pickupTime: Date;
    createdAt: Date;
    updatedAt: Date;
    cargo: {
      cargoType: string;
      weightText: string;
      quantityText: string;
      cargoPhotoCount: number;
    };
    locations: Array<{
      type: 'pickup' | 'delivery';
      address: string;
      contactName: string;
      contactPhone: string;
    }>;
    requirement: {
      vehicleType: string;
      needTailboard: boolean;
      needTarp: boolean;
    };
    events: Array<{
      id: string;
      eventType: string;
      noteText: string;
      createdAt: Date;
    }>;
  }> = [];
  connected = false;
  disconnected = false;

  readonly user = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { phone: string };
      create: {
        phone: string;
        userType: 'shipper' | 'driver' | 'admin';
        status: 'active' | 'disabled';
        passwordHash?: string;
      };
      update: {
        status: 'active' | 'disabled';
        userType?: 'shipper' | 'driver' | 'admin';
        passwordHash?: string;
      };
    }) => {
      const existingUser = this.users.find(user => user.phone === where.phone);

      if (existingUser) {
        existingUser.status = update.status;
        if (update.userType) {
          existingUser.userType = update.userType;
        }
        if (update.passwordHash) {
          existingUser.passwordHash = update.passwordHash;
        }
        return existingUser;
      }

      const user = {
        id: `seed-user-${this.users.length + 1}`,
        ...create,
      };
      this.users.push(user);
      return user;
    },
    findUnique: async ({ where }: { where: { phone: string } }) =>
      this.users.find(user => user.phone === where.phone) ?? null,
  };

  readonly fileObject = {
    create: async ({
      data,
    }: {
      data: {
        ownerUserId: string;
        purpose: 'identity';
        contentType: string;
        byteSize: number;
        objectKey: string;
        publicUrl: string;
        status: 'uploaded';
      };
    }) => {
      const file = {
        id: `smoke-file-${this.files.length + 1}`,
        ...data,
        createdAt: new Date('2026-07-06T08:00:00.000Z'),
      };

      this.files.push(file);
      return file;
    },
    findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
      this.files.filter(file => where.id.in.includes(file.id)),
  };

  readonly driverIdentityCertification = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { driverId: string };
      create: {
        driverId: string;
        realName: string;
        identityNumber: string;
        identityFrontFileId: string;
        identityBackFileId: string;
        status: 'reviewing';
        rejectionReason: null;
      };
      update: {
        realName: string;
        identityNumber: string;
        identityFrontFileId: string;
        identityBackFileId: string;
        status: 'reviewing';
        rejectionReason: null;
      };
    }) => {
      const now = new Date('2026-07-06T08:00:00.000Z');
      const existing = this.identityCertifications.find(
        certification => certification.driverId === where.driverId,
      );

      if (existing) {
        Object.assign(existing, update, { updatedAt: now });
        return existing;
      }

      const certification = {
        ...create,
        createdAt: now,
        updatedAt: now,
      };
      this.identityCertifications.push(certification);
      return certification;
    },
    update: async ({
      where,
      data,
    }: {
      where: { driverId: string };
      data: { status: 'approved'; rejectionReason: null };
    }) => {
      const certification = this.identityCertifications.find(
        item => item.driverId === where.driverId,
      );

      if (!certification) {
        throw new Error('Identity certification missing');
      }

      Object.assign(certification, data, {
        updatedAt: new Date('2026-07-06T08:05:00.000Z'),
      });
      return certification;
    },
    findUnique: async ({ where }: { where: { driverId: string } }) =>
      this.identityCertifications.find(
        certification => certification.driverId === where.driverId,
      ) ?? null,
  };

  readonly driverVehicleCertification = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { driverId: string };
      create: {
        driverId: string;
        plateNumber: string;
        vehicleType: string;
        vehicleLengthText: string;
        loadCapacityText: string;
        hasTailboard: boolean;
        drivingLicenseFileId: string;
        vehiclePhotoFileId: string;
        status: 'reviewing';
        rejectionReason: null;
      };
      update: {
        plateNumber: string;
        vehicleType: string;
        vehicleLengthText: string;
        loadCapacityText: string;
        hasTailboard: boolean;
        drivingLicenseFileId: string;
        vehiclePhotoFileId: string;
        status: 'reviewing';
        rejectionReason: null;
      };
    }) => {
      const now = new Date('2026-07-06T08:00:00.000Z');
      const existing = this.vehicleCertifications.find(
        certification => certification.driverId === where.driverId,
      );

      if (existing) {
        Object.assign(existing, update, { updatedAt: now });
        return existing;
      }

      const certification = {
        ...create,
        createdAt: now,
        updatedAt: now,
      };
      this.vehicleCertifications.push(certification);
      return certification;
    },
    update: async ({
      where,
      data,
    }: {
      where: { driverId: string };
      data: { status: 'approved'; rejectionReason: null };
    }) => {
      const certification = this.vehicleCertifications.find(
        item => item.driverId === where.driverId,
      );

      if (!certification) {
        throw new Error('Vehicle certification missing');
      }

      Object.assign(certification, data, {
        updatedAt: new Date('2026-07-06T08:05:00.000Z'),
      });
      return certification;
    },
    findUnique: async ({ where }: { where: { driverId: string } }) =>
      this.vehicleCertifications.find(
        certification => certification.driverId === where.driverId,
      ) ?? null,
  };

  readonly driverCertificationReviewEvent = {
    create: async ({
      data,
    }: {
      data: {
        driverId: string;
        reviewerAdminId: string;
        certificationType: 'identity' | 'vehicle';
        fromStatus: 'reviewing' | 'approved' | 'rejected';
        toStatus: 'reviewing' | 'approved' | 'rejected';
        rejectionReason: string | null;
      };
    }) => {
      const event = {
        id: `smoke-certification-event-${this.driverCertificationReviewEvents.length + 1}`,
        ...data,
        createdAt: new Date('2026-07-06T08:05:00.000Z'),
      };
      this.driverCertificationReviewEvents.push(event);
      return event;
    },
    findMany: async ({ where }: { where: { driverId: string } }) =>
      this.driverCertificationReviewEvents.filter(
        event => event.driverId === where.driverId,
      ),
  };

  readonly shipperProfile = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { userId: string };
      create: {
        userId: string;
        displayName: string;
        identityStatus: string;
        enterpriseStatus: string;
      };
      update: { displayName: string };
    }) => {
      const existingProfile = this.profiles.find(
        profile => profile.userId === where.userId,
      );

      if (existingProfile) {
        existingProfile.displayName = update.displayName;
        return existingProfile;
      }

      this.profiles.push(create);
      return create;
    },
  };

  readonly order = {
    count: async ({ where }: { where: { shipperId: string } }) =>
      this.orders.filter(order => order.shipperId === where.shipperId).length,
    create: async ({
      data,
    }: {
      data: {
        orderNo: string;
        shipperId: string;
        status: 'waiting';
        pricingMode: 'fixed';
        priceCents: number;
        payablePriceCents: number;
        paymentMethod: 'cod';
        paymentStatus: 'not_required';
        pickupTime: Date;
        cargo: {
          create: {
            cargoType: string;
            weightText: string;
            quantityText: string;
            cargoPhotoCount: number;
          };
        };
        locations: {
          create: Array<{
            type: 'pickup' | 'delivery';
            address: string;
            contactName: string;
            contactPhone: string;
          }>;
        };
        requirement: {
          create: {
            vehicleType: string;
            needTailboard: boolean;
            needTarp: boolean;
          };
        };
        events: {
          create: {
            actorUserId: string;
            eventType: string;
            noteText: string;
          };
        };
      };
    }) => {
      const now = new Date('2026-07-01T08:00:00.000Z');
      const order = {
        id: `smoke-order-${this.orders.length + 1}`,
        orderNo: data.orderNo,
        shipperId: data.shipperId,
        status: data.status,
        pricingMode: data.pricingMode,
        priceCents: data.priceCents,
        payablePriceCents: data.payablePriceCents,
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentStatus,
        pickupTime: data.pickupTime,
        createdAt: now,
        updatedAt: now,
        cargo: data.cargo.create,
        locations: data.locations.create,
        requirement: data.requirement.create,
        events: [
          {
            id: `smoke-event-${this.orders.length + 1}`,
            eventType: data.events.create.eventType,
            noteText: data.events.create.noteText,
            createdAt: now,
          },
        ],
      };

      this.orders.push(order);
      return order;
    },
    findMany: async ({ where }: { where: { shipperId: string } }) =>
      this.orders.filter(order => order.shipperId === where.shipperId),
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.orders.find(order => order.id === where.id) ?? null,
  };

  async $queryRaw() {
    return [{ ok: 1 }];
  }

  async $connect() {
    this.connected = true;
  }

  async $disconnect() {
    this.disconnected = true;
  }
}

describe('stage 1 database scripts', () => {
  const packageJsonPath = join(__dirname, '..', '..', 'package.json');

  it('seeds a deterministic stage 1 shipper user and profile', async () => {
    const prisma = new FakeStage1Prisma();

    await expect(seedStage1Database(prisma)).resolves.toEqual({
      phone: '13800138000',
      userType: 'shipper',
      adminPhone: '13900139000',
      adminPassword: STAGE_1_ADMIN_PASSWORD,
    });

    expect(prisma.users).toEqual([
      {
        id: 'seed-user-1',
        phone: '13800138000',
        userType: 'shipper',
        status: 'active',
      },
      {
        id: 'seed-user-2',
        phone: '13900139000',
        userType: 'admin',
        status: 'active',
        passwordHash: expect.stringMatching(/^scrypt\$/),
      },
    ]);
    expect(prisma.profiles).toEqual([
      {
        userId: 'seed-user-1',
        displayName: '阶段 1 演示货主',
        identityStatus: 'unverified',
        enterpriseStatus: 'unverified',
      },
    ]);
    await expect(
      verifyPassword(STAGE_1_ADMIN_PASSWORD, prisma.users[1].passwordHash!),
    ).resolves.toBe(true);
  });

  it('smoke checks connectivity and the seeded auth user', async () => {
    const prisma = new FakeStage1Prisma();
    await seedStage1Database(prisma);

    await expect(runAuthSmoke(prisma)).resolves.toEqual({
      phone: '13800138000',
      userType: 'shipper',
      profileReady: true,
    });
  });

  it('smoke checks order create list detail and event records', async () => {
    const prisma = new FakeStage1Prisma();
    await seedStage1Database(prisma);

    await expect(runOrderSmoke(prisma)).resolves.toEqual({
      phone: '13800138000',
      userType: 'shipper',
      orderNo: 'HYSMOKE0001',
      listReady: true,
      detailReady: true,
      eventReady: true,
    });
    expect(prisma.orders).toHaveLength(1);
    expect(prisma.orders[0]).toMatchObject({
      orderNo: 'HYSMOKE0001',
      status: 'waiting',
      paymentStatus: 'not_required',
      cargo: {
        cargoType: 'building_material',
        weightText: '2.5 吨',
      },
    });
  });

  it('smoke checks driver certification records review events and attachments', async () => {
    const prisma = new FakeStage1Prisma();

    await expect(runDriverCertificationSmoke(prisma)).resolves.toEqual({
      driverPhone: '13900139009',
      adminPhone: '13900139000',
      identityApproved: true,
      vehicleApproved: true,
      attachmentReady: true,
      reviewEventReady: true,
    });
    expect(prisma.files).toHaveLength(4);
    expect(prisma.identityCertifications).toEqual([
      expect.objectContaining({
        status: 'approved',
        realName: '阶段 1 认证司机',
      }),
    ]);
    expect(prisma.vehicleCertifications).toEqual([
      expect.objectContaining({
        status: 'approved',
        plateNumber: '粤B12345',
      }),
    ]);
    expect(prisma.driverCertificationReviewEvents).toEqual([
      expect.objectContaining({
        certificationType: 'identity',
        fromStatus: 'reviewing',
        toStatus: 'approved',
      }),
      expect.objectContaining({
        certificationType: 'vehicle',
        fromStatus: 'reviewing',
        toStatus: 'approved',
      }),
    ]);
  });

  it('parses order mutation concurrency smoke for normal and test databases', () => {
    expect(
      parseArgs(['node', 'scripts/seed-stage-1.js', 'order-mutation-concurrency-smoke']),
    ).toEqual({
      command: 'order-mutation-concurrency-smoke',
      useTestDatabase: false,
    });
    expect(
      parseArgs([
        'node',
        'scripts/seed-stage-1.js',
        'order-mutation-concurrency-smoke',
        '--test',
      ]),
    ).toEqual({
      command: 'order-mutation-concurrency-smoke',
      useTestDatabase: true,
    });
  });

  it('parses order coupon atomicity smoke for normal and test databases', () => {
    expect(
      parseArgs(['node', 'scripts/seed-stage-1.js', 'order-coupon-atomicity-smoke']),
    ).toEqual({
      command: 'order-coupon-atomicity-smoke',
      useTestDatabase: false,
    });
    expect(
      parseArgs([
        'node',
        'scripts/seed-stage-1.js',
        'order-coupon-atomicity-smoke',
        '--test',
      ]),
    ).toEqual({
      command: 'order-coupon-atomicity-smoke',
      useTestDatabase: true,
    });
  });

  it('sends an idempotency key when the smoke client creates an order', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 'OK',
          message: 'success',
          data: { id: 'order-create-smoke' },
        }),
    });
    const apiClient = createOrderMutationSmokeApiClient(
      'http://127.0.0.1:3000',
      fetchImpl,
    );
    const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

    await apiClient.createShipperOrder(
      'shipper-token',
      { cargoType: 'digital' },
      idempotencyKey,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/api/shipper/orders',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer shipper-token',
          'Idempotency-Key': idempotencyKey,
        }),
      }),
    );
  });

  it('excludes the keyed create reservation from mutation replay counts', async () => {
    const prisma = new FakeStage1Prisma() as FakeStage1Prisma & {
      orderIdempotencyRecord: {
        count: jest.Mock<Promise<number>, [Record<string, unknown>]>;
      };
    };
    const count = jest.fn(async (_query: Record<string, unknown>) => 2);
    prisma.orderIdempotencyRecord = { count };
    const shipper = {
      user: { id: 'shipper-concurrency', phone: '13800138000' },
      tokens: { accessToken: 'shipper-token' },
    };
    const driverA = {
      user: { id: 'driver-a', phone: '13900139021' },
      tokens: { accessToken: 'driver-a-token' },
    };
    const driverB = {
      user: { id: 'driver-b', phone: '13900139022' },
      tokens: { accessToken: 'driver-b-token' },
    };
    const createdOrder = {
      id: 'order-concurrency',
      orderNo: 'HYCONCURRENCY0001',
      status: 'waiting',
      updatedAtIso: '2026-07-14T08:00:00.000Z',
      events: [],
    };
    const acceptedOrder = {
      ...createdOrder,
      updatedAtIso: '2026-07-14T08:01:00.000Z',
      events: [
        {
          eventType: 'driver_accepted',
          actorUserId: driverA.user.id,
        },
      ],
    };
    const transportingOrder = {
      ...acceptedOrder,
      status: 'transporting',
      updatedAtIso: '2026-07-14T08:02:00.000Z',
      events: [
        ...acceptedOrder.events,
        {
          eventType: 'driver_status_changed',
          actorUserId: driverA.user.id,
        },
      ],
    };
    const apiClient = {
      loginWithCode: jest
        .fn()
        .mockResolvedValueOnce(shipper)
        .mockResolvedValueOnce(driverA)
        .mockResolvedValueOnce(driverB),
      createShipperOrder: jest.fn(async () => createdOrder),
      acceptDriverOrder: jest
        .fn()
        .mockResolvedValueOnce(acceptedOrder)
        .mockRejectedValueOnce(createBusinessFailure('ORDER_CONFLICT')),
      advanceDriverOrderStatus: jest
        .fn()
        .mockResolvedValueOnce(transportingOrder)
        .mockRejectedValueOnce(createBusinessFailure('ORDER_CONFLICT'))
        .mockResolvedValueOnce(transportingOrder),
      getShipperOrder: jest.fn(async () => transportingOrder),
    };
    let keySequence = 0;

    await runOrderMutationConcurrencyScenario(prisma, apiClient, {
      createIdempotencyKey: () => `key-${++keySequence}`,
      ensureApprovedDrivers: jest.fn(async () => undefined),
      createOrderRequest: () => ({ cargoType: 'building_material' }),
    });

    expect(count).toHaveBeenCalledTimes(2);
    expect(count).toHaveBeenNthCalledWith(1, {
      where: {
        orderId: createdOrder.id,
        operation: { not: 'shipper_create' },
      },
    });
    expect(count).toHaveBeenNthCalledWith(2, {
      where: {
        orderId: createdOrder.id,
        operation: { not: 'shipper_create' },
      },
    });
  });

  it('checks replay, coupon races, coupon transitions, and late rollback', async () => {
    const coupons: Array<Record<string, unknown>> = [];
    const failedKeys = new Set<string>();
    const createdAtIso = '2026-07-14T08:00:00.000Z';
    const shipper = {
      user: { id: 'shipper-atomicity', phone: '13800138998' },
      tokens: { accessToken: 'shipper-atomicity-token' },
    };
    const driver = {
      user: { id: 'driver-atomicity', phone: '13900139031' },
      tokens: { accessToken: 'driver-atomicity-token' },
    };
    const replayOrder = createAtomicityOrder('order-replay', 'HYATOMIC0001');
    const raceOrder = createAtomicityOrder('order-race', 'HYATOMIC0002');
    const exchangeOrder = createAtomicityOrder('order-exchange', 'HYATOMIC0003');
    const cancelledOrder = createAtomicityOrder('order-cancel', 'HYATOMIC0004');
    const completedOrder = createAtomicityOrder('order-complete', 'HYATOMIC0005');
    const createCalls: Array<{
      body: Record<string, unknown>;
      idempotencyKey: string;
    }> = [];
    let createCallIndex = 0;
    let statusCallIndex = 0;
    const apiClient = {
      loginWithCode: jest
        .fn()
        .mockResolvedValueOnce(shipper)
        .mockResolvedValueOnce(driver),
      createShipperOrder: jest.fn(
        async (
          _accessToken: string,
          body: Record<string, unknown>,
          idempotencyKey: string,
        ) => {
          createCalls.push({ body, idempotencyKey });
          const index = createCallIndex++;

          if (index === 0 || index === 1) {
            return replayOrder;
          }

          if (index === 2) {
            throw createBusinessFailure('IDEMPOTENCY_KEY_REUSED');
          }

          if (index === 3) {
            return raceOrder;
          }

          if (index === 4) {
            failedKeys.add(idempotencyKey);
            throw createBusinessFailure('PROFILE_COUPON_NOT_AVAILABLE');
          }

          if (index === 5) {
            return exchangeOrder;
          }

          if (index === 6) {
            return cancelledOrder;
          }

          if (index === 7) {
            return completedOrder;
          }

          failedKeys.add(idempotencyKey);
          throw createBusinessFailure('INTERNAL_ERROR');
        },
      ),
      updateShipperOrder: jest.fn(async () => ({
        ...exchangeOrder,
        updatedAtIso: '2026-07-14T08:01:00.000Z',
      })),
      cancelShipperOrder: jest.fn(async () => ({
        ...cancelledOrder,
        status: 'cancelled',
        updatedAtIso: '2026-07-14T08:02:00.000Z',
      })),
      acceptDriverOrder: jest.fn(async () => ({
        ...completedOrder,
        status: 'loading',
        assignedDriverId: driver.user.id,
        updatedAtIso: '2026-07-14T08:03:00.000Z',
      })),
      advanceDriverOrderStatus: jest.fn(async () => {
        const statuses = ['transporting', 'confirming'];
        const status = statuses[statusCallIndex++];

        return {
          ...completedOrder,
          assignedDriverId: driver.user.id,
          status,
          updatedAtIso: `2026-07-14T08:0${statusCallIndex + 3}:00.000Z`,
        };
      }),
      completeShipperOrder: jest.fn(async () => ({
        ...completedOrder,
        status: 'completed',
        updatedAtIso: '2026-07-14T08:06:00.000Z',
      })),
    };
    const prisma = {
      verificationCode: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      shipperCoupon: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const coupon = { ...data };
          coupons.push(coupon);
          return coupon;
        }),
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const couponIndex = coupons.findIndex(item => item.id === where.id);
          const coupon = coupons[couponIndex];

          if (!coupon) {
            return null;
          }

          const stateByIndex = [
            { status: 'locked', lockedOrderNo: raceOrder.orderNo },
            { status: 'usable' },
            { status: 'locked', lockedOrderNo: exchangeOrder.orderNo },
            { status: 'usable' },
            { status: 'used', usedOrderNo: completedOrder.orderNo },
            { status: 'usable' },
          ];

          return {
            ...coupon,
            lockedOrderNo: null,
            lockedAt: null,
            usedOrderNo: null,
            usedAt: null,
            ...stateByIndex[couponIndex],
          };
        }),
      },
      order: {
        count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
          if (where.id) {
            return 1;
          }

          if (where.couponId === coupons[5]?.id) {
            return 0;
          }

          if (where.couponId) {
            return 1;
          }

          return 5;
        }),
      },
      orderEvent: {
        count: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
          where.orderId ? 1 : 5,
        ),
      },
      orderIdempotencyRecord: {
        count: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
          failedKeys.has(String(where.idempotencyKey)) ? 0 : 1,
        ),
      },
      $executeRawUnsafe: jest.fn(async () => 0),
    };
    let keySequence = 0;
    const ensureApprovedDriverForCompletion = jest.fn(async () => undefined);

    const result = await runOrderCouponAtomicityScenario(prisma, apiClient, {
      now: () => new Date(createdAtIso),
      createIdempotencyKey: () =>
        `550e8400-e29b-41d4-a716-${String(++keySequence).padStart(12, '0')}`,
      ensureApprovedDriverForCompletion,
    });

    expect(result).toMatchObject({
      sameKeyReplay: 'PASS',
      differentBodyKeyReuse: 'PASS',
      sameCouponSingleWinner: 'PASS',
      couponExchange: 'PASS',
      couponCancellationRelease: 'PASS',
      couponCompletionRedeem: 'PASS',
      lateFailureRollback: 'PASS',
    });
    expect(createCalls[0].idempotencyKey).toBe(createCalls[1].idempotencyKey);
    expect(createCalls[2].idempotencyKey).toBe(createCalls[0].idempotencyKey);
    expect(createCalls[2].body).not.toEqual(createCalls[0].body);
    expect(createCalls[3].idempotencyKey).not.toBe(
      createCalls[4].idempotencyKey,
    );
    expect(createCalls[3].body.couponId).toBe(createCalls[4].body.couponId);
    expect(apiClient.updateShipperOrder).toHaveBeenCalledTimes(1);
    expect(apiClient.cancelShipperOrder).toHaveBeenCalledTimes(1);
    expect(ensureApprovedDriverForCompletion).toHaveBeenCalledWith(
      prisma,
      driver,
    );
    expect(apiClient.acceptDriverOrder).toHaveBeenCalledTimes(1);
    expect(apiClient.advanceDriverOrderStatus).toHaveBeenCalledTimes(2);
    expect(apiClient.completeShipperOrder).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRawUnsafe.mock.calls.flat().join('\n')).toContain(
      'UPDATE OF "responseSnapshot"',
    );
    expect(prisma.$executeRawUnsafe.mock.calls.flat().join('\n')).toContain(
      'DROP TRIGGER IF EXISTS',
    );
    expect(prisma.$executeRawUnsafe.mock.calls.flat().join('\n')).toContain(
      'DROP FUNCTION IF EXISTS',
    );
  });

  it('drops both late-failure trigger objects when the guarded callback fails', async () => {
    const statements: string[] = [];
    const prisma = {
      $executeRawUnsafe: jest.fn(async (statement: string) => {
        statements.push(statement);
        return 0;
      }),
    };

    await expect(
      withOrderCouponLateFailureTrigger(
        prisma,
        '550e8400-e29b-41d4-a716-446655440000',
        async () => {
          throw new Error('probe assertion failed');
        },
      ),
    ).rejects.toThrow('probe assertion failed');

    expect(statements.some(statement => statement.includes('CREATE FUNCTION'))).toBe(
      true,
    );
    expect(statements.some(statement => statement.includes('CREATE TRIGGER'))).toBe(
      true,
    );
    expect(
      statements.some(statement => statement.includes('DROP TRIGGER IF EXISTS')),
    ).toBe(true);
    expect(
      statements.some(statement => statement.includes('DROP FUNCTION IF EXISTS')),
    ).toBe(true);
  });

  it('still drops the late-failure function when trigger cleanup fails', async () => {
    const statements: string[] = [];
    const prisma = {
      $executeRawUnsafe: jest.fn(async (statement: string) => {
        statements.push(statement);

        if (statement.includes('DROP TRIGGER IF EXISTS')) {
          throw new Error('trigger cleanup failed');
        }

        return 0;
      }),
    };

    await expect(
      withOrderCouponLateFailureTrigger(
        prisma,
        '550e8400-e29b-41d4-a716-446655440001',
        async () => undefined,
      ),
    ).rejects.toThrow('Failed to clean up order coupon late-failure trigger');

    expect(
      statements.some(statement => statement.includes('DROP TRIGGER IF EXISTS')),
    ).toBe(true);
    expect(
      statements.some(statement => statement.includes('DROP FUNCTION IF EXISTS')),
    ).toBe(true);
  });

  it('builds the smoke API into an isolated output directory', () => {
    const spawnSync = jest.fn(() => ({ status: 0 }));
    const buildOutputRoot = join('api-root', '.smoke-build', 'test-run');

    expect(
      buildApiForSmoke('api-root', spawnSync, 'win32', buildOutputRoot),
    ).toBe(buildOutputRoot);

    expect(spawnSync).toHaveBeenCalledWith(
      process.execPath,
      [
        require.resolve('typescript/bin/tsc'),
        '-p',
        'tsconfig.json',
        '--outDir',
        '.smoke-build/test-run',
      ],
      expect.objectContaining({
        cwd: 'api-root',
        shell: false,
        stdio: 'inherit',
      }),
    );
  });

  it('cleans up generated smoke build output under the isolated root', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'stage1-smoke-build-'));
    const apiRoot = join(workspace, 'api');
    const buildOutputRoot = join(apiRoot, '.smoke-build', 'run-1');
    const entryFile = join(buildOutputRoot, 'main.js');

    mkdirSync(buildOutputRoot, { recursive: true });
    writeFileSync(entryFile, 'module.exports = {};');

    expect(existsSync(buildOutputRoot)).toBe(true);

    cleanupSmokeBuildOutputRoot(apiRoot, buildOutputRoot);

    expect(existsSync(buildOutputRoot)).toBe(false);
    expect(existsSync(join(apiRoot, '.smoke-build'))).toBe(true);

    rmSync(workspace, { recursive: true, force: true });
  });

  it('does not delete paths outside the isolated smoke build root', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'stage1-smoke-build-'));
    const apiRoot = join(workspace, 'api');
    const outsideRoot = join(workspace, 'outside-build');
    const entryFile = join(outsideRoot, 'main.js');

    mkdirSync(outsideRoot, { recursive: true });
    writeFileSync(entryFile, 'module.exports = {};');

    cleanupSmokeBuildOutputRoot(apiRoot, outsideRoot);

    expect(existsSync(outsideRoot)).toBe(true);

    rmSync(workspace, { recursive: true, force: true });
  });

  it('summarizes a single-winner concurrent mutation race', () => {
    const winningOrder = {
      id: 'order-1',
      updatedAtIso: '2026-07-12T08:00:01.000Z',
      events: [],
    };

    expect(
      summarizeConcurrentMutationResults(
        [
          { status: 'fulfilled', value: winningOrder },
          { status: 'rejected', reason: { code: 'ORDER_CONFLICT' } },
        ],
        'ORDER_CONFLICT',
        'driver accept race',
      ),
    ).toEqual({
      successIndex: 0,
      order: winningOrder,
      failureIndex: 1,
      failureCode: 'ORDER_CONFLICT',
    });
  });

  it('exposes seed, smoke, and concurrency scripts for normal and test databases', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['db:postgres:seed']).toBe(
      'node scripts/seed-stage-1.js seed',
    );
    expect(packageJson.scripts['db:test:postgres:seed']).toBe(
      'node scripts/seed-stage-1.js seed --test',
    );
    expect(packageJson.scripts['db:postgres:auth-smoke']).toBe(
      'node scripts/seed-stage-1.js auth-smoke',
    );
    expect(packageJson.scripts['db:test:postgres:auth-smoke']).toBe(
      'node scripts/seed-stage-1.js auth-smoke --test',
    );
    expect(packageJson.scripts['db:postgres:order-smoke']).toBe(
      'node scripts/seed-stage-1.js order-smoke',
    );
    expect(packageJson.scripts['db:test:postgres:order-smoke']).toBe(
      'node scripts/seed-stage-1.js order-smoke --test',
    );
    expect(packageJson.scripts['db:postgres:driver-certification-smoke']).toBe(
      'node scripts/seed-stage-1.js driver-certification-smoke',
    );
    expect(
      packageJson.scripts['db:test:postgres:driver-certification-smoke'],
    ).toBe('node scripts/seed-stage-1.js driver-certification-smoke --test');
    expect(packageJson.scripts['db:postgres:order-mutation-concurrency-smoke']).toBe(
      'node scripts/seed-stage-1.js order-mutation-concurrency-smoke',
    );
    expect(
      packageJson.scripts['db:test:postgres:order-mutation-concurrency-smoke'],
    ).toBe(
      'node scripts/seed-stage-1.js order-mutation-concurrency-smoke --test',
    );
    expect(
      packageJson.scripts['db:postgres:order-coupon-atomicity-smoke'],
    ).toBe('node scripts/seed-stage-1.js order-coupon-atomicity-smoke');
    expect(
      packageJson.scripts['db:test:postgres:order-coupon-atomicity-smoke'],
    ).toBe('node scripts/seed-stage-1.js order-coupon-atomicity-smoke --test');
    expect(packageJson.scripts['db:postgres:financial-ledger-smoke']).toBe(
      'node scripts/verify-financial-ledger.js',
    );
    expect(packageJson.scripts['db:test:postgres:financial-ledger-smoke']).toBe(
      'node scripts/verify-financial-ledger.js --test',
    );
    expect(packageJson.scripts['db:postgres:bootstrap']).toContain(
      'npm run db:postgres:driver-certification-smoke',
    );
    expect(packageJson.scripts['db:postgres:bootstrap']).toContain(
      'npm run db:postgres:order-mutation-concurrency-smoke',
    );
    expect(packageJson.scripts['db:test:postgres:bootstrap']).toContain(
      'npm run db:test:postgres:driver-certification-smoke',
    );
    expect(packageJson.scripts['db:test:postgres:bootstrap']).toContain(
      'npm run db:test:postgres:order-mutation-concurrency-smoke',
    );
    expect(packageJson.scripts['db:postgres:bootstrap']).toContain(
      'npm run db:postgres:order-coupon-atomicity-smoke',
    );
    expect(packageJson.scripts['db:test:postgres:bootstrap']).toContain(
      'npm run db:test:postgres:order-coupon-atomicity-smoke',
    );
    expect(packageJson.scripts['db:postgres:bootstrap']).toContain(
      'npm run db:postgres:financial-ledger-smoke',
    );
    expect(packageJson.scripts['db:test:postgres:bootstrap']).toContain(
      'npm run db:test:postgres:financial-ledger-smoke',
    );

    for (const scriptName of [
      'db:postgres:bootstrap',
      'db:test:postgres:bootstrap',
    ]) {
      const bootstrap = packageJson.scripts[scriptName];
      const deployIndex = bootstrap.indexOf('postgres:deploy');
      const generateIndex = bootstrap.indexOf('npm run prisma:generate');
      const migrationVerifyIndex = bootstrap.indexOf(
        'order-coupon-migration-verify',
      );
      const seedIndex = bootstrap.indexOf('postgres:seed');
      const atomicitySmokeIndex = bootstrap.indexOf(
        'order-coupon-atomicity-smoke',
      );
      const financialLedgerSmokeIndex = bootstrap.indexOf(
        'financial-ledger-smoke',
      );

      expect(generateIndex).toBeGreaterThan(deployIndex);
      expect(migrationVerifyIndex).toBeGreaterThan(generateIndex);
      expect(seedIndex).toBeGreaterThan(migrationVerifyIndex);
      expect(atomicitySmokeIndex).toBeGreaterThan(seedIndex);
      expect(financialLedgerSmokeIndex).toBeGreaterThan(atomicitySmokeIndex);
    }
  });
});

function createAtomicityOrder(id: string, orderNo: string) {
  return {
    id,
    orderNo,
    status: 'waiting',
    updatedAtIso: '2026-07-14T08:00:00.000Z',
  };
}

function createBusinessFailure(code: string) {
  return Object.assign(new Error(code), { code });
}
