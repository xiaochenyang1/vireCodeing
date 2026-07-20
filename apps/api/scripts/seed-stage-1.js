const { randomUUID } = require('crypto');
const assert = require('assert/strict');
const net = require('net');
const path = require('path');
const { rmSync } = require('fs');
const { spawn, spawnSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const { resolveDatabaseUrl } = require('./verify-postgres');

const STAGE_1_SHIPPER_PHONE = '13800138000';
const STAGE_1_ADMIN_PHONE = '13900139000';
const STAGE_1_ADMIN_PASSWORD = 'Admin123';
const STAGE_1_ADMIN_PASSWORD_HASH =
  'scrypt$16384$8$1$c3RhZ2UxLWFkbWluLXNhbHQ$uhCC28Qxr1Qh2CTVFgg3Q4wigguforv2iwBY4TiIRvtXWMslrZQ-TsEy9pU-_DsFXCXL_mXtz1Zt2IeBiOKjfA';
const STAGE_1_DRIVER_PHONE = '13900139009';
const STAGE_1_CONCURRENCY_DRIVER_A_PHONE = '13900139021';
const STAGE_1_CONCURRENCY_DRIVER_B_PHONE = '13900139022';
const STAGE_1_ATOMICITY_SHIPPER_PHONE = '13800138998';
const STAGE_1_ATOMICITY_DRIVER_PHONE = '13900139031';

async function seedStage1Database(prisma) {
  const [user, admin] = await Promise.all([
    prisma.user.upsert({
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
    }),
    prisma.user.upsert({
      where: {
        phone: STAGE_1_ADMIN_PHONE,
      },
      create: {
        phone: STAGE_1_ADMIN_PHONE,
        userType: 'admin',
        status: 'active',
        passwordHash: STAGE_1_ADMIN_PASSWORD_HASH,
      },
      update: {
        userType: 'admin',
        status: 'active',
        passwordHash: STAGE_1_ADMIN_PASSWORD_HASH,
      },
    }),
  ]);

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
    adminPhone: admin.phone,
    adminPassword: STAGE_1_ADMIN_PASSWORD,
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
      paymentStatus: 'not_required',
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

async function runOrderMutationConcurrencyScenario(
  prisma,
  apiClient,
  {
    createIdempotencyKey = randomUUID,
    ensureApprovedDrivers = defaultEnsureApprovedDrivers,
    createOrderRequest = createOrderMutationSmokeOrderRequest,
  } = {},
) {
  if (!prisma.orderIdempotencyRecord?.count) {
    throw new Error('Prisma orderIdempotencyRecord client is required');
  }

  const smokePhones = [
    STAGE_1_SHIPPER_PHONE,
    STAGE_1_CONCURRENCY_DRIVER_A_PHONE,
    STAGE_1_CONCURRENCY_DRIVER_B_PHONE,
  ];
  await resetSmokeVerificationCodes(prisma, smokePhones);
  await seedStage1Database(prisma);

  const shipper = await apiClient.loginWithCode(
    STAGE_1_SHIPPER_PHONE,
    'shipper',
    'stage1-smoke-shipper-device',
  );
  const driverA = await apiClient.loginWithCode(
    STAGE_1_CONCURRENCY_DRIVER_A_PHONE,
    'driver',
    'stage1-smoke-driver-a-device',
  );
  const driverB = await apiClient.loginWithCode(
    STAGE_1_CONCURRENCY_DRIVER_B_PHONE,
    'driver',
    'stage1-smoke-driver-b-device',
  );

  await ensureApprovedDrivers(prisma, { driverA, driverB });

  const createdOrder = await apiClient.createShipperOrder(
    shipper.tokens.accessToken,
    createOrderRequest(),
    createIdempotencyKey(),
  );
  const acceptKeys = [createIdempotencyKey(), createIdempotencyKey()];
  const acceptResults = await Promise.allSettled([
    apiClient.acceptDriverOrder(
      driverA.tokens.accessToken,
      createdOrder.id,
      acceptKeys[0],
      {
        baseUpdatedAtIso: createdOrder.updatedAtIso,
        noteText: '并发司机 A 抢单',
      },
    ),
    apiClient.acceptDriverOrder(
      driverB.tokens.accessToken,
      createdOrder.id,
      acceptKeys[1],
      {
        baseUpdatedAtIso: createdOrder.updatedAtIso,
        noteText: '并发司机 B 抢单',
      },
    ),
  ]);
  const acceptRace = summarizeConcurrentMutationResults(
    acceptResults,
    'ORDER_CONFLICT',
    'driver accept race',
  );
  const winningDriver = acceptRace.successIndex === 0 ? driverA : driverB;
  const losingDriver = acceptRace.successIndex === 0 ? driverB : driverA;
  const acceptedOrder = acceptRace.order;

  const statusKeys = [createIdempotencyKey(), createIdempotencyKey()];
  const statusInput = {
    baseUpdatedAtIso: acceptedOrder.updatedAtIso,
    nextStatus: 'transporting',
  };
  const statusResults = await Promise.allSettled([
    apiClient.advanceDriverOrderStatus(
      winningDriver.tokens.accessToken,
      acceptedOrder.id,
      statusKeys[0],
      statusInput,
    ),
    apiClient.advanceDriverOrderStatus(
      winningDriver.tokens.accessToken,
      acceptedOrder.id,
      statusKeys[1],
      statusInput,
    ),
  ]);
  const statusRace = summarizeConcurrentMutationResults(
    statusResults,
    'ORDER_CONFLICT',
    'driver status race',
  );
  const idempotencyRecordCountBeforeReplay =
    await prisma.orderIdempotencyRecord.count({
      where: {
        orderId: acceptedOrder.id,
        operation: { not: 'shipper_create' },
      },
    });
  const replayedOrder = await apiClient.advanceDriverOrderStatus(
    winningDriver.tokens.accessToken,
    acceptedOrder.id,
    statusKeys[statusRace.successIndex],
    statusInput,
  );
  const idempotencyRecordCountAfterReplay =
    await prisma.orderIdempotencyRecord.count({
      where: {
        orderId: acceptedOrder.id,
        operation: { not: 'shipper_create' },
      },
    });
  const finalOrder = await apiClient.getShipperOrder(
    shipper.tokens.accessToken,
    acceptedOrder.id,
  );

  const acceptedEvents = finalOrder.events.filter(
    event => event.eventType === 'driver_accepted',
  );
  const driverStatusEvents = finalOrder.events.filter(
    event => event.eventType === 'driver_status_changed',
  );

  if (finalOrder.status !== 'transporting') {
    throw new Error(
      `Order mutation concurrency smoke expected transporting status, received ${finalOrder.status}`,
    );
  }

  if (
    acceptedEvents.length !== 1 ||
    acceptedEvents[0].actorUserId !== winningDriver.user.id
  ) {
    throw new Error('Driver accept race should persist exactly one winning event');
  }

  if (
    driverStatusEvents.length !== 1 ||
    driverStatusEvents[0].actorUserId !== winningDriver.user.id
  ) {
    throw new Error(
      'Driver status race should persist exactly one status change event',
    );
  }

  if (idempotencyRecordCountBeforeReplay !== 2) {
    throw new Error(
      `Expected two idempotency records before replay, received ${idempotencyRecordCountBeforeReplay}`,
    );
  }

  if (idempotencyRecordCountAfterReplay !== 2) {
    throw new Error(
      `Replay should not create extra idempotency records, received ${idempotencyRecordCountAfterReplay}`,
    );
  }

  if (
    replayedOrder.updatedAtIso !== statusRace.order.updatedAtIso ||
    replayedOrder.events.length !== statusRace.order.events.length
  ) {
    throw new Error('Replay response should match the first successful mutation');
  }

  return {
    orderId: finalOrder.id,
    orderNo: finalOrder.orderNo,
    winningDriverId: winningDriver.user.id,
    winningDriverPhone: winningDriver.user.phone,
    losingDriverId: losingDriver.user.id,
    losingDriverPhone: losingDriver.user.phone,
    acceptConflictCode: acceptRace.failureCode,
    statusConflictCode: statusRace.failureCode,
    finalStatus: finalOrder.status,
    driverAcceptedEventCount: acceptedEvents.length,
    driverStatusChangedEventCount: driverStatusEvents.length,
    idempotencyRecordCount: idempotencyRecordCountAfterReplay,
    replayStable: true,
  };
}

async function runOrderMutationConcurrencySmoke(
  prisma,
  {
    databaseUrl,
    env = process.env,
    fetchImpl = fetch,
    createIdempotencyKey = randomUUID,
    ensureApprovedDrivers = defaultEnsureApprovedDrivers,
    createOrderRequest = createOrderMutationSmokeOrderRequest,
    buildApi = buildApiForSmoke,
    startApiServer = startApiServerProcess,
    stopApiServer = stopApiServerProcess,
    waitForApiServer = waitForApiServerReady,
  } = {},
) {
  if (!databaseUrl) {
    throw new Error(
      'databaseUrl is required for order-mutation-concurrency-smoke',
    );
  }

  const apiRoot = path.join(__dirname, '..');
  const buildOutputRoot = buildApi(apiRoot);
  const port = await allocateEphemeralPort();
  const smokeEnv = createSmokeApiEnv(env, databaseUrl, port);
  const serverController = startApiServer(
    apiRoot,
    smokeEnv,
    undefined,
    buildOutputRoot,
  );
  const apiClient = createOrderMutationSmokeApiClient(
    `http://127.0.0.1:${port}`,
    fetchImpl,
  );

  try {
    await waitForApiServer(apiClient, serverController);
    return await runOrderMutationConcurrencyScenario(prisma, apiClient, {
      createIdempotencyKey,
      ensureApprovedDrivers,
      createOrderRequest,
    });
  } finally {
    await stopApiServer(serverController);
    cleanupSmokeBuildOutputRoot(apiRoot, buildOutputRoot);
  }
}

async function runOrderCouponAtomicityScenario(
  prisma,
  apiClient,
  {
    now = () => new Date(),
    createIdempotencyKey = randomUUID,
    createCouponId = randomUUID,
    ensureApprovedDriverForCompletion =
      defaultEnsureApprovedDriverForAtomicity,
  } = {},
) {
  if (
    !prisma.shipperCoupon?.create ||
    !prisma.shipperCoupon?.findUnique ||
    !prisma.order?.count ||
    !prisma.orderEvent?.count ||
    !prisma.orderIdempotencyRecord?.count
  ) {
    throw new Error('Prisma order coupon atomicity clients are required');
  }

  await resetSmokeVerificationCodes(prisma, [
    STAGE_1_ATOMICITY_SHIPPER_PHONE,
    STAGE_1_ATOMICITY_DRIVER_PHONE,
  ]);
  const scenarioNow = now();
  const shipper = await apiClient.loginWithCode(
    STAGE_1_ATOMICITY_SHIPPER_PHONE,
    'shipper',
    `stage1-order-coupon-atomicity-${createIdempotencyKey()}`,
  );
  const driver = await apiClient.loginWithCode(
    STAGE_1_ATOMICITY_DRIVER_PHONE,
    'driver',
    `stage1-order-coupon-driver-${createIdempotencyKey()}`,
  );
  const shipperId = shipper.user.id;
  const accessToken = shipper.tokens.accessToken;

  await ensureApprovedDriverForCompletion(prisma, driver);

  const coupons = [];

  for (const label of [
    'race',
    'exchange-a',
    'exchange-b',
    'cancellation',
    'completion',
    'late-failure',
  ]) {
    coupons.push(
      await createOrderCouponAtomicityCoupon(
        prisma,
        shipperId,
        scenarioNow,
        label,
        createCouponId(),
      ),
    );
  }

  const replayKey = createIdempotencyKey();
  const replayRequest = createOrderCouponAtomicityRequest(
    scenarioNow,
    'same-key-replay',
  );
  const replayResults = await Promise.allSettled([
    apiClient.createShipperOrder(accessToken, replayRequest, replayKey),
    apiClient.createShipperOrder(accessToken, replayRequest, replayKey),
  ]);

  assert.deepEqual(
    replayResults.map(result => result.status),
    ['fulfilled', 'fulfilled'],
    'same-key replay should fulfill both requests',
  );
  const replayOrders = replayResults.map(result => result.value);
  assert.equal(
    replayOrders[0].id,
    replayOrders[1].id,
    'same-key replay should return the same order',
  );
  await assertAtomicityCount(
    prisma.order.count({ where: { id: replayOrders[0].id } }),
    1,
    'same-key replay order',
  );
  await assertAtomicityCount(
    prisma.orderEvent.count({
      where: { orderId: replayOrders[0].id, eventType: 'created' },
    }),
    1,
    'same-key replay created event',
  );
  await assertAtomicityCount(
    countOrderCreateReservations(prisma, shipperId, replayKey),
    1,
    'same-key replay reservation',
  );

  const beforeReuse = await countShipperOrderRows(prisma, shipperId);
  await expectAtomicityApiFailure(
    apiClient.createShipperOrder(
      accessToken,
      { ...replayRequest, quantityText: '13 箱' },
      replayKey,
    ),
    'IDEMPOTENCY_KEY_REUSED',
    'different-body key reuse',
  );
  const afterReuse = await countShipperOrderRows(prisma, shipperId);
  assert.deepEqual(
    afterReuse,
    beforeReuse,
    'different-body key reuse should not persist rows',
  );
  await assertAtomicityCount(
    countOrderCreateReservations(prisma, shipperId, replayKey),
    1,
    'different-body key reuse reservation',
  );

  const raceCoupon = coupons[0];
  const raceRequest = createOrderCouponAtomicityRequest(
    scenarioNow,
    'same-coupon-race',
    raceCoupon,
  );
  const raceKeys = [createIdempotencyKey(), createIdempotencyKey()];
  const raceResults = await Promise.allSettled([
    apiClient.createShipperOrder(accessToken, raceRequest, raceKeys[0]),
    apiClient.createShipperOrder(accessToken, raceRequest, raceKeys[1]),
  ]);
  const race = summarizeConcurrentMutationResults(
    raceResults,
    'PROFILE_COUPON_NOT_AVAILABLE',
    'same coupon create race',
  );
  const raceWinnerKey = raceKeys[race.successIndex];
  const raceLoserKey = raceKeys[race.failureIndex];

  await assertAtomicityCount(
    prisma.order.count({ where: { couponId: raceCoupon.id } }),
    1,
    'same-coupon race order',
  );
  await assertAtomicityCount(
    prisma.orderEvent.count({
      where: { orderId: race.order.id, eventType: 'created' },
    }),
    1,
    'same-coupon race created event',
  );
  await assertAtomicityCount(
    countOrderCreateReservations(prisma, shipperId, raceWinnerKey),
    1,
    'same-coupon race winner reservation',
  );
  await assertAtomicityCount(
    countOrderCreateReservations(prisma, shipperId, raceLoserKey),
    0,
    'same-coupon race loser reservation',
  );
  await assertCouponState(prisma, raceCoupon.id, {
    status: 'locked',
    lockedOrderNo: race.order.orderNo,
  });

  const exchangeCouponA = coupons[1];
  const exchangeCouponB = coupons[2];
  const exchangeCreateRequest = createOrderCouponAtomicityRequest(
    scenarioNow,
    'coupon-exchange',
    exchangeCouponA,
  );
  const exchangeOrder = await apiClient.createShipperOrder(
    accessToken,
    exchangeCreateRequest,
    createIdempotencyKey(),
  );
  const exchangeResult = await apiClient.updateShipperOrder(
    accessToken,
    exchangeOrder.id,
    createIdempotencyKey(),
    {
      ...exchangeCreateRequest,
      ...createOrderCouponPricing(exchangeCouponB, exchangeCreateRequest),
      baseUpdatedAtIso: exchangeOrder.updatedAtIso,
    },
  );

  assert.equal(exchangeResult.id, exchangeOrder.id);
  await assertCouponReleased(prisma, exchangeCouponA.id);
  await assertCouponState(prisma, exchangeCouponB.id, {
    status: 'locked',
    lockedOrderNo: exchangeOrder.orderNo,
  });
  await assertAtomicityCount(
    prisma.order.count({ where: { couponId: exchangeCouponB.id } }),
    1,
    'coupon exchange order',
  );
  await assertAtomicityCount(
    prisma.orderEvent.count({
      where: { orderId: exchangeOrder.id, eventType: 'updated' },
    }),
    1,
    'coupon exchange updated event',
  );

  const cancellationCoupon = coupons[3];
  const cancellationRequest = createOrderCouponAtomicityRequest(
    scenarioNow,
    'coupon-cancellation',
    cancellationCoupon,
  );
  const cancellationOrder = await apiClient.createShipperOrder(
    accessToken,
    cancellationRequest,
    createIdempotencyKey(),
  );
  const cancelledOrder = await apiClient.cancelShipperOrder(
    accessToken,
    cancellationOrder.id,
    createIdempotencyKey(),
    {
      baseUpdatedAtIso: cancellationOrder.updatedAtIso,
      reasonText: '原子性 smoke 取消',
    },
  );

  assert.equal(cancelledOrder.status, 'cancelled');
  await assertCouponReleased(prisma, cancellationCoupon.id);
  await assertAtomicityCount(
    prisma.orderEvent.count({
      where: { orderId: cancellationOrder.id, eventType: 'cancelled' },
    }),
    1,
    'coupon cancellation event',
  );

  const completionCoupon = coupons[4];
  const completionOrder = await apiClient.createShipperOrder(
    accessToken,
    createOrderCouponAtomicityRequest(
      scenarioNow,
      'coupon-completion',
      completionCoupon,
    ),
    createIdempotencyKey(),
  );
  let advancingOrder = await apiClient.acceptDriverOrder(
    driver.tokens.accessToken,
    completionOrder.id,
    createIdempotencyKey(),
    {
      baseUpdatedAtIso: completionOrder.updatedAtIso,
      noteText: '原子性 smoke 司机接单',
    },
  );
  assert.equal(advancingOrder.status, 'loading');

  for (const nextStatus of ['transporting', 'confirming']) {
    advancingOrder = await apiClient.advanceDriverOrderStatus(
      driver.tokens.accessToken,
      completionOrder.id,
      createIdempotencyKey(),
      {
        baseUpdatedAtIso: advancingOrder.updatedAtIso,
        nextStatus,
      },
    );
    assert.equal(advancingOrder.status, nextStatus);
  }

  const completedOrder = await apiClient.completeShipperOrder(
    accessToken,
    completionOrder.id,
    createIdempotencyKey(),
    { baseUpdatedAtIso: advancingOrder.updatedAtIso },
  );
  assert.equal(completedOrder.status, 'completed');
  await assertCouponState(prisma, completionCoupon.id, {
    status: 'used',
    usedOrderNo: completionOrder.orderNo,
  });
  await assertAtomicityCount(
    prisma.orderEvent.count({
      where: { orderId: completionOrder.id, eventType: 'completed' },
    }),
    1,
    'coupon completion event',
  );

  const lateFailureCoupon = coupons[5];
  const lateFailureKey = createIdempotencyKey();
  const lateFailureRequest = createOrderCouponAtomicityRequest(
    scenarioNow,
    'late-failure-rollback',
    lateFailureCoupon,
  );
  const lateFailureBaseline = await countCouponCreateRows(
    prisma,
    lateFailureCoupon.id,
  );
  let lateFailure;

  try {
    await withOrderCouponLateFailureTrigger(
      prisma,
      lateFailureKey,
      async () => {
        await apiClient.createShipperOrder(
          accessToken,
          lateFailureRequest,
          lateFailureKey,
        );
      },
    );
  } catch (error) {
    lateFailure = error;
  }

  assert.ok(lateFailure, 'late-failure trigger should reject order creation');
  assert.deepEqual(
    await countCouponCreateRows(prisma, lateFailureCoupon.id),
    lateFailureBaseline,
    'late failure should roll back order and created event rows',
  );
  await assertAtomicityCount(
    countOrderCreateReservations(prisma, shipperId, lateFailureKey),
    0,
    'late-failure reservation',
  );
  await assertCouponReleased(prisma, lateFailureCoupon.id);

  return {
    sameKeyReplay: 'PASS',
    differentBodyKeyReuse: 'PASS',
    sameCouponSingleWinner: 'PASS',
    couponExchange: 'PASS',
    couponCancellationRelease: 'PASS',
    couponCompletionRedeem: 'PASS',
    lateFailureRollback: 'PASS',
  };
}

async function runOrderCouponAtomicitySmoke(
  prisma,
  {
    databaseUrl,
    env = process.env,
    fetchImpl = fetch,
    createIdempotencyKey = randomUUID,
    createCouponId = randomUUID,
    now = () => new Date(),
    buildApi = buildApiForSmoke,
    startApiServer = startApiServerProcess,
    stopApiServer = stopApiServerProcess,
    waitForApiServer = waitForApiServerReady,
  } = {},
) {
  if (!databaseUrl) {
    throw new Error('databaseUrl is required for order-coupon-atomicity-smoke');
  }

  const apiRoot = path.join(__dirname, '..');
  const buildOutputRoot = buildApi(apiRoot);
  const port = await allocateEphemeralPort();
  const smokeEnv = createSmokeApiEnv(env, databaseUrl, port);
  const serverController = startApiServer(
    apiRoot,
    smokeEnv,
    undefined,
    buildOutputRoot,
  );
  const apiClient = createOrderMutationSmokeApiClient(
    `http://127.0.0.1:${port}`,
    fetchImpl,
  );

  try {
    await waitForApiServer(apiClient, serverController);
    return await runOrderCouponAtomicityScenario(prisma, apiClient, {
      createIdempotencyKey,
      createCouponId,
      now,
    });
  } finally {
    await stopApiServer(serverController);
    cleanupSmokeBuildOutputRoot(apiRoot, buildOutputRoot);
  }
}

async function withOrderCouponLateFailureTrigger(
  prisma,
  idempotencyKey,
  callback,
) {
  if (!prisma.$executeRawUnsafe) {
    throw new Error('Prisma raw SQL client is required');
  }

  const suffix = String(idempotencyKey)
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-20);
  const functionName = `order_coupon_late_failure_fn_${suffix}`;
  const triggerName = `order_coupon_late_failure_trg_${suffix}`;
  const keyLiteral = String(idempotencyKey).replace(/'/g, "''");
  let result;
  let primaryError;

  try {
    await prisma.$executeRawUnsafe(`
CREATE FUNCTION "${functionName}"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'order coupon atomicity late failure';
END;
$$;
`);
    await prisma.$executeRawUnsafe(`
CREATE TRIGGER "${triggerName}"
BEFORE UPDATE OF "responseSnapshot"
ON "OrderIdempotencyRecord"
FOR EACH ROW
WHEN (NEW."idempotencyKey" = '${keyLiteral}')
EXECUTE FUNCTION "${functionName}"();
`);
    result = await callback();
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors = [];

  try {
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${triggerName}" ON "OrderIdempotencyRecord";`,
    );
  } catch (error) {
    cleanupErrors.push(error);
  }

  try {
    await prisma.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${functionName}"();`,
    );
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (primaryError) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [primaryError, ...cleanupErrors],
        primaryError instanceof Error
          ? primaryError.message
          : 'Order coupon late-failure callback failed',
      );
    }

    throw primaryError;
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      'Failed to clean up order coupon late-failure trigger',
    );
  }

  return result;
}

