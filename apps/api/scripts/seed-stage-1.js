const { PrismaClient } = require('@prisma/client');
const { resolveDatabaseUrl } = require('./verify-postgres');

const STAGE_1_SHIPPER_PHONE = '13800138000';
const STAGE_1_ADMIN_PHONE = '13900139000';
const STAGE_1_DRIVER_PHONE = '13900139009';

async function seedStage1Database(prisma) {
  const user = await prisma.user.upsert({
    where: {
      phone: STAGE_1_SHIPPER_PHONE,
    },
    create: {
      phone: STAGE_1_SHIPPER_PHONE,
      userType: 'shipper',
      status: 'active',
    },
    update: {
      status: 'active',
    },
  });

  await prisma.shipperProfile.upsert({
    where: {
      userId: user.id,
    },
    create: {
      userId: user.id,
      displayName: '阶段 1 演示货主',
      identityStatus: 'unverified',
      enterpriseStatus: 'unverified',
    },
    update: {
      displayName: '阶段 1 演示货主',
    },
  });

  return {
    phone: user.phone,
    userType: user.userType,
  };
}

async function runAuthSmoke(prisma) {
  await prisma.$queryRaw`SELECT 1`;

  const user = await prisma.user.findUnique({
    where: {
      phone: STAGE_1_SHIPPER_PHONE,
    },
  });

  if (!user || user.userType !== 'shipper') {
    throw new Error('Stage 1 auth smoke user is missing');
  }

  const profile = await prisma.shipperProfile.upsert({
    where: {
      userId: user.id,
    },
    create: {
      userId: user.id,
      displayName: '阶段 1 演示货主',
      identityStatus: 'unverified',
      enterpriseStatus: 'unverified',
    },
    update: {
      displayName: '阶段 1 演示货主',
    },
  });

  return {
    phone: user.phone,
    userType: user.userType,
    profileReady: Boolean(profile),
  };
}

async function runOrderSmoke(prisma) {
  await prisma.$queryRaw`SELECT 1`;

  const user = await prisma.user.findUnique({
    where: {
      phone: STAGE_1_SHIPPER_PHONE,
    },
  });

  if (!user || user.userType !== 'shipper') {
    throw new Error('Stage 1 order smoke user is missing');
  }

  const existingOrderCount = await prisma.order.count({
    where: {
      shipperId: user.id,
    },
  });
  const orderNo = `HYSMOKE${String(existingOrderCount + 1).padStart(4, '0')}`;
  const order = await prisma.order.create({
    data: {
      orderNo,
      shipperId: user.id,
      status: 'waiting',
      pricingMode: 'fixed',
      priceCents: 76000,
      payablePriceCents: 76000,
      paymentMethod: 'cod',
      pickupTime: new Date('2026-07-02T02:00:00.000Z'),
      cargo: {
        create: {
          cargoType: 'building_material',
          weightText: '2.5 吨',
          quantityText: '12 箱',
          cargoPhotoCount: 0,
        },
      },
      locations: {
        create: [
          {
            type: 'pickup',
            address: '宝安区福永物流园',
            contactName: '赵经理',
            contactPhone: '13900139001',
          },
          {
            type: 'delivery',
            address: '南山区科技园',
            contactName: '钱店长',
            contactPhone: '13900139002',
          },
        ],
      },
      requirement: {
        create: {
          vehicleType: 'medium',
          needTailboard: false,
          needTarp: false,
        },
      },
      events: {
        create: {
          actorUserId: user.id,
          eventType: 'created',
          noteText: '订单数据库冒烟创建',
        },
      },
    },
    include: orderSmokeInclude,
  });
  const list = await prisma.order.findMany({
    where: {
      shipperId: user.id,
    },
    include: orderSmokeInclude,
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  });
  const detail = await prisma.order.findUnique({
    where: {
      id: order.id,
    },
    include: orderSmokeInclude,
  });
  const listReady = list.some(item => item.id === order.id);
  const detailReady =
    detail?.id === order.id && detail.cargo?.cargoType === 'building_material';
  const eventReady = Boolean(
    detail?.events?.some(event => event.eventType === 'created'),
  );

  if (!listReady || !detailReady || !eventReady) {
    throw new Error('Stage 1 order smoke verification failed');
  }

  return {
    phone: user.phone,
    userType: user.userType,
    orderNo: order.orderNo,
    listReady,
    detailReady,
    eventReady,
  };
}

