import { ApiErrorCode, BusinessError } from '../common/errors';
import type { DriverCertificationRepository } from '../driver-certification/driver-certification.repository';
import { InMemoryFilesRepository } from '../files/files.repository';
import { InMemoryOrdersRepository } from '../orders/orders.repository';
import { InMemoryDriverAcceptanceSettingsRepository } from './driver-acceptance-settings.repository';
import { InMemoryDriverWithdrawalsRepository } from './driver-withdrawals.repository';
import { DriverOrdersService } from './driver-orders.service';

describe('DriverOrdersService', () => {
  const now = new Date('2026-07-06T08:00:00.000Z');

  function createService() {
    const repository = new InMemoryOrdersRepository(() => now);
    const certificationRepository = createDriverCertificationRepository({
      identityStatus: 'approved',
      vehicleStatus: 'approved',
    });
    const acceptanceSettingsRepository =
      new InMemoryDriverAcceptanceSettingsRepository(() => now);
    const filesRepository = new InMemoryFilesRepository(() => now);
    const driverWithdrawalsRepository = new InMemoryDriverWithdrawalsRepository(
      () => now,
    );

    return {
      acceptanceSettingsRepository,
      certificationRepository,
      driverWithdrawalsRepository,
      filesRepository,
      repository,
      service: new DriverOrdersService(
        repository,
        certificationRepository,
        acceptanceSettingsRepository,
        driverWithdrawalsRepository,
        filesRepository,
        () => now,
      ),
    };
  }

  it('rejects non-driver users from the driver order hall', async () => {
    const { service } = createService();

    await expect(
      service.listOrderHall(
        { id: 'shipper-1', phone: '13900139001', userType: 'shipper' },
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是司机'),
    );
  });

  it('lists waiting shipper orders for drivers', async () => {
    const { repository, service } = createService();
    const waitingOrder = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    const loadingOrder = await repository.createOrder(
      'shipper-1',
      createOrderInput('南山区科技园'),
    );
    await repository.advanceOrderStatus(loadingOrder.id, 'shipper-1', {
      nextStatus: 'loading',
    });

    await expect(
      service.listOrderHall(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        { page: 1, pageSize: 20 },
      ),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: waitingOrder.id })],
      total: 1,
    });
  });

  it('returns default driver acceptance settings before the first save', async () => {
    const { service } = createService();

    await expect(
      service.getAcceptanceSettings({
        id: 'driver-1',
        phone: '13900139009',
        userType: 'driver',
      }),
    ).resolves.toMatchObject({
      driverId: 'driver-1',
      isOnline: true,
      maxDistanceKm: 50,
      vehicleTypePreferences: [],
    });
  });

  it('saves current driver acceptance settings', async () => {
    const { service } = createService();

    await expect(
      service.saveAcceptanceSettings(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        {
          isOnline: false,
          maxDistanceKm: 30,
          vehicleTypePreferences: ['medium', 'box'],
        },
      ),
    ).resolves.toMatchObject({
      driverId: 'driver-1',
      isOnline: false,
      maxDistanceKm: 30,
      vehicleTypePreferences: ['medium', 'box'],
    });
  });

  it('submits a driver quote without changing the order status', async () => {
    const { repository, service } = createService();
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );

    const quotedOrder = await service.quoteOrder(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      order.id,
      {
        quoteCents: 88000,
        arrivalText: '45 分钟到达',
        noteText: '可带尾板',
      },
    );

    expect(quotedOrder).toMatchObject({
      id: order.id,
      status: 'waiting',
      events: [
        expect.objectContaining({ eventType: 'created' }),
        expect.objectContaining({
          actorUserId: 'driver-1',
          eventType: 'driver_quote_submitted',
        }),
      ],
    });
    expect(
      JSON.parse(quotedOrder.events[quotedOrder.events.length - 1].noteText ?? '{}'),
    ).toEqual({
      quoteCents: 88000,
      arrivalText: '45 分钟到达',
      noteText: '可带尾板',
      driverSnapshot: {
        driverId: 'driver-1',
        driverName: '李师傅',
        driverPhone: '13900139009',
        vehicleType: 'box',
        vehicleLengthText: '4.2 米',
        plateNumber: '粤B12345',
        completedOrderCount: 0,
      },
    });
  });

  it('rejects driver quotes when identity certification is not approved', async () => {
    const { repository } = createService();
    const acceptanceSettingsRepository =
      new InMemoryDriverAcceptanceSettingsRepository(() => now);
    const service = new DriverOrdersService(
      repository,
      createDriverCertificationRepository({
        identityStatus: 'reviewing',
        vehicleStatus: 'approved',
      }),
      acceptanceSettingsRepository,
      new InMemoryDriverWithdrawalsRepository(() => now),
      undefined,
      () => now,
    );
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );

    await expect(
      service.quoteOrder(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {
          quoteCents: 88000,
          arrivalText: '45 分钟到达',
          noteText: '可带尾板',
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.DRIVER_CERTIFICATION_REQUIRED,
        '司机实名和车辆认证通过后才能接单',
      ),
    );
  });

  it('rejects quoting when the driver is offline for order acceptance', async () => {
    const { acceptanceSettingsRepository, repository } = createService();
    await acceptanceSettingsRepository.saveAcceptanceSettings('driver-1', {
      isOnline: false,
      maxDistanceKm: 30,
      vehicleTypePreferences: ['medium'],
    });
    const service = new DriverOrdersService(
      repository,
      createDriverCertificationRepository({
        identityStatus: 'approved',
        vehicleStatus: 'approved',
      }),
      acceptanceSettingsRepository,
      new InMemoryDriverWithdrawalsRepository(() => now),
      undefined,
      () => now,
    );
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );

    await expect(
      service.quoteOrder(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {
          quoteCents: 88000,
          arrivalText: '45 分钟到达',
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.DRIVER_ACCEPTANCE_OFFLINE,
        '司机当前处于离线接单状态',
      ),
    );
  });

  it('accepts a waiting order and moves it to loading', async () => {
    const { repository, service } = createService();
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );

    const acceptedOrder = await service.acceptOrder(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      order.id,
      { noteText: '马上联系货主' },
    );

    expect(acceptedOrder).toMatchObject({
      id: order.id,
      status: 'loading',
      events: expect.arrayContaining([
        expect.objectContaining({
          actorUserId: 'driver-1',
          eventType: 'driver_accepted',
        }),
      ]),
    });
    expect(
      JSON.parse(
        acceptedOrder.events[acceptedOrder.events.length - 1].noteText ?? '{}',
      ),
    ).toEqual({
      noteText: '马上联系货主',
      driverSnapshot: {
        driverId: 'driver-1',
        driverName: '李师傅',
        driverPhone: '13900139009',
        vehicleType: 'box',
        vehicleLengthText: '4.2 米',
        plateNumber: '粤B12345',
        completedOrderCount: 0,
      },
    });
  });

  it('rejects accepting orders when vehicle certification is not approved', async () => {
    const { repository } = createService();
    const acceptanceSettingsRepository =
      new InMemoryDriverAcceptanceSettingsRepository(() => now);
    const service = new DriverOrdersService(
      repository,
      createDriverCertificationRepository({
        identityStatus: 'approved',
        vehicleStatus: 'unsubmitted',
      }),
      acceptanceSettingsRepository,
      new InMemoryDriverWithdrawalsRepository(() => now),
      undefined,
      () => now,
    );
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );

    await expect(
      service.acceptOrder(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        { noteText: '马上联系货主' },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.DRIVER_CERTIFICATION_REQUIRED,
        '司机实名和车辆认证通过后才能接单',
      ),
    );
  });

  it('rejects accepting a non-waiting order', async () => {
    const { repository, service } = createService();
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    await repository.advanceOrderStatus(order.id, 'shipper-1', {
      nextStatus: 'loading',
    });

    await expect(
      service.acceptOrder(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {},
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.ORDER_STATE_INVALID, '当前订单已不可接单'),
    );
  });

  it('lists only orders accepted by the current driver', async () => {
    const { repository, service } = createService();
    const ownOrder = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    const otherOrder = await repository.createOrder(
      'shipper-2',
      createOrderInput('南山区科技园'),
    );
    await repository.acceptDriverOrder(ownOrder.id, 'driver-1', {});
    await repository.acceptDriverOrder(otherOrder.id, 'driver-2', {});

    await expect(
      service.listMyOrders(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        {
          statuses: ['loading', 'transporting', 'confirming'],
          page: 1,
          pageSize: 20,
        },
      ),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: ownOrder.id })],
      total: 1,
    });
  });

  it('gets an accepted order detail for the current driver', async () => {
    const { repository, service } = createService();
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});

    await expect(
      service.getOrder(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
      ),
    ).resolves.toMatchObject({
      id: order.id,
      status: 'loading',
    });
  });

  it('rejects detail access for orders accepted by another driver', async () => {
    const { repository, service } = createService();
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-2', {});

    await expect(
      service.getOrder(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });

  it('replies to a shipper evaluation for the current driver accepted order', async () => {
    const { repository, service } = createService();
    const order = await createCompletedDriverOrder(
      repository,
      'driver-1',
      createOrderInput('宝安区福永物流园'),
    );
    await repository.submitOrderEvaluation(order.id, 'shipper-1', {
      rating: 5,
      tags: ['准时送达', '服务好'],
      content: '司机服务细致',
    });

    await expect(
      service.replyToEvaluation(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        { content: '谢谢认可，后续继续保持。' },
      ),
    ).resolves.toMatchObject({
      id: order.id,
      events: expect.arrayContaining([
        expect.objectContaining({
          actorUserId: 'driver-1',
          eventType: 'evaluation_replied',
          noteText: '谢谢认可，后续继续保持。',
        }),
      ]),
    });
  });

  it('rejects evaluation replies for orders not accepted by the current driver', async () => {
    const { repository, service } = createService();
    const order = await createCompletedDriverOrder(
      repository,
      'driver-2',
      createOrderInput('宝安区福永物流园'),
    );
    await repository.submitOrderEvaluation(order.id, 'shipper-1', {
      rating: 5,
      tags: ['准时送达'],
      content: '整体不错',
    });

    await expect(
      service.replyToEvaluation(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        { content: '谢谢认可。' },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });

  it('rejects evaluation replies before a shipper evaluation exists', async () => {
    const { repository, service } = createService();
    const order = await createCompletedDriverOrder(
      repository,
      'driver-1',
      createOrderInput('宝安区福永物流园'),
    );

    await expect(
      service.replyToEvaluation(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        { content: '谢谢认可。' },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.ORDER_STATE_INVALID, '订单尚未收到货主评价'),
    );
  });

  it('lets a driver evaluate the shipper after a completed accepted order', async () => {
    const { repository, service } = createService();
    const order = await createCompletedDriverOrder(
      repository,
      'driver-1',
      createOrderInput('宝安区福永物流园'),
    );

    await expect(
      service.evaluateShipper(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {
          rating: 5,
          tags: ['沟通顺畅', '装货配合'],
          content: '货主装货配合好，结算沟通清楚。',
          anonymous: true,
        },
      ),
    ).resolves.toMatchObject({
      id: order.id,
      events: expect.arrayContaining([
        expect.objectContaining({
          actorUserId: 'driver-1',
          eventType: 'shipper_evaluation_submitted',
          noteText: expect.stringContaining('5 星：沟通顺畅、装货配合'),
        }),
      ]),
    });
  });

  it('rejects driver shipper evaluations before order completion', async () => {
    const { repository, service } = createService();
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});

    await expect(
      service.evaluateShipper(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {
          rating: 5,
          tags: ['沟通顺畅'],
          content: '货主装货配合好，结算沟通清楚。',
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.ORDER_STATE_INVALID, '订单完成后才能评价货主'),
    );
  });

  it('rejects driver shipper evaluations for orders not accepted by the current driver', async () => {
    const { repository, service } = createService();
    const order = await createCompletedDriverOrder(
      repository,
      'driver-2',
      createOrderInput('宝安区福永物流园'),
    );

    await expect(
      service.evaluateShipper(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {
          rating: 5,
          tags: ['沟通顺畅'],
          content: '货主装货配合好，结算沟通清楚。',
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });

  it('advances a current driver order from loading to transporting', async () => {
    const { repository, service } = createService();
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});

    await expect(
      service.advanceOrderStatus(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        { nextStatus: 'transporting' },
      ),
    ).resolves.toMatchObject({
      id: order.id,
      status: 'transporting',
      events: expect.arrayContaining([
        expect.objectContaining({
          actorUserId: 'driver-1',
          eventType: 'driver_status_changed',
          noteText: '司机确认发车',
        }),
      ]),
    });
  });

  it('binds uploaded receipt files to driver status advance events', async () => {
    const { repository, service, filesRepository } = createService();
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    const receiptFile = await createUploadedFile(
      filesRepository,
      'driver-1',
      'receipt',
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});

    await expect(
      service.advanceOrderStatus(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {
          nextStatus: 'transporting',
          receiptPhotoFileIds: [receiptFile.id],
        },
      ),
    ).resolves.toMatchObject({
      status: 'transporting',
      events: expect.arrayContaining([
        expect.objectContaining({
          eventType: 'driver_status_changed',
          attachmentFileIds: [receiptFile.id],
        }),
      ]),
    });
  });

  it('rejects driver status advance proofs owned by another user', async () => {
    const { repository, service, filesRepository } = createService();
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    const receiptFile = await createUploadedFile(
      filesRepository,
      'driver-2',
      'receipt',
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});

    await expect(
      service.advanceOrderStatus(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {
          nextStatus: 'transporting',
          receiptPhotoFileIds: [receiptFile.id],
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '司机执行凭证不存在'),
    );
  });

  it('rejects invalid current driver order status transitions', async () => {
    const { repository, service } = createService();
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});

    await expect(
      service.advanceOrderStatus(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        { nextStatus: 'confirming' },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前司机订单状态不允许推进到目标状态',
      ),
    );
  });

  it('returns driver income overview with completed income, pending settlement and reviewing withdrawals', async () => {
    const { driverWithdrawalsRepository, repository, service } = createService();
    const completedOrder = await createCompletedDriverOrder(
      repository,
      'driver-1',
      createOrderInput('宝安区福永物流园'),
    );
    const pendingOrder = await repository.createOrder(
      'shipper-1',
      {
        ...createOrderInput('南山区科技园'),
        priceCents: 88000,
        payablePriceCents: 84000,
      },
    );
    await repository.acceptDriverOrder(pendingOrder.id, 'driver-1', {});
    await driverWithdrawalsRepository.createWithdrawal('driver-1', {
      amountCents: 12000,
      bankAccountName: '李师傅',
      bankName: '招商银行',
      bankAccountNo: '6225888800001234',
    });

    await expect(
      service.getIncomeOverview({
        id: 'driver-1',
        phone: '13900139009',
        userType: 'driver',
      }),
    ).resolves.toMatchObject({
      driverId: 'driver-1',
      summary: {
        todayIncomeCents: 72200,
        weekIncomeCents: 72200,
        monthIncomeCents: 72200,
        historyIncomeCents: 72200,
        pendingSettlementCents: 79800,
        availableWithdrawalCents: 60200,
        reviewingWithdrawalCents: 12000,
        completedOrderCount: 1,
      },
      records: [
        expect.objectContaining({
          orderId: completedOrder.id,
          grossAmountCents: 76000,
          platformFeeCents: 3800,
          netIncomeCents: 72200,
        }),
      ],
    });
  });

  it('creates a driver withdrawal when available balance is sufficient', async () => {
    const { repository, service } = createService();
    await createCompletedDriverOrder(
      repository,
      'driver-1',
      createOrderInput('宝安区福永物流园'),
    );

    await expect(
      service.createWithdrawal(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        {
          amountCents: 12000,
          bankAccountName: '李师傅',
          bankName: '招商银行',
          bankAccountNo: '6225888800001234',
        },
      ),
    ).resolves.toMatchObject({
      amountCents: 12000,
      bankAccountMasked: '**** **** **** 1234',
      status: 'reviewing',
    });
  });

  it('rejects driver withdrawals that exceed available balance', async () => {
    const { service } = createService();

    await expect(
      service.createWithdrawal(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        {
          amountCents: 12000,
          bankAccountName: '李师傅',
          bankName: '招商银行',
          bankAccountNo: '6225888800001234',
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.DRIVER_WITHDRAWAL_BALANCE_INSUFFICIENT,
        '可提现余额不足',
      ),
    );
  });

  it('rejects receipt proofs that are not yet uploaded', async () => {
    const { repository, service, filesRepository } = createService();
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    const pendingFile = await filesRepository.createPendingFile('driver-1', {
      purpose: 'receipt',
      fileName: 'receipt.png',
      contentType: 'image/png',
      byteSize: 2048,
      objectKey: 'driver-1/receipt/receipt.png',
    });
    await repository.acceptDriverOrder(order.id, 'driver-1', {});

    await expect(
      service.advanceOrderStatus(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        { nextStatus: 'transporting', receiptPhotoFileIds: [pendingFile.id] },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.FILE_STATE_INVALID,
        '司机执行凭证尚未上传完成',
      ),
    );
  });

  it('rejects receipt proofs whose purpose is not receipt', async () => {
    const { repository, service, filesRepository } = createService();
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    const cargoFile = await createUploadedFile(
      filesRepository,
      'driver-1',
      'cargo',
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});

    await expect(
      service.advanceOrderStatus(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        { nextStatus: 'transporting', receiptPhotoFileIds: [cargoFile.id] },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.FILE_PURPOSE_INVALID,
        '司机执行凭证用途不匹配',
      ),
    );
  });

  it('lists the current driver withdrawals with paging metadata', async () => {
    const { driverWithdrawalsRepository, service } = createService();
    await driverWithdrawalsRepository.createWithdrawal('driver-1', {
      amountCents: 5000,
      bankAccountName: '李师傅',
      bankName: '招商银行',
      bankAccountNo: '6225888800001234',
    });
    await driverWithdrawalsRepository.createWithdrawal('driver-2', {
      amountCents: 9000,
      bankAccountName: '王师傅',
      bankName: '建设银行',
      bankAccountNo: '6225888800009999',
    });

    await expect(
      service.listWithdrawals(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        { page: 1, pageSize: 20 },
      ),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ amountCents: 5000 })],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });

  it('rejects non-driver users from listing withdrawals', async () => {
    const { service } = createService();

    await expect(
      service.listWithdrawals(
        { id: 'shipper-1', phone: '13900139001', userType: 'shipper' },
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是司机'),
    );
  });

  it('derives negotiated completed-order income from the driver quote event', async () => {
    const { repository, service } = createService();
    const order = await repository.createOrder('shipper-1', {
      ...createOrderInput('宝安区福永物流园'),
      pricingMode: 'negotiable',
      priceCents: undefined,
      payablePriceCents: undefined,
    });
    await repository.submitDriverQuote(order.id, 'driver-1', {
      quoteCents: 90000,
      arrivalText: '30 分钟',
    });
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    await repository.advanceDriverOrderStatus(order.id, 'driver-1', {
      nextStatus: 'transporting',
    });
    await repository.advanceDriverOrderStatus(order.id, 'driver-1', {
      nextStatus: 'confirming',
    });
    await repository.completeOrder(order.id, 'shipper-1');

    const overview = await service.getIncomeOverview({
      id: 'driver-1',
      phone: '13900139009',
      userType: 'driver',
    });

    // 90000 gross → 95% net income.
    expect(overview.records[0]).toMatchObject({
      orderId: order.id,
      grossAmountCents: 90000,
      netIncomeCents: 85500,
      platformFeeCents: 4500,
    });
    expect(overview.summary.historyIncomeCents).toBe(85500);
  });

  it('treats a negotiated completed order without a quote as zero income', async () => {
    const { repository, service } = createService();
    const order = await repository.createOrder('shipper-1', {
      ...createOrderInput('宝安区福永物流园'),
      pricingMode: 'negotiable',
      priceCents: undefined,
      payablePriceCents: undefined,
    });
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    await repository.advanceDriverOrderStatus(order.id, 'driver-1', {
      nextStatus: 'transporting',
    });
    await repository.advanceDriverOrderStatus(order.id, 'driver-1', {
      nextStatus: 'confirming',
    });
    await repository.completeOrder(order.id, 'shipper-1');

    const overview = await service.getIncomeOverview({
      id: 'driver-1',
      phone: '13900139009',
      userType: 'driver',
    });

    expect(overview.records[0]).toMatchObject({
      orderId: order.id,
      grossAmountCents: 0,
      netIncomeCents: 0,
    });
  });

  it('rejects receipt proofs when no files repository is configured', async () => {
    const { repository } = createService();
    const service = new DriverOrdersService(
      repository,
      createDriverCertificationRepository({
        identityStatus: 'approved',
        vehicleStatus: 'approved',
      }),
      new InMemoryDriverAcceptanceSettingsRepository(() => now),
      new InMemoryDriverWithdrawalsRepository(() => now),
      undefined,
      () => now,
    );
    const order = await repository.createOrder(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});

    await expect(
      service.advanceOrderStatus(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        { nextStatus: 'transporting', receiptPhotoFileIds: ['file-x'] },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '司机执行凭证不存在'),
    );
  });
});