async function createOrderCouponAtomicityCoupon(
  prisma,
  shipperId,
  now,
  label,
  couponId,
) {
  return prisma.shipperCoupon.create({
    data: {
      id: couponId,
      shipperId,
      title: `原子性 smoke ${label}`,
      status: 'usable',
      conditionText: '满 50 元可用',
      discountCents: 1200,
      minOrderAmountCents: 5000,
      validFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      validUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      sourceText: 'order-coupon-atomicity-smoke',
      issuedAt: now,
      lockedOrderNo: null,
      lockedAt: null,
      usedOrderNo: null,
      usedAt: null,
    },
  });
}

function createOrderCouponAtomicityRequest(now, label, coupon) {
  const request = {
    ...createOrderMutationSmokeOrderRequest(now),
    cargoDescription: `order-coupon-atomicity-smoke:${label}`,
  };

  return coupon
    ? { ...request, ...createOrderCouponPricing(coupon, request) }
    : request;
}

function createOrderCouponPricing(coupon, request) {
  return {
    couponId: coupon.id,
    couponTitle: coupon.title,
    couponDiscountCents: coupon.discountCents,
    payablePriceCents: request.priceCents - coupon.discountCents,
  };
}

function countOrderCreateReservations(prisma, shipperId, idempotencyKey) {
  return prisma.orderIdempotencyRecord.count({
    where: {
      actorUserId: shipperId,
      operation: 'shipper_create',
      idempotencyKey,
    },
  });
}