async function runDriverCertificationSmoke(prisma) {
  await prisma.$queryRaw`SELECT 1`;

  const [driver, admin] = await Promise.all([
    prisma.user.upsert({
      where: {
        phone: STAGE_1_DRIVER_PHONE,
      },
      create: {
        phone: STAGE_1_DRIVER_PHONE,
        userType: 'driver',
        status: 'active',
      },
      update: {
        userType: 'driver',
        status: 'active',
      },
    }),
    prisma.user.upsert({
      where: {
        phone: STAGE_1_ADMIN_PHONE,
      },
      create: {
        phone: STAGE_1_ADMIN_PHONE,
        userType: 'admin',
        status: 'active',
      },
      update: {
        userType: 'admin',
        status: 'active',
      },
    }),
  ]);
  const [
    identityFrontFile,
    identityBackFile,
    drivingLicenseFile,
    vehiclePhotoFile,
  ] = await Promise.all(
    [
      ['identity-front', '身份证正面'],
      ['identity-back', '身份证反面'],
      ['driving-license', '行驶证'],
      ['vehicle-photo', '车辆照片'],
    ].map(([key, title]) =>
      prisma.fileObject.create({
        data: {
          ownerUserId: driver.id,
          purpose: 'identity',
          contentType: 'image/png',
          byteSize: 2048,
          objectKey: `${driver.id}/identity/smoke-${key}.png`,
          publicUrl: `https://cdn.example.com/${driver.id}/identity/smoke-${key}.png`,
          status: 'uploaded',
        },
      }),
    ),
  );

  const identity = await prisma.driverIdentityCertification.upsert({
    where: {
      driverId: driver.id,
    },
    create: {
      driverId: driver.id,
      realName: '阶段 1 认证司机',
      identityNumber: '110101199003071234',
      identityFrontFileId: identityFrontFile.id,
      identityBackFileId: identityBackFile.id,
      status: 'reviewing',
      rejectionReason: null,
    },
    update: {
      realName: '阶段 1 认证司机',
      identityNumber: '110101199003071234',
      identityFrontFileId: identityFrontFile.id,
      identityBackFileId: identityBackFile.id,
      status: 'reviewing',
      rejectionReason: null,
    },
  });
  const vehicle = await prisma.driverVehicleCertification.upsert({
    where: {
      driverId: driver.id,
    },
    create: {
      driverId: driver.id,
      plateNumber: '粤B12345',
      vehicleType: 'medium',
      vehicleLengthText: '6.8 米',
      loadCapacityText: '8 吨',
      hasTailboard: true,
      drivingLicenseFileId: drivingLicenseFile.id,
      vehiclePhotoFileId: vehiclePhotoFile.id,
      status: 'reviewing',
      rejectionReason: null,
    },
    update: {
      plateNumber: '粤B12345',
      vehicleType: 'medium',
      vehicleLengthText: '6.8 米',
      loadCapacityText: '8 吨',
      hasTailboard: true,
      drivingLicenseFileId: drivingLicenseFile.id,
      vehiclePhotoFileId: vehiclePhotoFile.id,
      status: 'reviewing',
      rejectionReason: null,
    },
  });
  const identityFromStatus = identity.status;
  const vehicleFromStatus = vehicle.status;

  await prisma.driverIdentityCertification.update({
    where: {
      driverId: driver.id,
    },
    data: {
      status: 'approved',
      rejectionReason: null,
    },
  });
  await prisma.driverCertificationReviewEvent.create({
    data: {
      driverId: driver.id,
      reviewerAdminId: admin.id,
      certificationType: 'identity',
      fromStatus: identityFromStatus,
      toStatus: 'approved',
      rejectionReason: null,
    },
  });
  await prisma.driverVehicleCertification.update({
    where: {
      driverId: driver.id,
    },
    data: {
      status: 'approved',
      rejectionReason: null,
    },
  });
  await prisma.driverCertificationReviewEvent.create({
    data: {
      driverId: driver.id,
      reviewerAdminId: admin.id,
      certificationType: 'vehicle',
      fromStatus: vehicleFromStatus,
      toStatus: 'approved',
      rejectionReason: null,
    },
  });

  const [approvedIdentity, approvedVehicle, attachments, reviewEvents] =
    await Promise.all([
      prisma.driverIdentityCertification.findUnique({
        where: {
          driverId: driver.id,
        },
      }),
      prisma.driverVehicleCertification.findUnique({
        where: {
          driverId: driver.id,
        },
      }),
      prisma.fileObject.findMany({
        where: {
          id: {
            in: [
              identityFrontFile.id,
              identityBackFile.id,
              drivingLicenseFile.id,
              vehiclePhotoFile.id,
            ],
          },
        },
      }),
      prisma.driverCertificationReviewEvent.findMany({
        where: {
          driverId: driver.id,
        },
      }),
    ]);
  const attachmentReady =
    attachments.length === 4 &&
    attachments.every(
      attachment =>
        attachment.ownerUserId === driver.id &&
        attachment.purpose === 'identity' &&
        attachment.status === 'uploaded',
    );
  const reviewEventReady =
    reviewEvents.some(
      event =>
        event.certificationType === 'identity' &&
        event.fromStatus === 'reviewing' &&
        event.toStatus === 'approved',
    ) &&
    reviewEvents.some(
      event =>
        event.certificationType === 'vehicle' &&
        event.fromStatus === 'reviewing' &&
        event.toStatus === 'approved',
    );

  if (
    approvedIdentity?.status !== 'approved' ||
    approvedVehicle?.status !== 'approved' ||
    !attachmentReady ||
    !reviewEventReady
  ) {
    throw new Error('Stage 1 driver certification smoke verification failed');
  }

  return {
    driverPhone: driver.phone,
    adminPhone: admin.phone,
    identityApproved: approvedIdentity.status === 'approved',
    vehicleApproved: approvedVehicle.status === 'approved',
    attachmentReady,
    reviewEventReady,
  };
}