function createOrderInput(pickupAddress: string) {
  return {
    cargoType: 'build',
    weightText: '2.5 吨',
    quantityText: '12 箱',
    pickupAddress,
    pickupContact: '赵经理',
    pickupPhone: '13900139001',
    deliveryAddress: '龙岗区坂田仓',
    deliveryContact: '钱店长',
    deliveryPhone: '13900139002',
    vehicleRequirement: 'medium',
    needTailboard: false,
    needTarp: false,
    pickupTimeIso: '2026-07-07T02:00:00.000Z',
    pricingMode: 'fixed' as const,
    priceCents: 76000,
    paymentMethod: 'cod' as const,
  };
}

async function createCompletedDriverOrder(
  repository: InMemoryOrdersRepository,
  driverId: string,
  input: ReturnType<typeof createOrderInput>,
) {
  const order = await repository.createOrder('shipper-1', input);
  await repository.acceptDriverOrder(order.id, driverId, {});
  await repository.advanceDriverOrderStatus(order.id, driverId, {
    nextStatus: 'transporting',
  });
  await repository.advanceDriverOrderStatus(order.id, driverId, {
    nextStatus: 'confirming',
  });

  return repository.completeOrder(order.id, 'shipper-1');
}

async function createUploadedFile(
  filesRepository: InMemoryFilesRepository,
  ownerUserId: string,
  purpose: 'receipt' | 'cargo' = 'receipt',
) {
  const pendingFile = await filesRepository.createPendingFile(ownerUserId, {
    purpose,
    fileName: `${purpose}.png`,
    contentType: 'image/png',
    byteSize: 2048,
    objectKey: `${ownerUserId}/${purpose}/${purpose}.png`,
  });

  return filesRepository.markFileUploaded(pendingFile.id, ownerUserId, {});
}

