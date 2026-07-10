import { readFileSync } from 'fs';
import { join } from 'path';

const {
  runDriverCertificationSmoke,
  runAuthSmoke,
  runOrderSmoke,
  seedStage1Database,
} = require('../../scripts/seed-stage-1');

class FakeStage1Prisma {
  readonly users: Array<{
    id: string;
    phone: string;
    userType: 'shipper' | 'driver' | 'admin';
    status: 'active' | 'disabled';
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
      };
      update: { status: 'active' | 'disabled' };
    }) => {
      const existingUser = this.users.find(user => user.phone === where.phone);

      if (existingUser) {
        existingUser.status = update.status;
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

    await seedStage1Database(prisma);

    expect(prisma.users).toEqual([
      {
        id: 'seed-user-1',
        phone: '13800138000',
        userType: 'shipper',
        status: 'active',
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

  it('exposes seed and auth smoke scripts for normal and test databases', () => {
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
    expect(packageJson.scripts['db:postgres:bootstrap']).toContain(
      'npm run db:postgres:driver-certification-smoke',
    );
    expect(packageJson.scripts['db:test:postgres:bootstrap']).toContain(
      'npm run db:test:postgres:driver-certification-smoke',
    );
  });
});