async function countShipperOrderRows(prisma, shipperId) {
  const [orders, createdEvents] = await Promise.all([
    prisma.order.count({ where: { shipperId } }),
    prisma.orderEvent.count({
      where: {
        eventType: 'created',
        order: { shipperId },
      },
    }),
  ]);

  return { orders, createdEvents };
}

async function countCouponCreateRows(prisma, couponId) {
  const [orders, createdEvents] = await Promise.all([
    prisma.order.count({ where: { couponId } }),
    prisma.orderEvent.count({
      where: {
        eventType: 'created',
        order: { couponId },
      },
    }),
  ]);

  return { orders, createdEvents };
}

async function assertAtomicityCount(countPromise, expected, label) {
  assert.equal(await countPromise, expected, `${label} count mismatch`);
}

async function expectAtomicityApiFailure(promise, expectedCode, label) {
  try {
    await promise;
  } catch (error) {
    assert.equal(
      error?.code,
      expectedCode,
      `${label} returned an unexpected error code`,
    );
    return error;
  }

  throw new Error(`${label} should have failed with ${expectedCode}`);
}

async function assertCouponState(prisma, couponId, expected) {
  const coupon = await prisma.shipperCoupon.findUnique({
    where: { id: couponId },
  });

  assert.ok(coupon, `Coupon not found after atomicity scenario: ${couponId}`);

  for (const [field, value] of Object.entries(expected)) {
    assert.equal(coupon[field], value, `Coupon ${couponId} ${field} mismatch`);
  }

  return coupon;
}