function createDriverCertificationRepository({
  identityStatus,
  vehicleStatus,
  realName = '李师傅',
  phone = '13900139009',
  vehicleType = 'box',
  vehicleLengthText = '4.2 米',
  plateNumber = '粤B12345',
}: {
  identityStatus: 'unsubmitted' | 'reviewing' | 'approved' | 'rejected';
  vehicleStatus: 'unsubmitted' | 'reviewing' | 'approved' | 'rejected';
  realName?: string;
  phone?: string;
  vehicleType?: string;
  vehicleLengthText?: string;
  plateNumber?: string;
}): DriverCertificationRepository {
  return {
    async getCertification(driverId: string) {
      return {
        driver: {
          id: driverId,
          phone,
        },
        identity: {
          driverId,
          status: identityStatus,
          ...(identityStatus === 'approved' ? { realName } : {}),
        },
        vehicle: {
          driverId,
          status: vehicleStatus,
          ...(vehicleStatus === 'approved'
            ? {
                vehicleType,
                vehicleLengthText,
                plateNumber,
              }
            : {}),
        },
      };
    },
    async saveIdentity() {
      throw new Error('Not implemented in driver order tests');
    },
    async listCertifications() {
      throw new Error('Not implemented in driver order tests');
    },
    async listReviewEvents() {
      throw new Error('Not implemented in driver order tests');
    },
    async saveVehicle() {
      throw new Error('Not implemented in driver order tests');
    },
    async reviewIdentity() {
      throw new Error('Not implemented in driver order tests');
    },
    async reviewVehicle() {
      throw new Error('Not implemented in driver order tests');
    },
  };
}
