import { ApiErrorCode, BusinessError } from '../common/errors';
import type { DriverCertificationRepository } from '../driver-certification/driver-certification.repository';
import { InMemoryFilesRepository } from '../files/files.repository';
import { InMemoryOrdersRepository } from '../orders/orders.repository';
import { InMemoryProfileCouponsStore } from '../profile-coupons/profile-coupons.repository';
import { InMemoryDriverFinanceRepository } from '../payments/driver-finance.repository';
import { InMemoryFinancialStore } from '../payments/in-memory-financial.store';
import type { DriverLocationSnapshotRecord } from '../maps/dto';
import { InMemoryDriverAcceptanceSettingsRepository } from './driver-acceptance-settings.repository';
import { InMemoryDriverBankCardsRepository } from './driver-bank-cards.repository';
import {
  InMemoryDriverWithdrawalsRepository,
  PrismaDriverWithdrawalsRepository,
} from './driver-withdrawals.repository';
import { DriverOrdersService } from './driver-orders.service';

describe('DriverOrdersService', () => {
  it('requires an idempotency key and baseline for protected mutations', () => {
    const service = null as unknown as DriverOrdersService;
    const driver = {
      id: 'driver-1',
      phone: '13900139009',
      userType: 'driver' as const,
    };

    if (false) {
      // @ts-expect-error Legacy accept calls without an idempotency key are forbidden.
      service.acceptOrder(driver, 'order-1', {});
      // @ts-expect-error Protected accepts require baseUpdatedAtIso.
      service.acceptOrder(driver, 'order-1', 'key', {});
      // @ts-expect-error Legacy status calls without an idempotency key are forbidden.
      service.advanceOrderStatus(driver, 'order-1', {
        nextStatus: 'transporting',
      });
      // @ts-expect-error Protected status calls require baseUpdatedAtIso.
      service.advanceOrderStatus(driver, 'order-1', 'key', {
        nextStatus: 'transporting',
      });
      // @ts-expect-error Withdrawals require an idempotency key.
      service.createWithdrawal(driver, {
        amountCents: 100,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountNo: '6225888800001234',
      });
    }

    expect(service).toBeNull();
  });

  const now = new Date('2026-07-06T08:00:00.000Z');

  type DriverLocationLookup = {
    getDriverLocation(driverId: string): Promise<DriverLocationSnapshotRecord | null>;
  };

  function createService(options: { mapsService?: DriverLocationLookup } = {}) {
    const financialStore = new InMemoryFinancialStore();
    const repository = new InMemoryOrdersRepository(
      () => now,
      new InMemoryProfileCouponsStore(),
      financialStore,
    );
    const certificationRepository = createDriverCertificationRepository({
      identityStatus: 'approved',
      vehicleStatus: 'approved',
    });
    const acceptanceSettingsRepository =
      new InMemoryDriverAcceptanceSettingsRepository(() => now);
    const driverBankCardsRepository = new InMemoryDriverBankCardsRepository(
      () => now,
    );
    const filesRepository = new InMemoryFilesRepository(() => now);
    const driverWithdrawalsRepository = new InMemoryDriverWithdrawalsRepository(
      () => now,
    );
    const driverFinanceRepository = new InMemoryDriverFinanceRepository(
      financialStore,
      { now: () => now },
    );

    const notificationsService = {
      notifyOrderEvent: jest.fn().mockResolvedValue(undefined),
      notifyExceptionEvent: jest.fn().mockResolvedValue(undefined),
    };

    return {
      acceptanceSettingsRepository,
      driverBankCardsRepository,
      certificationRepository,
      driverFinanceRepository,
      driverWithdrawalsRepository,
      filesRepository,
      notificationsService,
      repository,
      service: new DriverOrdersService(
        repository,
        certificationRepository,
        acceptanceSettingsRepository,
        driverBankCardsRepository,
        driverWithdrawalsRepository,
        filesRepository,
        () => now,
        86400,
        driverFinanceRepository,
        notificationsService as never,
        options.mapsService,
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
    const waitingOrder = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    const loadingOrder = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('南山区科技园'),
    );
    await repository.acceptDriverOrder(loadingOrder.id, 'driver-2', {
      noteText: '先把订单接成 loading',
      driverSnapshot: {
        driverId: 'driver-2',
        driverName: '刘师傅',
        driverPhone: '13700137000',
        completedOrderCount: 1,
      },
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

  it('filters and sorts the order hall by the driver latest location and acceptance range', async () => {
    const mapsService = {
      getDriverLocation: jest.fn().mockResolvedValue({
        driverId: 'driver-1',
        latitude: 22.6,
        longitude: 113.9,
        source: 'device' as const,
        recordedAtIso: now.toISOString(),
        updatedAtIso: now.toISOString(),
      }),
    };
    const { acceptanceSettingsRepository, repository, service } = createService({
      mapsService,
    });
    await acceptanceSettingsRepository.saveAcceptanceSettings('driver-1', {
      isOnline: true,
      maxDistanceKm: 30,
      vehicleTypePreferences: ['medium'],
    });
    const farOrder = await repository.seedOrderForTest('shipper-1', {
      ...createOrderInput('惠州远郊仓'),
      pickupLatitude: 23.15,
      pickupLongitude: 114.4,
    });
    const nearOrder = await repository.seedOrderForTest('shipper-1', {
      ...createOrderInput('宝安区福永物流园'),
      pickupLatitude: 22.61,
      pickupLongitude: 113.91,
    });
    const unknownDistanceOrder = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('临时中转仓'),
    );

    const hall = await service.listOrderHall(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      { page: 1, pageSize: 20 },
    );

    expect(hall.items.map(order => order.id)).toEqual([
      nearOrder.id,
      unknownDistanceOrder.id,
    ]);
    expect(hall.items[0].pickupDistanceMeters).toEqual(expect.any(Number));
    expect(hall.items.some(order => order.id === farOrder.id)).toBe(false);
    expect(hall.total).toBe(2);
    expect(mapsService.getDriverLocation).toHaveBeenCalledWith('driver-1');
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
    const { notificationsService, repository, service } = createService();
    const order = await repository.seedOrderForTest(
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
    expect(notificationsService.notifyOrderEvent).toHaveBeenCalledWith({
      event: 'driver_quote_submitted',
      orderId: quotedOrder.id,
      orderNo: quotedOrder.orderNo,
      shipperId: 'shipper-1',
      driverId: 'driver-1',
      quoteCents: 88000,
      arrivalText: '45 分钟到达',
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
      new InMemoryDriverBankCardsRepository(() => now),
      new InMemoryDriverWithdrawalsRepository(() => now),
      undefined,
      () => now,
    );
    const order = await repository.seedOrderForTest(
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
      new InMemoryDriverBankCardsRepository(() => now),
      new InMemoryDriverWithdrawalsRepository(() => now),
      undefined,
      () => now,
    );
    const order = await repository.seedOrderForTest(
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
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );

    const acceptedOrder = await service.acceptOrder(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      order.id,
      'accept-key',
      { noteText: '马上联系货主', baseUpdatedAtIso: order.updatedAtIso },
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
      new InMemoryDriverBankCardsRepository(() => now),
      new InMemoryDriverWithdrawalsRepository(() => now),
      undefined,
      () => now,
    );
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );

    await expect(
      service.acceptOrder(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        'uncertified-accept-key',
        { noteText: '马上联系货主', baseUpdatedAtIso: order.updatedAtIso },
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
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-2', {
      noteText: '订单已被其他司机接走',
      driverSnapshot: {
        driverId: 'driver-2',
        driverName: '刘师傅',
        driverPhone: '13700137000',
        completedOrderCount: 1,
      },
    });

    await expect(
      service.acceptOrder(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        'invalid-accept-key',
        { baseUpdatedAtIso: order.updatedAtIso },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.ORDER_STATE_INVALID, '当前订单已不可接单'),
    );
  });

  it('lists only orders accepted by the current driver', async () => {
    const { repository, service } = createService();
    const ownOrder = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    const otherOrder = await repository.seedOrderForTest(
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
    const order = await repository.seedOrderForTest(
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
    const order = await repository.seedOrderForTest(
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

  it('reports an exception without changing the driver order status', async () => {
    const { repository, service, filesRepository } = createService();
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    const proof = await createUploadedFile(
      filesRepository,
      'driver-1',
      'exception',
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});

    await expect(
      service.reportException(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {
          typeLabel: '货物损坏',
          description: '装货时发现外包装已经破损。',
          photoCount: 1,
          photoFileIds: [proof.id],
        },
      ),
    ).resolves.toMatchObject({
      status: 'loading',
      events: expect.arrayContaining([
        expect.objectContaining({
          actorUserId: 'driver-1',
          eventType: 'driver_exception_reported',
          noteText: '货物损坏：装货时发现外包装已经破损。；图片凭证 1 张',
          attachmentFileIds: [proof.id],
        }),
      ]),
    });
    await expect(repository.listOrderExceptionCases(order.id)).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          orderId: order.id,
          orderNo: order.orderNo,
          reporterUserId: 'driver-1',
          sourceRole: 'driver',
          typeLabel: '货物损坏',
          status: 'pending',
          attachmentFileIds: [proof.id],
        }),
      ],
    });
  });

  it('rejects driver exceptions outside executing order states', async () => {
    const { repository, service } = createService();
    const order = await createCompletedDriverOrder(
      repository,
      'driver-1',
      createOrderInput('宝安区福永物流园'),
    );

    await expect(
      service.reportException(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {
          typeLabel: '货物损坏',
          description: '卸货后才发现外包装已经破损。',
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前司机订单状态不允许上报异常',
      ),
    );
  });

  it('rejects exception files owned by another user', async () => {
    const { repository, service, filesRepository } = createService();
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    const proof = await createUploadedFile(
      filesRepository,
      'driver-2',
      'exception',
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});

    await expect(
      service.reportException(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {
          typeLabel: '货物损坏',
          description: '装货时发现外包装已经破损。',
          photoFileIds: [proof.id],
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '异常图片不存在'),
    );
  });

  it('rejects pending and wrong-purpose exception files', async () => {
    const { repository, service, filesRepository } = createService();
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    const pendingFile = await filesRepository.createPendingFile('driver-1', {
      purpose: 'exception',
      fileName: 'exception.png',
      contentType: 'image/png',
      byteSize: 2048,
      objectKey: 'driver-1/exception/exception.png',
    });
    const wrongPurposeFile = await createUploadedFile(
      filesRepository,
      'driver-1',
      'receipt',
    );

    await expect(
      service.reportException(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {
          typeLabel: '货物损坏',
          description: '装货时发现外包装已经破损。',
          photoFileIds: [pendingFile.id],
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.FILE_STATE_INVALID,
        '异常图片尚未上传完成',
      ),
    );

    await expect(
      service.reportException(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {
          typeLabel: '货物损坏',
          description: '装货时发现外包装已经破损。',
          photoFileIds: [wrongPurposeFile.id],
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.FILE_PURPOSE_INVALID,
        '异常图片用途不匹配',
      ),
    );
  });

  it('lets a driver evaluate the shipper after a completed accepted order', async () => {
    const { repository, service, filesRepository } = createService();
    const order = await createCompletedDriverOrder(
      repository,
      'driver-1',
      createOrderInput('宝安区福永物流园'),
    );
    const proof = await createUploadedFile(
      filesRepository,
      'driver-1',
      'evaluation',
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
          photoCount: 1,
          photoFileIds: [proof.id],
        },
      ),
    ).resolves.toMatchObject({
      id: order.id,
      events: expect.arrayContaining([
        expect.objectContaining({
          actorUserId: 'driver-1',
          eventType: 'shipper_evaluation_submitted',
          noteText: expect.stringContaining('5 星：沟通顺畅、装货配合'),
          attachmentFileIds: [proof.id],
        }),
      ]),
    });
  });

  it('rejects pending and wrong-purpose shipper evaluation files', async () => {
    const { repository, service, filesRepository } = createService();
    const order = await createCompletedDriverOrder(
      repository,
      'driver-1',
      createOrderInput('宝安区福永物流园'),
    );
    const pendingFile = await filesRepository.createPendingFile('driver-1', {
      purpose: 'evaluation',
      fileName: 'evaluation.png',
      contentType: 'image/png',
      byteSize: 2048,
      objectKey: 'driver-1/evaluation/evaluation.png',
    });
    const wrongPurposeFile = await createUploadedFile(
      filesRepository,
      'driver-1',
      'exception',
    );

    await expect(
      service.evaluateShipper(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {
          rating: 5,
          tags: ['沟通顺畅'],
          content: '货主装货配合好，结算沟通清楚。',
          photoFileIds: [pendingFile.id],
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.FILE_STATE_INVALID,
        '货主评价图片尚未上传完成',
      ),
    );

    await expect(
      service.evaluateShipper(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        {
          rating: 5,
          tags: ['沟通顺畅'],
          content: '货主装货配合好，结算沟通清楚。',
          photoFileIds: [wrongPurposeFile.id],
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.FILE_PURPOSE_INVALID,
        '货主评价图片用途不匹配',
      ),
    );
  });

  it('rejects driver shipper evaluations before order completion', async () => {
    const { repository, service } = createService();
    const order = await repository.seedOrderForTest(
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
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});

    await expect(
      service.advanceOrderStatus(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        'driver-status-key',
        {
          nextStatus: 'transporting',
          baseUpdatedAtIso: order.updatedAtIso,
        },
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
    const order = await repository.seedOrderForTest(
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
        'driver-receipt-status-key',
        {
          nextStatus: 'transporting',
          receiptPhotoFileIds: [receiptFile.id],
          baseUpdatedAtIso: order.updatedAtIso,
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
    const order = await repository.seedOrderForTest(
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
        'other-owner-receipt-key',
        {
          nextStatus: 'transporting',
          receiptPhotoFileIds: [receiptFile.id],
          baseUpdatedAtIso: order.updatedAtIso,
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '司机执行凭证不存在'),
    );
  });

  it('rejects invalid current driver order status transitions', async () => {
    const { repository, service } = createService();
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});

    await expect(
      service.advanceOrderStatus(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        'invalid-driver-status-key',
        {
          nextStatus: 'confirming',
          baseUpdatedAtIso: order.updatedAtIso,
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前司机订单状态不允许推进到目标状态',
      ),
    );
  });

  it('returns driver income and wallet balances from financial facts', async () => {
    const { driverFinanceRepository, repository, service } = createService();
    const completedOrder = await createCompletedDriverOrder(
      repository,
      'driver-1',
      createOrderInput('宝安区福永物流园'),
    );
    const pendingOrder = await repository.seedOrderForTest(
      'shipper-1',
      {
        ...createOrderInput('南山区科技园'),
        priceCents: 88000,
        payablePriceCents: 84000,
      },
    );
    await repository.acceptDriverOrder(pendingOrder.id, 'driver-1', {});
    await driverFinanceRepository.executeIdempotentWithdrawalRequest({
      driverId: 'driver-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      requestFingerprint: 'income-withdrawal-fingerprint',
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
        pendingSettlementCents: 0,
        availableWithdrawalCents: 60200,
        reviewingWithdrawalCents: 12000,
        withdrawnCents: 0,
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

    const driver = {
      id: 'driver-1',
      phone: '13900139009',
      userType: 'driver' as const,
    };
    const request = {
      amountCents: 12000,
      bankAccountName: '李师傅',
      bankName: '招商银行',
      bankAccountNo: '6225888800001234',
    };
    const first = await service.createWithdrawal(
      driver,
      '550e8400-e29b-41d4-a716-446655440000',
      request,
    );
    const replay = await service.createWithdrawal(
      driver,
      '550e8400-e29b-41d4-a716-446655440000',
      request,
    );

    expect(first).toMatchObject({
      amountCents: 12000,
      bankAccountMasked: '**** **** **** 1234',
      status: 'reviewing',
      replayed: false,
    });
    expect(replay).toMatchObject({ id: first.id, replayed: true });
  });

  it('rejects a withdrawal key reused with another body', async () => {
    const { repository, service } = createService();
    await createCompletedDriverOrder(
      repository,
      'driver-1',
      createOrderInput('宝安区福永物流园'),
    );
    const driver = {
      id: 'driver-1',
      phone: '13900139009',
      userType: 'driver' as const,
    };
    const key = '550e8400-e29b-41d4-a716-446655440000';
    await service.createWithdrawal(driver, key, {
      amountCents: 12000,
      bankAccountName: '李师傅',
      bankName: '招商银行',
      bankAccountNo: '6225888800001234',
    });

    await expect(
      service.createWithdrawal(driver, key, {
        amountCents: 13000,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountNo: '6225888800001234',
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.IDEMPOTENCY_KEY_REUSED });
  });

  it('rejects driver withdrawals that exceed available balance', async () => {
    const { service } = createService();

    await expect(
      service.createWithdrawal(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        '550e8400-e29b-41d4-a716-446655440000',
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
    const order = await repository.seedOrderForTest(
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
        'pending-receipt-status-key',
        {
          nextStatus: 'transporting',
          receiptPhotoFileIds: [pendingFile.id],
          baseUpdatedAtIso: order.updatedAtIso,
        },
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
    const order = await repository.seedOrderForTest(
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
        'wrong-purpose-status-key',
        {
          nextStatus: 'transporting',
          receiptPhotoFileIds: [cargoFile.id],
          baseUpdatedAtIso: order.updatedAtIso,
        },
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

  it('keeps the production withdrawals repository read-only', () => {
    const repository = new PrismaDriverWithdrawalsRepository({
      driverWithdrawal: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    });

    if (false) {
      // @ts-expect-error Production withdrawal writes require wallet CAS.
      repository.createWithdrawal('driver-1', {
        amountCents: 5000,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountNo: '6225888800001234',
      });
    }
    expect(repository).not.toHaveProperty('createWithdrawal');
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
    const order = await repository.seedOrderForTest('shipper-1', {
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
    const confirmingOrder = await repository.advanceDriverOrderStatus(
      order.id,
      'driver-1',
      {
      nextStatus: 'confirming',
      },
    );
    await expect(
      repository.executeIdempotentOrderMutation({
        actorUserId: 'shipper-1',
        orderId: order.id,
        operation: 'shipper_complete',
        idempotencyKey: `complete-${order.id}`,
        requestFingerprint: `complete-fingerprint-${order.id}`,
        baseUpdatedAtIso: confirmingOrder.updatedAtIso,
        expiresAtIso: '2026-07-16T08:00:00.000Z',
        mutation: { type: 'shipper_complete' },
      }),
    ).resolves.toMatchObject({ kind: 'success' });

    const overview = await service.getIncomeOverview({
      id: 'driver-1',
      phone: '13900139009',
      userType: 'driver',
    });

    expect(overview.records[0]).toMatchObject({
      orderId: order.id,
      grossAmountCents: 90000,
      netIncomeCents: 85500,
      platformFeeCents: 4500,
    });
    expect(overview.summary.historyIncomeCents).toBe(85500);
  });

  it('rejects financial completion for a negotiated order without a quote', async () => {
    const { repository, service } = createService();
    const order = await repository.seedOrderForTest('shipper-1', {
      ...createOrderInput('宝安区福永物流园'),
      pricingMode: 'negotiable',
      priceCents: undefined,
      payablePriceCents: undefined,
    });
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    await repository.advanceDriverOrderStatus(order.id, 'driver-1', {
      nextStatus: 'transporting',
    });
    const confirmingOrder = await repository.advanceDriverOrderStatus(
      order.id,
      'driver-1',
      {
      nextStatus: 'confirming',
      },
    );
    await expect(
      repository.executeIdempotentOrderMutation({
        actorUserId: 'shipper-1',
        orderId: order.id,
        operation: 'shipper_complete',
        idempotencyKey: `complete-${order.id}`,
        requestFingerprint: `complete-fingerprint-${order.id}`,
        baseUpdatedAtIso: confirmingOrder.updatedAtIso,
        expiresAtIso: '2026-07-16T08:00:00.000Z',
        mutation: { type: 'shipper_complete' },
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.PAYMENT_AMOUNT_INVALID });

    const overview = await service.getIncomeOverview({
      id: 'driver-1',
      phone: '13900139009',
      userType: 'driver',
    });

    expect(overview.records).toEqual([]);
    expect(overview.summary.historyIncomeCents).toBe(0);
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
      new InMemoryDriverBankCardsRepository(() => now),
      new InMemoryDriverWithdrawalsRepository(() => now),
      undefined,
      () => now,
    );
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});

    await expect(
      service.advanceOrderStatus(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        order.id,
        'missing-files-repository-key',
        {
          nextStatus: 'transporting',
          receiptPhotoFileIds: ['file-x'],
          baseUpdatedAtIso: order.updatedAtIso,
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '司机执行凭证不存在'),
    );
  });

  it('replays an idempotent driver accept mutation without duplicating events', async () => {
    const { repository, service } = createService();
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
    const request = {
      noteText: '马上联系货主',
      baseUpdatedAtIso: order.updatedAtIso,
    };

    const first = await service.acceptOrder(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      order.id,
      idempotencyKey,
      request,
    );
    const findOrderSpy = jest
      .spyOn(repository, 'findOrderById')
      .mockRejectedValue(new Error('replay must not load the order'));
    const replay = await service.acceptOrder(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      order.id,
      idempotencyKey,
      request,
    );

    expect(replay).toEqual(first);
    expect(findOrderSpy).not.toHaveBeenCalled();
    findOrderSpy.mockRestore();
    expect(
      (await repository.findOrderById(order.id))?.events.filter(
        event => event.eventType === 'driver_accepted',
      ),
    ).toHaveLength(1);
  });

  it('rejects a reused driver accept key before loading a missing order', async () => {
    const { repository, service } = createService();
    const driver = {
      id: 'driver-1',
      phone: '13900139009',
      userType: 'driver' as const,
    };
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );
    const idempotencyKey = '550e8400-e29b-41d4-a716-446655440010';
    const request = {
      noteText: '马上联系货主',
      baseUpdatedAtIso: order.updatedAtIso,
    };

    await service.acceptOrder(driver, order.id, idempotencyKey, request);

    await expect(
      service.acceptOrder(driver, 'missing-order', idempotencyKey, request),
    ).rejects.toMatchObject({
      code: ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
      message: 'Idempotency-Key 已被其他请求复用',
    });
  });

  it('maps a losing driver accept mutation to ORDER_CONFLICT', async () => {
    const { repository, service } = createService();
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput('宝安区福永物流园'),
    );

    await service.acceptOrder(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      order.id,
      '550e8400-e29b-41d4-a716-446655440001',
      {
        noteText: '马上联系货主',
        baseUpdatedAtIso: order.updatedAtIso,
      },
    );

    await expect(
      service.acceptOrder(
        { id: 'driver-2', phone: '13900139010', userType: 'driver' },
        order.id,
        '550e8400-e29b-41d4-a716-446655440002',
        {
          noteText: '我也准备接单',
          baseUpdatedAtIso: order.updatedAtIso,
        },
      ),
    ).rejects.toMatchObject({
      code: ApiErrorCode.ORDER_CONFLICT,
      message: '订单已被其他操作更新',
    });
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
  const order = await repository.seedOrderForTest('shipper-1', input);
  await repository.acceptDriverOrder(order.id, driverId, {});
  await repository.advanceDriverOrderStatus(order.id, driverId, {
    nextStatus: 'transporting',
  });
  const confirmingOrder = await repository.advanceDriverOrderStatus(
    order.id,
    driverId,
    {
    nextStatus: 'confirming',
    },
  );
  const result = await repository.executeIdempotentOrderMutation({
    actorUserId: 'shipper-1',
    orderId: order.id,
    operation: 'shipper_complete',
    idempotencyKey: `complete-${order.id}`,
    requestFingerprint: `complete-fingerprint-${order.id}`,
    baseUpdatedAtIso: confirmingOrder.updatedAtIso,
    expiresAtIso: '2026-07-16T08:00:00.000Z',
    mutation: { type: 'shipper_complete' },
  });

  if (result.kind !== 'success') {
    throw new Error(`Unexpected completion result: ${result.kind}`);
  }

  return result.order;
}

async function createUploadedFile(
  filesRepository: InMemoryFilesRepository,
  ownerUserId: string,
  purpose: 'receipt' | 'cargo' | 'exception' | 'evaluation' = 'receipt',
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
    async batchReviewCertifications() {
      throw new Error('Not implemented in driver order tests');
    },
  };
}