async function assertCouponReleased(prisma, couponId) {
  const coupon = await assertCouponState(prisma, couponId, {
    status: 'usable',
    lockedOrderNo: null,
    lockedAt: null,
    usedOrderNo: null,
    usedAt: null,
  });

  return coupon;
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
    command !== 'driver-certification-smoke' &&
    command !== 'order-mutation-concurrency-smoke' &&
    command !== 'order-coupon-atomicity-smoke'
  ) {
    throw new Error(
      'Usage: node scripts/seed-stage-1.js <seed|auth-smoke|order-smoke|driver-certification-smoke|order-mutation-concurrency-smoke|order-coupon-atomicity-smoke> [--test]',
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
    const result = await runCommand(command, prisma, {
      databaseUrl,
      env,
    });
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

function runCommand(command, prisma, options) {
  if (command === 'seed') {
    return seedStage1Database(prisma);
  }

  if (command === 'auth-smoke') {
    return runAuthSmoke(prisma);
  }

  if (command === 'order-smoke') {
    return runOrderSmoke(prisma);
  }

  if (command === 'order-mutation-concurrency-smoke') {
    return runOrderMutationConcurrencySmoke(prisma, options);
  }

  if (command === 'order-coupon-atomicity-smoke') {
    return runOrderCouponAtomicitySmoke(prisma, options);
  }

  if (command === 'driver-certification-smoke') {
    return runDriverCertificationSmoke(prisma);
  }

  throw new Error(`Unknown seed-stage-1 command: ${command}`);
}

async function resetSmokeVerificationCodes(prisma, phones) {
  if (!prisma.verificationCode?.deleteMany) {
    return;
  }

  await prisma.verificationCode.deleteMany({
    where: {
      phone: {
        in: phones,
      },
    },
  });
}

async function defaultEnsureApprovedDrivers(prisma, { driverA, driverB }) {
  await Promise.all([
    ensureApprovedDriver(
      prisma,
      driverA.user.id,
      driverA.user.phone,
      'concurrency-driver-a',
    ),
    ensureApprovedDriver(
      prisma,
      driverB.user.id,
      driverB.user.phone,
      'concurrency-driver-b',
    ),
  ]);
}

async function defaultEnsureApprovedDriverForAtomicity(prisma, driver) {
  await ensureApprovedDriver(
    prisma,
    driver.user.id,
    driver.user.phone,
    'order-coupon-atomicity-driver',
  );
}

async function ensureApprovedDriver(prisma, driverId, driverPhone, label) {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const [identityFrontFile, identityBackFile, drivingLicenseFile, vehiclePhotoFile] =
    await Promise.all(
      ['identity-front', 'identity-back', 'driving-license', 'vehicle-photo'].map(
        key =>
          prisma.fileObject.create({
            data: {
              ownerUserId: driverId,
              purpose: 'identity',
              contentType: 'image/png',
              byteSize: 2048,
              objectKey: `${driverId}/identity/${label}-${key}-${suffix}.png`,
              publicUrl: `https://cdn.example.com/${driverId}/identity/${label}-${key}-${suffix}.png`,
              status: 'uploaded',
            },
          }),
      ),
    );

  await Promise.all([
    prisma.driverIdentityCertification.upsert({
      where: {
        driverId,
      },
      create: {
        driverId,
        realName: `${label} 司机`,
        identityNumber: '110101199003071234',
        identityFrontFileId: identityFrontFile.id,
        identityBackFileId: identityBackFile.id,
        status: 'approved',
        rejectionReason: null,
      },
      update: {
        realName: `${label} 司机`,
        identityNumber: '110101199003071234',
        identityFrontFileId: identityFrontFile.id,
        identityBackFileId: identityBackFile.id,
        status: 'approved',
        rejectionReason: null,
      },
    }),
    prisma.driverVehicleCertification.upsert({
      where: {
        driverId,
      },
      create: {
        driverId,
        plateNumber: '粤B12345',
        vehicleType: 'medium',
        vehicleLengthText: '6.8 米',
        loadCapacityText: '8 吨',
        hasTailboard: true,
        drivingLicenseFileId: drivingLicenseFile.id,
        driverLicenseFileId: null,
        transportQualificationFileId: null,
        operationPermitFileId: null,
        vehiclePhotoFileId: vehiclePhotoFile.id,
        status: 'approved',
        rejectionReason: null,
      },
      update: {
        plateNumber: '粤B12345',
        vehicleType: 'medium',
        vehicleLengthText: '6.8 米',
        loadCapacityText: '8 吨',
        hasTailboard: true,
        drivingLicenseFileId: drivingLicenseFile.id,
        driverLicenseFileId: null,
        transportQualificationFileId: null,
        operationPermitFileId: null,
        vehiclePhotoFileId: vehiclePhotoFile.id,
        status: 'approved',
        rejectionReason: null,
      },
    }),
    prisma.driverAcceptanceSettings.upsert({
      where: {
        driverId,
      },
      create: {
        driverId,
        isOnline: true,
        maxDistanceKm: 50,
        vehicleTypePreferences: ['medium'],
      },
      update: {
        isOnline: true,
        maxDistanceKm: 50,
        vehicleTypePreferences: ['medium'],
      },
    }),
  ]);

  return {
    driverId,
    driverPhone,
  };
}

function createOrderMutationSmokeOrderRequest(now = new Date()) {
  return {
    cargoType: 'building_material',
    weightText: '2.5 吨',
    quantityText: '12 箱',
    pickupAddress: '宝安区福永物流园',
    pickupContact: '赵经理',
    pickupPhone: '13900139001',
    deliveryAddress: '南山区科技园',
    deliveryContact: '钱店长',
    deliveryPhone: '13900139002',
    vehicleRequirement: 'medium',
    needTailboard: false,
    needTarp: false,
    pickupTimeIso: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    pricingMode: 'fixed',
    priceCents: 76000,
    paymentMethod: 'cod',
  };
}

function summarizeConcurrentMutationResults(
  results,
  expectedFailureCode,
  label,
) {
  const successes = [];
  const failures = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successes.push({
        index,
        value: result.value,
      });
      return;
    }

    failures.push({
      index,
      reason: result.reason,
    });
  });

  if (successes.length !== 1 || failures.length !== 1) {
    throw new Error(
      `${label} expected exactly one success and one failure, received ${successes.length} success and ${failures.length} failure`,
    );
  }

  const failureCode = failures[0].reason?.code;

  if (failureCode !== expectedFailureCode) {
    throw new Error(
      `${label} expected losing request code ${expectedFailureCode}, received ${failureCode ?? 'unknown'}`,
    );
  }

  return {
    successIndex: successes[0].index,
    order: successes[0].value,
    failureIndex: failures[0].index,
    failureCode,
  };
}