const orderSmokeInclude = {
  cargo: true,
  locations: true,
  requirement: true,
  events: {
    orderBy: {
      createdAt: 'asc',
    },
  },
};

function parseArgs(argv) {
  const command = argv[2];
  const useTestDatabase = argv.includes('--test');

  if (
    command !== 'seed' &&
    command !== 'auth-smoke' &&
    command !== 'order-smoke' &&
    command !== 'driver-certification-smoke'
  ) {
    throw new Error(
      'Usage: node scripts/seed-stage-1.js <seed|auth-smoke|order-smoke|driver-certification-smoke> [--test]',
    );
  }

  return {
    command,
    useTestDatabase,
  };
}

async function main(argv = process.argv, env = process.env) {
  const { command, useTestDatabase } = parseArgs(argv);
  const databaseUrl = resolveDatabaseUrl(env, useTestDatabase);
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    await prisma.$connect();
    const result = await runCommand(command, prisma);
    console.log(JSON.stringify(result));
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().then(
    exitCode => {
      process.exitCode = exitCode;
    },
    error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    },
  );
}

function runCommand(command, prisma) {
  if (command === 'seed') {
    return seedStage1Database(prisma);
  }

  if (command === 'auth-smoke') {
    return runAuthSmoke(prisma);
  }

  if (command === 'order-smoke') {
    return runOrderSmoke(prisma);
  }

  return runDriverCertificationSmoke(prisma);
}

module.exports = {
  STAGE_1_ADMIN_PHONE,
  STAGE_1_DRIVER_PHONE,
  STAGE_1_SHIPPER_PHONE,
  main,
  parseArgs,
  runAuthSmoke,
  runDriverCertificationSmoke,
  runOrderSmoke,
  seedStage1Database,
};