function createOrderMutationSmokeApiClient(baseUrl, fetchImpl = fetch) {
  return {
    async ping() {
      const response = await fetchImpl(`${baseUrl}/api/me`, {
        method: 'GET',
      });

      return response.status > 0;
    },
    async loginWithCode(phone, userType, deviceId) {
      const sendCodeResult = await requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        '/api/auth/send-code',
        {
          body: {
            phone,
            purpose: 'login',
          },
        },
      );
      const code = sendCodeResult.devCode || '123456';

      return requestApi(fetchImpl, baseUrl, 'POST', '/api/auth/login', {
        body: {
          phone,
          code,
          userType,
          deviceId,
        },
      });
    },
    createShipperOrder(accessToken, body, idempotencyKey) {
      return requestApi(fetchImpl, baseUrl, 'POST', '/api/shipper/orders', {
        accessToken,
        idempotencyKey,
        body,
      });
    },
    updateShipperOrder(accessToken, orderId, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'PUT',
        `/api/shipper/orders/${orderId}`,
        { accessToken, idempotencyKey, body },
      );
    },
    cancelShipperOrder(accessToken, orderId, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        `/api/shipper/orders/${orderId}/cancel`,
        { accessToken, idempotencyKey, body },
      );
    },
    advanceShipperOrderStatus(accessToken, orderId, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        `/api/shipper/orders/${orderId}/status`,
        { accessToken, idempotencyKey, body },
      );
    },
    completeShipperOrder(accessToken, orderId, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        `/api/shipper/orders/${orderId}/complete`,
        { accessToken, idempotencyKey, body },
      );
    },
    getShipperOrder(accessToken, orderId) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'GET',
        `/api/shipper/orders/${orderId}`,
        {
          accessToken,
        },
      );
    },
    acceptDriverOrder(accessToken, orderId, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        `/api/driver/orders/${orderId}/accept`,
        {
          accessToken,
          idempotencyKey,
          body,
        },
      );
    },
    advanceDriverOrderStatus(accessToken, orderId, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        `/api/driver/orders/${orderId}/status`,
        {
          accessToken,
          idempotencyKey,
          body,
        },
      );
    },
  };
}

async function requestApi(
  fetchImpl,
  baseUrl,
  method,
  pathname,
  {
    accessToken,
    idempotencyKey,
    body,
    requestId = `smoke-${randomUUID()}`,
  } = {},
) {
  const headers = {
    'x-request-id': requestId,
  };

  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const response = await fetchImpl(`${baseUrl}${pathname}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseBody = await parseJsonSafely(response);

  if (!response.ok) {
    throw createApiError(response.status, responseBody);
  }

  if (
    !responseBody ||
    responseBody.code !== 'OK' ||
    !Object.prototype.hasOwnProperty.call(responseBody, 'data')
  ) {
    throw new Error(`Unexpected API success envelope from ${pathname}`);
  }

  return responseBody.data;
}

async function parseJsonSafely(response) {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}

function createApiError(status, payload) {
  const error = new Error(payload?.message || `HTTP ${status}`);

  error.status = status;
  error.code = payload?.code || `HTTP_${status}`;
  error.payload = payload;

  return error;
}

function createSmokeBuildOutputRoot(apiRoot) {
  return path.join(
    apiRoot,
    '.smoke-build',
    `${Date.now()}-${randomUUID().slice(0, 8)}`,
  );
}

function resolveBuiltApiRoot(apiRoot, buildOutputRoot) {
  if (!buildOutputRoot) {
    return path.join(apiRoot, 'dist');
  }

  return path.isAbsolute(buildOutputRoot)
    ? buildOutputRoot
    : path.join(apiRoot, buildOutputRoot);
}

function cleanupSmokeBuildOutputRoot(apiRoot, buildOutputRoot) {
  if (!buildOutputRoot) {
    return;
  }

  const smokeBuildRoot = path.resolve(apiRoot, '.smoke-build');
  const resolvedBuildOutputRoot = path.resolve(buildOutputRoot);
  const relativePath = path.relative(smokeBuildRoot, resolvedBuildOutputRoot);

  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    return;
  }

  rmSync(resolvedBuildOutputRoot, {
    recursive: true,
    force: true,
  });
}

function buildApiForSmoke(
  apiRoot,
  spawnSyncImpl = spawnSync,
  platform = process.platform,
  buildOutputRoot = createSmokeBuildOutputRoot(apiRoot),
) {
  const relativeBuildOutputRoot =
    path.relative(apiRoot, buildOutputRoot).replace(/\\/g, '/') || '.';
  const result = spawnSyncImpl(
    process.execPath,
    [
      require.resolve('typescript/bin/tsc'),
      '-p',
      'tsconfig.json',
      '--outDir',
      relativeBuildOutputRoot,
    ],
    {
      cwd: apiRoot,
      env: process.env,
      shell: false,
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0) {
    throw new Error(`API build failed with exit code ${result.status ?? 1}`);
  }

  return buildOutputRoot;
}

function startApiServerProcess(
  apiRoot,
  env,
  spawnImpl = spawn,
  buildOutputRoot,
) {
  const builtApiRoot = resolveBuiltApiRoot(apiRoot, buildOutputRoot);
  const child = spawnImpl(process.execPath, [path.join(builtApiRoot, 'main.js')], {
    cwd: apiRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = [];
  const stderr = [];

  child.stdout?.on('data', chunk => {
    stdout.push(Buffer.from(chunk));
  });
  child.stderr?.on('data', chunk => {
    stderr.push(Buffer.from(chunk));
  });

  return {
    child,
    getLogs() {
      return Buffer.concat([...stdout, ...stderr]).toString('utf8');
    },
  };
}

function createSmokeApiEnv(env, databaseUrl, port) {
  return {
    ...env,
    NODE_ENV: 'development',
    PORT: String(port),
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET || 'replace-with-dev-access-secret',
    ACCESS_TOKEN_TTL_SECONDS: env.ACCESS_TOKEN_TTL_SECONDS || '900',
    REFRESH_TOKEN_TTL_SECONDS: env.REFRESH_TOKEN_TTL_SECONDS || '604800',
    VERIFICATION_CODE_TTL_SECONDS:
      env.VERIFICATION_CODE_TTL_SECONDS || '300',
    ORDER_IDEMPOTENCY_TTL_SECONDS:
      env.ORDER_IDEMPOTENCY_TTL_SECONDS || '86400',
    FILE_STORAGE_PROVIDER: env.FILE_STORAGE_PROVIDER || 'local',
  };
}

async function allocateEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close(() => {
          reject(new Error('Failed to allocate ephemeral port'));
        });
        return;
      }

      server.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function waitForApiServerReady(
  apiClient,
  serverController,
  timeoutMs = 30000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (hasChildProcessExited(serverController.child)) {
      throw new Error(
        `API smoke server exited early with code ${
          serverController.child.exitCode ?? serverController.child.signalCode
        }\n${serverController.getLogs()}`,
      );
    }

    try {
      if (await apiClient.ping()) {
        return;
      }
    } catch {
      // ignore startup race and retry
    }

    await delay(250);
  }

  throw new Error(
    `Timed out waiting for API smoke server readiness\n${serverController.getLogs()}`,
  );
}

async function stopApiServerProcess(serverController) {
  if (hasChildProcessExited(serverController.child)) {
    return;
  }

  serverController.child.kill();
  await Promise.race([
    new Promise(resolve => {
      serverController.child.once('exit', () => resolve(undefined));
    }),
    delay(5000),
  ]);
}

function hasChildProcessExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  STAGE_1_ADMIN_PHONE,
  STAGE_1_ADMIN_PASSWORD,
  STAGE_1_CONCURRENCY_DRIVER_A_PHONE,
  STAGE_1_CONCURRENCY_DRIVER_B_PHONE,
  STAGE_1_DRIVER_PHONE,
  STAGE_1_SHIPPER_PHONE,
  buildApiForSmoke,
  cleanupSmokeBuildOutputRoot,
  createOrderMutationSmokeApiClient,
  createOrderMutationSmokeOrderRequest,
  main,
  parseArgs,
  runCommand,
  runAuthSmoke,
  runDriverCertificationSmoke,
  runOrderCouponAtomicityScenario,
  runOrderCouponAtomicitySmoke,
  runOrderMutationConcurrencyScenario,
  runOrderMutationConcurrencySmoke,
  runOrderSmoke,
  seedStage1Database,
  summarizeConcurrentMutationResults,
  withOrderCouponLateFailureTrigger,
};
