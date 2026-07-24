import { ApiErrorCode, BusinessError } from '../common/errors';
import { InMemoryFilesRepository } from '../files/files.repository';
import {
  InMemoryProfileCouponsRepository,
  InMemoryProfileCouponsStore,
} from '../profile-coupons/profile-coupons.repository';
import { ProfileCouponsService } from '../profile-coupons/profile-coupons.service';
import {
  createOrderCreateFingerprint,
  createOrderMutationFingerprint,
} from './order-mutation-idempotency';
import type { CreateShipperOrderRequest } from './dto';
import {
  type ExecuteOrderMutationInput,
  InMemoryOrdersRepository,
  PrismaOrdersRepository,
  type PrismaOrdersClient,
  type PrismaOrderRecord,
} from './orders.repository';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const now = new Date('2026-07-01T08:00:00.000Z');
  const createIdempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

  it('replays an existing create before checking current attachment state', async () => {
    const input = {
      ...createInput('宝安区福永物流园'),
      cargoPhotoFileIds: ['file-cargo-1'],
    };
    const snapshot = {
      ...input,
      cargoPhotoCount: 1,
      id: 'order-1',
      orderNo: 'HY202607010000000001',
      shipperId: 'shipper-1',
      status: 'waiting' as const,
      createdAtIso: now.toISOString(),
      updatedAtIso: now.toISOString(),
      events: [],
    };
    const repository = {
      resolveExistingOrderCreate: jest.fn().mockResolvedValue({
        kind: 'success',
        order: snapshot,
        replayed: true,
      }),
      executeIdempotentOrderCreate: jest.fn(),
    } as unknown as InMemoryOrdersRepository;
    const filesRepository = {
      findFileByIdAndOwner: jest
        .fn()
        .mockRejectedValue(new Error('must not load attachments on replay')),
    } as unknown as InMemoryFilesRepository;
    const service = new OrdersService(repository, filesRepository);

    await expect(
      service.createOrder('shipper-1', createIdempotencyKey, input),
    ).resolves.toEqual(snapshot);

    expect(repository.resolveExistingOrderCreate).toHaveBeenCalledWith({
      actorUserId: 'shipper-1',
      operation: 'shipper_create',
      idempotencyKey: createIdempotencyKey,
      requestFingerprint: createOrderCreateFingerprint(input),
    });
    expect(filesRepository.findFileByIdAndOwner).not.toHaveBeenCalled();
    expect(repository.executeIdempotentOrderCreate).not.toHaveBeenCalled();
  });

  it('requires an idempotency key and baseline for every protected mutation', () => {
    const service = null as unknown as OrdersService;

    if (false) {
      // @ts-expect-error Order creation requires an idempotency key.
      service.createOrder('shipper-1', createInput('pickup'));
      // @ts-expect-error Legacy update calls without an idempotency key are forbidden.
      service.updateOrder('shipper-1', 'order-1', createInput('pickup'));
      // @ts-expect-error Protected updates require baseUpdatedAtIso.
      service.updateOrder('shipper-1', 'order-1', 'key', createInput('pickup'));
      // @ts-expect-error Legacy cancel calls without an idempotency key are forbidden.
      service.cancelOrder('shipper-1', 'order-1', { reasonText: 'cancel' });
      // @ts-expect-error Protected cancellations require baseUpdatedAtIso.
      service.cancelOrder('shipper-1', 'order-1', 'key', { reasonText: 'cancel' });
      // @ts-expect-error Legacy completion calls without an idempotency key are forbidden.
      service.completeOrder('shipper-1', 'order-1');
      // @ts-expect-error Protected completions require baseUpdatedAtIso.
      service.completeOrder('shipper-1', 'order-1', 'key', {});
      // @ts-expect-error Legacy status calls without an idempotency key are forbidden.
      service.advanceOrderStatus('shipper-1', 'order-1', {
        nextStatus: 'transporting',
      });
      // @ts-expect-error Protected status calls require baseUpdatedAtIso.
      service.advanceOrderStatus('shipper-1', 'order-1', 'key', {
        nextStatus: 'transporting',
      });
    }

    expect(service).toBeNull();
  });

  function createService() {
    const repository = new InMemoryOrdersRepository(() => now);
    const filesRepository = new InMemoryFilesRepository(() => now);
    return {
      filesRepository,
      repository,
      service: new OrdersService(repository, filesRepository),
    };
  }

  function cancelAdminOrderForTest(
    service: OrdersService,
    adminUserId: string,
    orderId: string,
    idempotencyKey: string,
    input: {
      reasonText: string;
      description?: string;
      baseUpdatedAtIso: string;
    },
  ) {
    return Promise.resolve().then(() =>
      (
        service as unknown as {
          cancelAdminOrder: (
            adminUserId: string,
            orderId: string,
            idempotencyKey: string,
            input: {
              reasonText: string;
              description?: string;
              baseUpdatedAtIso: string;
            },
          ) => Promise<unknown>;
        }
      ).cancelAdminOrder(adminUserId, orderId, idempotencyKey, input),
    );
  }

  function batchCancelAdminOrdersForTest(
    service: OrdersService,
    adminUserId: string,
    idempotencyKey: string,
    input: {
      items: Array<{
        orderId: string;
        baseUpdatedAtIso: string;
      }>;
      reasonText: string;
      description?: string;
    },
  ) {
    return Promise.resolve().then(() =>
      (
        service as unknown as {
          batchCancelAdminOrders: (
            adminUserId: string,
            idempotencyKey: string,
            input: {
              items: Array<{
                orderId: string;
                baseUpdatedAtIso: string;
              }>;
              reasonText: string;
              description?: string;
            },
          ) => Promise<unknown>;
        }
      ).batchCancelAdminOrders(adminUserId, idempotencyKey, input),
    );
  }

  function createServiceWithCoupons() {
    const filesRepository = new InMemoryFilesRepository(() => now);
    const couponStore = new InMemoryProfileCouponsStore({
      coupons: [
        createCoupon({ id: 'coupon-1', title: '满 300 减 30' }),
        createCoupon({
          id: 'coupon-2',
          title: '满 500 减 50',
          discountCents: 5000,
          minOrderAmountCents: 50000,
        }),
      ],
    });
    const repository = new InMemoryOrdersRepository(() => now, couponStore);
    const couponsRepository = new InMemoryProfileCouponsRepository({
      store: couponStore,
    });
    const couponsService = new ProfileCouponsService(couponsRepository);

    return {
      couponsService,
      filesRepository,
      repository,
      service: new OrdersService(repository, filesRepository),
    };
  }

  it('creates a waiting shipper order and records an event', async () => {
    const { service } = createService();

    const order = await createOrderForTest(service, 'shipper-1', {
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupAddress: '宝安区福永物流园',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryAddress: '南山区科技园',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      needTailboard: true,
      needTarp: false,
      pickupTimeIso: '2026-07-02T02:00:00.000Z',
      pricingMode: 'fixed',
      priceCents: 76000,
      paymentMethod: 'cod',
    });

    expect(order).toMatchObject({
      orderNo: 'HY202607010000000001',
      shipperId: 'shipper-1',
      status: 'waiting',
      events: [
        expect.objectContaining({
          eventType: 'created',
          noteText: '货主发布订单',
        }),
      ],
    });
  });

  it('binds uploaded cargo files to a created shipper order', async () => {
    const { filesRepository, service } = createService();
    const file = await createUploadedFile(filesRepository, 'shipper-1', {
      purpose: 'cargo',
      fileName: 'cargo-1.png',
      contentType: 'image/png',
    });

    const order = await createOrderForTest(service, 'shipper-1', {
      ...createInput('宝安区福永物流园'),
      cargoPhotoFileIds: [file.id],
    });

    expect(order).toMatchObject({
      cargoPhotoCount: 1,
      cargoPhotoFileIds: [file.id],
    });
    expect(order.events).toContainEqual(
      expect.objectContaining({
        eventType: 'created',
        attachmentFileIds: [file.id],
      }),
    );
  });

  it('locks a platform coupon when creating a fixed price couponed order', async () => {
    const { couponsService, service } = createServiceWithCoupons();

    const order = await createOrderForTest(service, 'shipper-1', {
      ...createInput('宝安区福永物流园'),
      couponId: 'coupon-1',
      couponTitle: '满 300 减 30',
      couponDiscountCents: 3000,
      payablePriceCents: 73000,
    });

    expect(order).toMatchObject({
      couponId: 'coupon-1',
      couponTitle: '满 300 减 30',
      couponDiscountCents: 3000,
      payablePriceCents: 73000,
    });
    await expect(couponsService.listCoupons('shipper-1')).resolves.toMatchObject({
      summary: {
        usableCount: 1,
        lockedCount: 1,
        usedCount: 0,
        expiredCount: 0,
      },
      items: expect.arrayContaining([
        expect.objectContaining({
          id: 'coupon-1',
          status: 'locked',
          lockedOrderNo: order.orderNo,
          lockedAtIso: expect.any(String),
        }),
      ]),
    });
  });

  it('releases a locked coupon when cancelling a couponed order', async () => {
    const { couponsService, service } = createServiceWithCoupons();
    const order = await createOrderForTest(service, 'shipper-1', {
      ...createInput('宝安区福永物流园'),
      couponId: 'coupon-1',
      couponTitle: '满 300 减 30',
      couponDiscountCents: 3000,
      payablePriceCents: 73000,
    });

    await service.cancelOrder('shipper-1', order.id, 'coupon-cancel-key', {
      reasonText: '计划变更',
      baseUpdatedAtIso: order.updatedAtIso,
    });

    await expect(couponsService.listCoupons('shipper-1')).resolves.toMatchObject({
      summary: {
        usableCount: 2,
        lockedCount: 0,
        usedCount: 0,
        expiredCount: 0,
      },
      items: expect.arrayContaining([
        expect.objectContaining({ id: 'coupon-1', status: 'usable' }),
      ]),
    });
    const wallet = await couponsService.listCoupons('shipper-1');
    const releasedCoupon = wallet.items.find(item => item.id === 'coupon-1');
    expect(releasedCoupon).not.toHaveProperty('lockedOrderNo');
    expect(releasedCoupon).not.toHaveProperty('lockedAtIso');
  });

  it('redeems a locked coupon when completing a couponed order', async () => {
    const { couponsService, repository, service } = createServiceWithCoupons();
    const order = await createOrderForTest(service, 'shipper-1', {
      ...createInput('宝安区福永物流园'),
      couponId: 'coupon-1',
      couponTitle: '满 300 减 30',
      couponDiscountCents: 3000,
      payablePriceCents: 73000,
    });
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    setInMemoryOrderStatus(repository, 0, 'confirming');

    await service.completeOrder('shipper-1', order.id, 'coupon-complete-key', {
      baseUpdatedAtIso: order.updatedAtIso,
    });

    await expect(couponsService.listCoupons('shipper-1')).resolves.toMatchObject({
      summary: {
        usableCount: 1,
        lockedCount: 0,
        usedCount: 1,
        expiredCount: 0,
      },
      items: expect.arrayContaining([
        expect.objectContaining({
          id: 'coupon-1',
          status: 'used',
          usedOrderNo: order.orderNo,
        }),
      ]),
    });
  });

  it('releases the previous coupon and locks the next one when updating a waiting order', async () => {
    const { couponsService, service } = createServiceWithCoupons();
    const order = await createOrderForTest(service, 'shipper-1', {
      ...createInput('宝安区福永物流园'),
      couponId: 'coupon-1',
      couponTitle: '满 300 减 30',
      couponDiscountCents: 3000,
      payablePriceCents: 73000,
    });

    await service.updateOrder('shipper-1', order.id, 'coupon-update-key', {
      ...createInput('宝安区新装货仓'),
      couponId: 'coupon-2',
      couponTitle: '满 500 减 50',
      couponDiscountCents: 5000,
      payablePriceCents: 71000,
      baseUpdatedAtIso: order.updatedAtIso,
    });

    await expect(couponsService.listCoupons('shipper-1')).resolves.toMatchObject({
      summary: {
        usableCount: 1,
        lockedCount: 1,
        usedCount: 0,
        expiredCount: 0,
      },
      items: expect.arrayContaining([
        expect.objectContaining({ id: 'coupon-1', status: 'usable' }),
        expect.objectContaining({
          id: 'coupon-2',
          status: 'locked',
          lockedOrderNo: order.orderNo,
          lockedAtIso: expect.any(String),
        }),
      ]),
    });
  });

  it('rejects cargo files that do not belong to the shipper', async () => {
    const { filesRepository, service } = createService();
    const file = await createUploadedFile(filesRepository, 'shipper-2', {
      purpose: 'cargo',
      fileName: 'cargo-1.png',
      contentType: 'image/png',
    });

    await expect(
      createOrderForTest(service, 'shipper-1', {
        ...createInput('宝安区福永物流园'),
        cargoPhotoFileIds: [file.id],
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '订单附件不存在'),
    );
  });

  it('returns admin order attachment audit with cargo and event file metadata', async () => {
    const { filesRepository, service } = createService();
    const file = await createUploadedFile(filesRepository, 'shipper-1', {
      purpose: 'cargo',
      fileName: 'cargo-1.png',
      contentType: 'image/png',
    });
    const order = await createOrderForTest(service, 'shipper-1', {
      ...createInput('宝安区福永物流园'),
      cargoPhotoFileIds: [file.id],
    });

    const audit = await service.getAdminOrderAttachmentAudit(order.id);

    expect(audit).toMatchObject({
      orderId: order.id,
      orderNo: order.orderNo,
      shipperId: 'shipper-1',
      cargo: {
        fileIds: [file.id],
        missingFileIds: [],
        files: [
          expect.objectContaining({
            id: file.id,
            ownerUserId: 'shipper-1',
            purpose: 'cargo',
            status: 'uploaded',
            previewUrl: expect.stringContaining('/api/files/preview-contents/'),
            previewExpiresAtIso: expect.any(String),
          }),
        ],
      },
      events: [
        expect.objectContaining({
          eventType: 'created',
          attachmentFileIds: [file.id],
          missingFileIds: [],
          files: [
            expect.objectContaining({
              id: file.id,
              purpose: 'cargo',
              previewUrl: expect.stringContaining('/api/files/preview-contents/'),
              previewExpiresAtIso: expect.any(String),
            }),
          ],
        }),
      ],
    });
    expect(audit.events[0]).not.toHaveProperty('fileIds');
  });

  it('returns driver execution receipt files in admin order attachment audit', async () => {
    const { filesRepository, repository, service } = createService();
    const receiptFile = await createUploadedFile(filesRepository, 'driver-1', {
      purpose: 'receipt',
      fileName: 'driver-receipt.png',
      contentType: 'image/png',
    });
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {
      noteText: '马上联系货主',
    });
    await repository.advanceDriverOrderStatus(order.id, 'driver-1', {
      nextStatus: 'transporting',
      receiptPhotoFileIds: [receiptFile.id],
    });

    await expect(
      service.getAdminOrderAttachmentAudit(order.id),
    ).resolves.toMatchObject({
      cargo: {
        fileIds: [],
        files: [],
        missingFileIds: [],
      },
      events: [
        expect.objectContaining({
          eventType: 'driver_status_changed',
          attachmentFileIds: [receiptFile.id],
          missingFileIds: [],
          files: [
            expect.objectContaining({
              id: receiptFile.id,
              ownerUserId: 'driver-1',
              purpose: 'receipt',
              status: 'uploaded',
              previewUrl: expect.stringContaining('/api/files/preview-contents/'),
              previewExpiresAtIso: expect.any(String),
            }),
          ],
        }),
      ],
    });
  });

  it('keeps missing file ids visible in admin order attachment audit', async () => {
    const { repository, service } = createService();
    const order = await repository.seedOrderForTest('shipper-1', {
      ...createInput('宝安区福永物流园'),
      cargoPhotoCount: 1,
      cargoPhotoFileIds: ['file-missing-cargo'],
    });

    await expect(
      service.getAdminOrderAttachmentAudit(order.id),
    ).resolves.toMatchObject({
      cargo: {
        fileIds: ['file-missing-cargo'],
        files: [],
        missingFileIds: ['file-missing-cargo'],
      },
      events: [
        expect.objectContaining({
          eventType: 'created',
          attachmentFileIds: ['file-missing-cargo'],
          files: [],
          missingFileIds: ['file-missing-cargo'],
        }),
      ],
    });
  });

  it('rejects admin attachment audit for a missing order', async () => {
    const { service } = createService();

    await expect(
      service.getAdminOrderAttachmentAudit('order-missing'),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });

  it('lists admin order attachment audit summaries for searchable orders with attachments', async () => {
    const { repository, service } = createService();
    const orderWithMissingCargoFile = await repository.seedOrderForTest('shipper-1', {
      ...createInput('宝安区福永物流园'),
      cargoPhotoFileIds: ['file-missing-cargo'],
    });
    await repository.seedOrderForTest('shipper-2', createInput('龙华区民治仓'));

    await expect(
      service.listAdminOrderAttachmentAudits({
        page: 1,
        pageSize: 20,
        keyword: '福永',
      }),
    ).resolves.toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          orderId: orderWithMissingCargoFile.id,
          orderNo: orderWithMissingCargoFile.orderNo,
          shipperId: 'shipper-1',
          status: 'waiting',
          cargoFileCount: 1,
          eventAttachmentFileCount: 1,
          totalFileIdCount: 1,
          resolvedFileCount: 0,
          missingFileIds: ['file-missing-cargo'],
          hasMissingFiles: true,
        },
      ],
    });
  });

  it('lists driver execution receipt attachments in admin order audit summaries', async () => {
    const { filesRepository, repository, service } = createService();
    const receiptFile = await createUploadedFile(filesRepository, 'driver-1', {
      purpose: 'receipt',
      fileName: 'driver-summary-receipt.png',
      contentType: 'image/png',
    });
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createInput('宝安区司机凭证仓'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {
      noteText: '马上联系货主',
    });
    await repository.advanceDriverOrderStatus(order.id, 'driver-1', {
      nextStatus: 'transporting',
      receiptPhotoFileIds: [receiptFile.id],
    });

    await expect(
      service.listAdminOrderAttachmentAudits({
        page: 1,
        pageSize: 20,
        keyword: '司机凭证',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          orderId: order.id,
          shipperId: 'shipper-1',
          status: 'transporting',
          cargoFileCount: 0,
          eventAttachmentFileCount: 1,
          totalFileIdCount: 1,
          resolvedFileCount: 1,
          missingFileIds: [],
          hasMissingFiles: false,
        }),
      ],
    });
  });

  it('filters admin order attachment audit summaries by missing file state', async () => {
    const { filesRepository, repository, service } = createService();
    await repository.seedOrderForTest('shipper-1', {
      ...createInput('宝安区缺失附件仓'),
      cargoPhotoFileIds: ['file-missing-cargo'],
    });
    const resolvedFile = await createUploadedFile(filesRepository, 'shipper-2', {
      purpose: 'cargo',
      fileName: 'cargo-ok.png',
      contentType: 'image/png',
    });
    const resolvedOrder = await repository.seedOrderForTest('shipper-2', {
      ...createInput('龙华区完整附件仓'),
      cargoPhotoFileIds: [resolvedFile.id],
    });

    await expect(
      service.listAdminOrderAttachmentAudits({
        page: 1,
        pageSize: 20,
        hasMissingFiles: true,
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          orderNo: expect.any(String),
          hasMissingFiles: true,
          missingFileIds: ['file-missing-cargo'],
        }),
      ],
    });
    await expect(
      service.listAdminOrderAttachmentAudits({
        page: 1,
        pageSize: 20,
        hasMissingFiles: false,
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          orderId: resolvedOrder.id,
          hasMissingFiles: false,
          missingFileIds: [],
        }),
      ],
    });
  });

  it('filters admin order attachment audit summaries by order status', async () => {
    const { repository, service } = createService();
    await repository.seedOrderForTest('shipper-1', {
      ...createInput('宝安区待接单附件仓'),
      cargoPhotoFileIds: ['file-waiting-cargo'],
    });
    const loadingOrder = await repository.seedOrderForTest('shipper-2', {
      ...createInput('龙华区运输中附件仓'),
      cargoPhotoFileIds: ['file-loading-cargo'],
    });
    setInMemoryOrderStatus(repository, 1, 'loading');

    await expect(
      service.listAdminOrderAttachmentAudits({
        page: 1,
        pageSize: 20,
        status: 'loading',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          orderId: loadingOrder.id,
          status: 'loading',
        }),
      ],
    });
  });

  it('filters admin order attachment audit summaries by shipper id', async () => {
    const { repository, service } = createService();
    await repository.seedOrderForTest('shipper-1', {
      ...createInput('宝安区一号货主附件仓'),
      cargoPhotoFileIds: ['file-shipper-1-cargo'],
    });
    const shipper2Order = await repository.seedOrderForTest('shipper-2', {
      ...createInput('龙华区二号货主附件仓'),
      cargoPhotoFileIds: ['file-shipper-2-cargo'],
    });

    await expect(
      service.listAdminOrderAttachmentAudits({
        page: 1,
        pageSize: 20,
        shipperId: 'shipper-2',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          orderId: shipper2Order.id,
          shipperId: 'shipper-2',
        }),
      ],
    });
  });

  it('lists only current shipper orders', async () => {
    const { service } = createService();

    await createOrderForTest(service, 'shipper-1', createInput('宝安区福永物流园'));
    await createOrderForTest(service, 'shipper-2', createInput('龙华区民治仓'));

    await expect(
      service.listOrders('shipper-1', { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ shipperId: 'shipper-1' })],
    });
  });

  it('lists admin orders across shippers', async () => {
    const { service } = createService();

    await createOrderForTest(service, 'shipper-1', createInput('宝安区福永物流园'));
    await createOrderForTest(service, 'shipper-2', createInput('龙华区民治仓'));

    await expect(
      service.listAdminOrders({ page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      total: 2,
      items: [
        expect.objectContaining({ shipperId: 'shipper-1' }),
        expect.objectContaining({ shipperId: 'shipper-2' }),
      ],
    });
  });

  it('builds an admin order report across matched orders', async () => {
    const { repository, service } = createService();
    const shipper1WaitingOrder = await repository.seedOrderForTest(
      'shipper-1',
      createInput('宝安区福永物流园', {
        payablePriceCents: 76000,
      }),
    );
    const shipper1CompletedOrder = await repository.seedOrderForTest(
      'shipper-1',
      createInput('南山区科技南路', {
        deliveryAddress: '南山门店二期',
        paymentMethod: 'online',
        priceCents: 88000,
        payablePriceCents: 85000,
      }),
    );
    const shipper2CancelledOrder = await repository.seedOrderForTest(
      'shipper-2',
      createInput('龙华区民治仓', {
        deliveryAddress: '福田保税仓',
        pricingMode: 'negotiable',
        priceCents: undefined,
        payablePriceCents: undefined,
      }),
    );
    const seededRepository = repository as unknown as {
      orders: Array<{
        id: string;
        status: string;
        paymentStatus: string;
        latestExceptionCase?: unknown;
      }>;
    };
    const completedRecord = seededRepository.orders.find(
      order => order.id === shipper1CompletedOrder.id,
    );
    const cancelledRecord = seededRepository.orders.find(
      order => order.id === shipper2CancelledOrder.id,
    );

    if (!completedRecord || !cancelledRecord) {
      throw new Error('seeded orders not found');
    }

    completedRecord.status = 'completed';
    completedRecord.paymentStatus = 'settled';
    cancelledRecord.status = 'cancelled';
    cancelledRecord.paymentStatus = 'cancelled';
    cancelledRecord.latestExceptionCase = {
      id: 'case-1',
      caseNo: 'YC202607180001',
      sourceEventId: 'event-1',
      sourceRole: 'shipper',
      status: 'pending',
      createdAtIso: now.toISOString(),
      updatedAtIso: now.toISOString(),
    };

    const report = await service.getAdminOrderReport({
      keyword: '门店',
      topShippersLimit: 1,
    });

    expect(report).toMatchObject({
      summary: {
        totalOrderCount: 1,
        waitingOrderCount: 0,
        activeOrderCount: 0,
        completedOrderCount: 1,
        cancelledOrderCount: 0,
        exceptionOrderCount: 0,
      },
      topShippers: [
        {
          shipperId: shipper1WaitingOrder.shipperId,
          orderCount: 1,
          waitingOrderCount: 0,
          activeOrderCount: 0,
          completedOrderCount: 1,
          cancelledOrderCount: 0,
          payablePriceTotalCents: 85000,
        },
      ],
    });
    expect(report.statusBreakdown).toEqual([
      expect.objectContaining({
        status: 'completed',
        orderCount: 1,
        payablePriceTotalCents: 85000,
      }),
    ]);
    expect(report.paymentStatusBreakdown).toEqual([
      expect.objectContaining({
        paymentStatus: 'settled',
        orderCount: 1,
        payablePriceTotalCents: 85000,
      }),
    ]);
    expect(report.pricingModeBreakdown).toEqual([
      expect.objectContaining({
        pricingMode: 'fixed',
        orderCount: 1,
        payablePriceTotalCents: 85000,
      }),
    ]);
    expect(report.paymentMethodBreakdown).toEqual([
      expect.objectContaining({
        paymentMethod: 'online',
        orderCount: 1,
        payablePriceTotalCents: 85000,
      }),
    ]);
  });

  it('exports matched admin orders as csv across multiple pages', async () => {
    const { repository, service } = createService();

    for (let index = 0; index < 51; index += 1) {
      await repository.seedOrderForTest(
        `shipper-${(index % 2) + 1}`,
        createInput(`装货仓-${index}`, {
          deliveryAddress: `南山门店-${index}`,
          pickupContact: `发货人-${index}`,
          deliveryContact: `收货人-${index}`,
          priceCents: 10000 + index,
          payablePriceCents: 10000 + index,
        }),
      );
    }

    const csv = await service.exportAdminOrdersCsv({
      keyword: '南山门店',
    });
    const lines = csv.trimEnd().split('\r\n');

    expect(lines).toHaveLength(52);
    expect(lines[0]).toContain(
      'orderId,orderNo,shipperId,status,paymentStatus,pricingMode,paymentMethod',
    );
    expect(csv).toContain('南山门店-0');
    expect(csv).toContain('南山门店-50');
  });

  it('filters shipper orders by keyword and created time range', async () => {
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-01T08:00:00.000Z'),
    );
    const service = new OrdersService(repository);

    await repository.seedOrderForTest(
      'shipper-1',
      createInput('宝安区福永物流园', {
        deliveryAddress: '南山门店新址',
        cargoDescription: '平台筛选目标货物',
      }),
    );
    await repository.seedOrderForTest(
      'shipper-1',
      createInput('龙华区民治仓', {
        deliveryAddress: '福田门店',
        cargoDescription: '普通货物',
      }),
    );

    const orders = await service.listOrders('shipper-1', {
      page: 1,
      pageSize: 20,
      keyword: '目标货物',
      createdFromIso: '2026-07-01T00:00:00.000Z',
      createdToIso: '2026-07-02T00:00:00.000Z',
    });

    expect(orders).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          pickupAddress: '宝安区福永物流园',
          deliveryAddress: '南山门店新址',
        }),
      ],
    });
  });

  it('filters shipper orders by a status collection', async () => {
    const { repository, service } = createService();

    await createOrderForTest(service, 'shipper-1', createInput('宝安区福永物流园'));
    await createOrderForTest(service, 'shipper-1', createInput('龙华区民治仓'));
    await createOrderForTest(service, 'shipper-1', createInput('盐田港仓储中心'));
    setInMemoryOrderStatus(repository, 0, 'loading');
    setInMemoryOrderStatus(repository, 1, 'transporting');
    setInMemoryOrderStatus(repository, 2, 'completed');

    await expect(
      service.listOrders('shipper-1', {
        page: 1,
        pageSize: 20,
        statuses: ['loading', 'transporting'],
      }),
    ).resolves.toMatchObject({
      total: 2,
      items: [
        expect.objectContaining({ status: 'loading' }),
        expect.objectContaining({ status: 'transporting' }),
      ],
    });
  });

  it('rejects access to another shipper order detail', async () => {
    const { service } = createService();

    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(service.getOrder('shipper-2', order.id)).rejects.toEqual(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });

  it('returns admin order detail for an existing order', async () => {
    const { service } = createService();

    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(service.getAdminOrder(order.id)).resolves.toMatchObject({
      id: order.id,
      shipperId: 'shipper-1',
      pickupAddress: '宝安区福永物流园',
    });
  });

  it('rejects admin order detail for a missing order', async () => {
    const { service } = createService();

    await expect(service.getAdminOrder('order-missing')).rejects.toEqual(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });

  it('updates a waiting shipper order and records an update event', async () => {
    const { service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    const updatedOrder = await service.updateOrder(
      'shipper-1',
      order.id,
      'update-key',
      {
        ...createInput('宝安区新装货仓', {
          deliveryAddress: '南山区新门店',
          cargoDescription: '修改后的货物说明',
          priceCents: 88000,
        }),
        baseUpdatedAtIso: order.updatedAtIso,
      },
    );

    expect(updatedOrder).toMatchObject({
      id: order.id,
      orderNo: order.orderNo,
      shipperId: 'shipper-1',
      status: 'waiting',
      pickupAddress: '宝安区新装货仓',
      deliveryAddress: '南山区新门店',
      cargoDescription: '修改后的货物说明',
      priceCents: 88000,
      events: [
        expect.objectContaining({ eventType: 'created' }),
        expect.objectContaining({
          eventType: 'updated',
          noteText: '货主修改订单',
        }),
      ],
    });
  });

  it('records updated cargo file ids on the waiting order update event', async () => {
    const { filesRepository, service } = createService();
    const firstFile = await createUploadedFile(filesRepository, 'shipper-1', {
      purpose: 'cargo',
      fileName: 'cargo-before.png',
      contentType: 'image/png',
    });
    const secondFile = await createUploadedFile(filesRepository, 'shipper-1', {
      purpose: 'cargo',
      fileName: 'cargo-after.png',
      contentType: 'image/png',
    });
    const order = await createOrderForTest(service, 'shipper-1', {
      ...createInput('宝安区福永物流园'),
      cargoPhotoFileIds: [firstFile.id],
    });

    const updatedOrder = await service.updateOrder(
      'shipper-1',
      order.id,
      'update-files-key',
      {
        ...createInput('宝安区新装货仓', {
          cargoPhotoFileIds: [secondFile.id],
        }),
        baseUpdatedAtIso: order.updatedAtIso,
      },
    );

    expect(updatedOrder).toMatchObject({
      cargoPhotoCount: 1,
      cargoPhotoFileIds: [secondFile.id],
    });
    expect(updatedOrder.events).toContainEqual(
      expect.objectContaining({
        eventType: 'updated',
        attachmentFileIds: [secondFile.id],
      }),
    );
  });

  it('rejects update for another shipper order', async () => {
    const { service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(
      service.updateOrder(
        'shipper-2',
        order.id,
        'other-shipper-update-key',
        {
          ...createInput('宝安区新装货仓'),
          baseUpdatedAtIso: order.updatedAtIso,
        },
      ),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });

  it('rejects update for a non-waiting order', async () => {
    const { repository, service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    setInMemoryOrderStatus(repository, 0, 'loading');

    await expect(
      service.updateOrder(
        'shipper-1',
        order.id,
        'invalid-state-update-key',
        {
          ...createInput('宝安区新装货仓'),
          baseUpdatedAtIso: order.updatedAtIso,
        },
      ),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许修改',
      ),
    );
  });

  it('cancels a shipper order and records a cancellation event', async () => {
    const { service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    const cancelledOrder = await service.cancelOrder(
      'shipper-1',
      order.id,
      'cancel-key',
      {
        reasonText: '计划变更',
        description: '客户临时取消出货',
        baseUpdatedAtIso: order.updatedAtIso,
      },
    );

    expect(cancelledOrder).toMatchObject({
      id: order.id,
      status: 'cancelled',
      events: [
        expect.objectContaining({ eventType: 'created' }),
        expect.objectContaining({
          eventType: 'cancelled',
          noteText: '计划变更：客户临时取消出货',
        }),
      ],
    });
  });

  it('rejects cancellation for another shipper order', async () => {
    const { service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(
      service.cancelOrder('shipper-2', order.id, 'other-shipper-cancel-key', {
        reasonText: '计划变更',
        baseUpdatedAtIso: order.updatedAtIso,
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });

  it('rejects cancellation for a completed order', async () => {
    const { repository, service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    setInMemoryOrderStatus(repository, 0, 'completed');

    await expect(
      service.cancelOrder('shipper-1', order.id, 'completed-cancel-key', {
        reasonText: '计划变更',
        baseUpdatedAtIso: order.updatedAtIso,
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许取消',
      ),
    );
  });

  it('cancels a waiting order for admin and records the admin actor', async () => {
    const { service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(
      cancelAdminOrderForTest(
        service,
        'admin-1',
        order.id,
        'admin-cancel-key',
        {
          reasonText: '后台取消',
          description: '运营按筛选结果批量清理 waiting 单',
          baseUpdatedAtIso: order.updatedAtIso,
        },
      ),
    ).resolves.toMatchObject({
      id: order.id,
      status: 'cancelled',
      events: [
        expect.objectContaining({ eventType: 'created' }),
        expect.objectContaining({
          actorUserId: 'admin-1',
          eventType: 'cancelled',
          noteText: '后台取消：运营按筛选结果批量清理 waiting 单',
        }),
      ],
    });
  });

  it('batch cancels waiting orders atomically for admin', async () => {
    const { service } = createService();
    const firstOrder = await createOrderForTest(
      service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    const secondOrder = await createOrderForTest(
      service,
      'shipper-2',
      createInput('南山区科技园'),
    );

    await expect(
      batchCancelAdminOrdersForTest(
        service,
        'admin-1',
        'admin-batch-cancel-key',
        {
          items: [
            {
              orderId: secondOrder.id,
              baseUpdatedAtIso: secondOrder.updatedAtIso,
            },
            {
              orderId: firstOrder.id,
              baseUpdatedAtIso: firstOrder.updatedAtIso,
            },
          ],
          reasonText: '后台取消',
          description: '运营按筛选结果批量清理 waiting 单',
        },
      ),
    ).resolves.toMatchObject({
      orderIds: [secondOrder.id, firstOrder.id],
      updatedCount: 2,
      items: [
        expect.objectContaining({
          id: secondOrder.id,
          status: 'cancelled',
        }),
        expect.objectContaining({
          id: firstOrder.id,
          status: 'cancelled',
        }),
      ],
    });
  });

  it('keeps admin batch cancel atomic when any waiting order is stale or invalid', async () => {
    const { repository, service } = createService();
    const waitingOrder = await createOrderForTest(
      service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    const loadingOrder = await createOrderForTest(
      service,
      'shipper-2',
      createInput('南山区科技园'),
    );
    setInMemoryOrderStatus(repository, 1, 'loading');

    await expect(
      batchCancelAdminOrdersForTest(
        service,
        'admin-1',
        'admin-batch-cancel-stale-key',
        {
          items: [
            {
              orderId: waitingOrder.id,
              baseUpdatedAtIso: waitingOrder.updatedAtIso,
            },
            {
              orderId: loadingOrder.id,
              baseUpdatedAtIso: loadingOrder.updatedAtIso,
            },
          ],
          reasonText: '后台取消',
        },
      ),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许批量取消',
      ),
    );

    await expect(
      service.getOrder('shipper-1', waitingOrder.id),
    ).resolves.toMatchObject({
      id: waitingOrder.id,
      status: 'waiting',
    });
  });

  it('rejects admin cancellation for a non-waiting order', async () => {
    const { repository, service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    setInMemoryOrderStatus(repository, 0, 'loading');

    await expect(
      cancelAdminOrderForTest(
        service,
        'admin-1',
        order.id,
        'admin-invalid-cancel-key',
        {
          reasonText: '后台取消',
          baseUpdatedAtIso: order.updatedAtIso,
        },
      ),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许后台取消',
      ),
    );
  });

  it('rejects admin cancellation for a missing order', async () => {
    const { service } = createService();

    await expect(
      cancelAdminOrderForTest(
        service,
        'admin-1',
        'missing-order',
        'admin-missing-cancel-key',
        {
          reasonText: '后台取消',
          baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        },
      ),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });

  it('completes a confirming shipper order and records a completion event', async () => {
    const { repository, service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    setInMemoryOrderStatus(repository, 0, 'confirming');

    const completedOrder = await service.completeOrder(
      'shipper-1',
      order.id,
      'complete-key',
      { baseUpdatedAtIso: order.updatedAtIso },
    );

    expect(completedOrder).toMatchObject({
      id: order.id,
      status: 'completed',
      events: [
        expect.objectContaining({ eventType: 'created' }),
        expect.objectContaining({ eventType: 'driver_accepted' }),
        expect.objectContaining({
          eventType: 'completed',
          noteText: '货主确认送达',
        }),
      ],
    });
  });

  it('rejects completion for another shipper order', async () => {
    const { repository, service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    setInMemoryOrderStatus(repository, 0, 'confirming');

    await expect(
      service.completeOrder('shipper-2', order.id, 'other-complete-key', {
        baseUpdatedAtIso: order.updatedAtIso,
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });

  it('rejects completion for a non-confirming order', async () => {
    const { service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(
      service.completeOrder('shipper-1', order.id, 'invalid-complete-key', {
        baseUpdatedAtIso: order.updatedAtIso,
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许确认送达',
      ),
    );
  });

  it('rejects advancing a waiting shipper order via status endpoint', async () => {
    const { service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(
      service.advanceOrderStatus(
        'shipper-1',
        order.id,
        'status-key',
        { nextStatus: 'transporting', baseUpdatedAtIso: order.updatedAtIso },
      ),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许推进到目标状态',
      ),
    );
  });

  it('rejects an invalid shipper order status transition', async () => {
    const { service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(
      service.advanceOrderStatus('shipper-1', order.id, 'invalid-status-key', {
        nextStatus: 'confirming',
        baseUpdatedAtIso: order.updatedAtIso,
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许推进到目标状态',
      ),
    );
  });

  it('accepts a negotiable driver quote and assigns the driver', async () => {
    const { repository, service } = createService();
    const order = await createOrderForTest(
      service,
      'shipper-1',
      createInput('宝安区福永物流园', {
        pricingMode: 'negotiable',
        priceCents: undefined,
        payablePriceCents: undefined,
        couponId: undefined,
        couponTitle: undefined,
        couponDiscountCents: undefined,
      }),
    );

    await repository.submitDriverQuote(order.id, 'driver-1', {
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
        completedOrderCount: 12,
      },
    });

    const refreshedOrder = await repository.findOrderById(order.id);
    expect(refreshedOrder).toBeDefined();

    const acceptedOrder = await service.acceptOrderQuote(
      'shipper-1',
      order.id,
      'accept-quote-key',
      {
        driverId: 'driver-1',
        baseUpdatedAtIso: refreshedOrder!.updatedAtIso,
      },
    );

    expect(acceptedOrder).toMatchObject({
      id: order.id,
      status: 'loading',
      assignedDriverId: 'driver-1',
      priceCents: 88000,
      payablePriceCents: 88000,
    });
    expect(
      acceptedOrder.events.some(
        event =>
          event.eventType === 'driver_accepted' &&
          event.actorUserId === 'driver-1',
      ),
    ).toBe(true);
  });

  it('rejects accept-quote when the selected driver has no quote', async () => {
    const { service } = createService();
    const order = await createOrderForTest(
      service,
      'shipper-1',
      createInput('宝安区福永物流园', {
        pricingMode: 'negotiable',
        priceCents: undefined,
        payablePriceCents: undefined,
        couponId: undefined,
        couponTitle: undefined,
        couponDiscountCents: undefined,
      }),
    );

    await expect(
      service.acceptOrderQuote(
        'shipper-1',
        order.id,
        'missing-quote-key',
        {
          driverId: 'driver-missing',
          baseUpdatedAtIso: order.updatedAtIso,
        },
      ),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '未找到该司机的有效报价',
      ),
    );
  });

  it('accumulates exposure bonus on a waiting order', async () => {
    const { service } = createService();
    const order = await createOrderForTest(
      service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    const firstBonus = await service.addOrderBonus(
      'shipper-1',
      order.id,
      'bonus-key-1',
      {
        bonusCents: 5000,
        baseUpdatedAtIso: order.updatedAtIso,
      },
    );

    expect(firstBonus).toMatchObject({
      id: order.id,
      status: 'waiting',
      exposureBonusCents: 5000,
    });
    expect(
      firstBonus.events.some(event => event.eventType === 'bonus_added'),
    ).toBe(true);

    const secondBonus = await service.addOrderBonus(
      'shipper-1',
      order.id,
      'bonus-key-2',
      {
        bonusCents: 2000,
        baseUpdatedAtIso: firstBonus.updatedAtIso,
      },
    );

    expect(secondBonus.exposureBonusCents).toBe(7000);
  });

  it('reports an exception for a transporting shipper order and records an event', async () => {
    const { repository, service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    setInMemoryOrderStatus(repository, 0, 'transporting');

    const reportedOrder = await service.reportOrderException(
      'shipper-1',
      order.id,
      {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
        photoCount: 2,
      },
    );

    expect(reportedOrder).toMatchObject({
      id: order.id,
      status: 'transporting',
      events: [
        expect.objectContaining({ eventType: 'created' }),
        expect.objectContaining({
          eventType: 'exception_reported',
          noteText: '司机延误：司机反馈高速拥堵，预计晚到 40 分钟；图片凭证 2 张',
        }),
      ],
    });
    await expect(repository.listOrderExceptionCases(order.id)).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          orderId: order.id,
          orderNo: order.orderNo,
          sourceRole: 'shipper',
          typeLabel: '司机延误',
          description: '司机反馈高速拥堵，预计晚到 40 分钟',
          status: 'pending',
        }),
      ],
    });
  });

  it('binds uploaded exception files to the exception event', async () => {
    const { filesRepository, repository, service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    const file = await createUploadedFile(filesRepository, 'shipper-1', {
      purpose: 'exception',
      fileName: 'delay.png',
      contentType: 'image/png',
    });
    setInMemoryOrderStatus(repository, 0, 'transporting');

    const reportedOrder = await service.reportOrderException(
      'shipper-1',
      order.id,
      {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
        photoFileIds: [file.id],
      },
    );

    expect(reportedOrder.events).toContainEqual(
      expect.objectContaining({
        eventType: 'exception_reported',
        attachmentFileIds: [file.id],
        noteText: '司机延误：司机反馈高速拥堵，预计晚到 40 分钟；图片凭证 1 张',
      }),
    );
  });

  it('rejects exception files owned by another user', async () => {
    const { filesRepository, repository, service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    const file = await createUploadedFile(filesRepository, 'shipper-2', {
      purpose: 'exception',
      fileName: 'other.png',
      contentType: 'image/png',
    });
    setInMemoryOrderStatus(repository, 0, 'transporting');

    await expect(
      service.reportOrderException('shipper-1', order.id, {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
        photoFileIds: [file.id],
      }),
    ).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
      message: '订单附件不存在',
    });
  });

  it('rejects exception reporting for a waiting order', async () => {
    const { service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(
      service.reportOrderException('shipper-1', order.id, {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许上报异常',
      ),
    );
  });

  it('submits an evaluation for a completed shipper order and records an event', async () => {
    const { repository, service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    setInMemoryOrderStatus(repository, 0, 'completed');

    const evaluatedOrder = await service.submitOrderEvaluation(
      'shipper-1',
      order.id,
      {
        rating: 5,
        tags: ['准时送达', '服务好'],
        content: '司机服务细致，整体运输体验很好',
        anonymous: true,
        photoCount: 1,
      },
    );

    expect(evaluatedOrder).toMatchObject({
      id: order.id,
      status: 'completed',
      events: [
        expect.objectContaining({ eventType: 'created' }),
        expect.objectContaining({
          eventType: 'evaluation_submitted',
          noteText:
            '5 星：准时送达、服务好；评价信息：匿名；图片凭证 1 张；评价正文：司机服务细致，整体运输体验很好',
        }),
      ],
    });
  });

  it('rejects evaluation for a non-completed order', async () => {
    const { service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(
      service.submitOrderEvaluation('shipper-1', order.id, {
        rating: 5,
        tags: ['准时送达'],
        content: '司机服务细致，整体运输体验很好',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许评价',
      ),
    );
  });

  it('submits a change request for an active shipper order and records an event', async () => {
    const { repository, service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    setInMemoryOrderStatus(repository, 0, 'transporting');

    const changedOrder = await service.submitOrderChangeRequest(
      'shipper-1',
      order.id,
      {
        description: '请把卸货地址改到南山门店二期，装货时间顺延 1 小时',
      },
    );

    expect(changedOrder).toMatchObject({
      id: order.id,
      status: 'transporting',
      events: [
        expect.objectContaining({ eventType: 'created' }),
        expect.objectContaining({
          eventType: 'change_requested',
          noteText: '请把卸货地址改到南山门店二期，装货时间顺延 1 小时',
        }),
      ],
    });
  });

  it('rejects a change request for a waiting order', async () => {
    const { service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(
      service.submitOrderChangeRequest('shipper-1', order.id, {
        description: '请把卸货地址改到南山门店二期',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许提交修改申请',
      ),
    );
  });

  it('lists and reviews pending order change requests for admin', async () => {
    const { repository, service } = createService();
    const order = await createOrderForTest(
      service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {
      noteText: '先接单',
      driverSnapshot: {
        driverId: 'driver-1',
        driverName: '李师傅',
        driverPhone: '13900139009',
        completedOrderCount: 1,
      },
    });
    await service.submitOrderChangeRequest('shipper-1', order.id, {
      description: '请把卸货地址改到南山门店二期',
    });

    await expect(
      service.listAdminOrderChangeRequests('admin-1', {
        status: 'pending',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          orderId: order.id,
          status: 'pending',
          description: '请把卸货地址改到南山门店二期',
        }),
      ],
    });

    const reviewed = await service.reviewOrderChangeRequest(
      'admin-1',
      order.id,
      {
        decision: 'approved',
        reviewResultText: '已确认地址变更',
      },
    );
    expect(
      reviewed.events.some(
        event =>
          event.eventType === 'change_request_approved' &&
          event.noteText === '已确认地址变更',
      ),
    ).toBe(true);
  });

  it('replays an idempotent shipper cancellation without duplicating events', async () => {
    const { repository, service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
    const request = {
      reasonText: '计划变更',
      baseUpdatedAtIso: order.updatedAtIso,
    };

    const first = await service.cancelOrder(
      'shipper-1',
      order.id,
      idempotencyKey,
      request,
    );
    const findOrderSpy = jest
      .spyOn(repository, 'findOrderById')
      .mockRejectedValue(new Error('replay must not load the order'));
    const replay = await service.cancelOrder(
      'shipper-1',
      order.id,
      idempotencyKey,
      request,
    );

    expect(replay).toEqual(first);
    expect(findOrderSpy).not.toHaveBeenCalled();
    findOrderSpy.mockRestore();
    expect((await repository.findOrderById(order.id))?.events).toHaveLength(2);
  });

  it('rejects reuse before checking whether the target order exists or is owned', async () => {
    const { service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    const otherShipperOrder = await createOrderForTest(service,
      'shipper-2',
      createInput('南山区科技园'),
    );
    const idempotencyKey = '550e8400-e29b-41d4-a716-446655440010';
    const request = {
      reasonText: '计划变更',
      baseUpdatedAtIso: order.updatedAtIso,
    };

    await service.cancelOrder('shipper-1', order.id, idempotencyKey, request);

    for (const targetOrderId of ['missing-order', otherShipperOrder.id]) {
      await expect(
        service.cancelOrder(
          'shipper-1',
          targetOrderId,
          idempotencyKey,
          request,
        ),
      ).rejects.toMatchObject({
        code: ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
        message: 'Idempotency-Key 已被其他请求复用',
      });
    }
  });

  it('maps stale shipper mutation baselines to ORDER_CONFLICT', async () => {
    const { service } = createService();
    const order = await createOrderForTest(service,
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(
      service.cancelOrder(
        'shipper-1',
        order.id,
        '550e8400-e29b-41d4-a716-446655440002',
        {
          reasonText: '计划变更',
          baseUpdatedAtIso: '2020-01-01T00:00:00.000Z',
        },
      ),
    ).rejects.toMatchObject({
      code: ApiErrorCode.ORDER_CONFLICT,
      message: '订单已被其他操作更新',
    });
  });
});

describe('PrismaOrdersRepository', () => {
  it('resolves an existing mutation for service preflight without loading the order', async () => {
    const input = createPrismaCancelMutationInput(
      'order-1',
      '2026-07-12T08:00:00.000Z',
    );
    const responseSnapshot = {
      ...createInput('宝安区福永物流园'),
      id: 'order-1',
      orderNo: 'HY202607120001',
      shipperId: 'shipper-1',
      status: 'cancelled' as const,
      createdAtIso: '2026-07-12T08:00:00.000Z',
      updatedAtIso: '2026-07-12T08:00:01.000Z',
      events: [],
    };
    const findUnique = jest.fn().mockResolvedValue(
      createPrismaOrderIdempotencyRecord({
        requestFingerprint: input.requestFingerprint,
        responseSnapshot,
      }),
    );
    const prisma = {
      $transaction: jest.fn(),
      order: {
        findUnique: jest.fn(),
      },
      orderIdempotencyRecord: {
        findUnique,
      },
    } as unknown as PrismaOrdersClient;
    const repository = new PrismaOrdersRepository(
      prisma,
      () => new Date('2026-07-12T12:00:00.000Z'),
    );

    await expect(
      repository.resolveExistingOrderMutation(input),
    ).resolves.toEqual({
      kind: 'success',
      replayed: true,
      order: responseSnapshot,
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        OrderIdempotencyRecord_actor_operation_key_unique: {
          actorUserId: 'shipper-1',
          operation: 'shipper_cancel',
          idempotencyKey: 'shipper-cancel-key',
        },
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('executes a shipper update mutation in one transaction and stores the response snapshot', async () => {
    const currentOrder = createPrismaMutationOrderRecord({
      updatedAt: new Date('2026-07-12T08:00:00.000Z'),
      events: [
        {
          id: 'event-created',
          actorUserId: 'shipper-1',
          eventType: 'created',
          noteText: '货主发布订单',
          attachmentFileIds: [],
          createdAt: new Date('2026-07-12T08:00:00.000Z'),
        },
      ],
    });
    const updatedOrder = createPrismaMutationOrderRecord({
      updatedAt: new Date('2026-07-12T08:00:01.000Z'),
      cargo: {
        ...currentOrder.cargo!,
        cargoPhotoCount: 1,
        cargoPhotoFileIds: ['file-cargo-2'],
      },
      locations: [
        {
          ...currentOrder.locations[0],
          address: '宝安区新装货仓',
        },
        {
          ...currentOrder.locations[1],
          address: '南山区新门店',
        },
      ],
      requirement: {
        ...currentOrder.requirement!,
        vehicleType: 'box',
      },
      events: [
        ...currentOrder.events,
        {
          id: 'event-updated',
          actorUserId: 'shipper-1',
          eventType: 'updated',
          noteText: '货主修改订单',
          attachmentFileIds: ['file-cargo-2'],
          createdAt: new Date('2026-07-12T08:00:01.000Z'),
        },
      ],
    });
    const transaction = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(currentOrder)
          .mockResolvedValueOnce(updatedOrder),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderCargo: {
        upsert: jest.fn().mockResolvedValue({ orderId: 'order-1' }),
      },
      orderLocation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderRequirement: {
        upsert: jest.fn().mockResolvedValue({ orderId: 'order-1' }),
      },
      orderEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-updated' }),
      },
      orderIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'idem-1' }),
        update: jest.fn().mockResolvedValue({ id: 'idem-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
      orderIdempotencyRecord: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaOrdersClient;
    const repository = new PrismaOrdersRepository(
      prisma,
      () => new Date('2026-07-12T08:00:01.000Z'),
    );
    const input = createPrismaShipperUpdateMutationInput(
      'order-1',
      '2026-07-12T08:00:00.000Z',
    );

    await expect(repository.executeIdempotentOrderMutation(input)).resolves.toEqual({
      kind: 'success',
      replayed: false,
      order: expect.objectContaining({
        id: 'order-1',
        pickupAddress: '宝安区新装货仓',
        deliveryAddress: '南山区新门店',
        vehicleRequirement: 'box',
        cargoPhotoFileIds: ['file-cargo-2'],
        updatedAtIso: '2026-07-12T08:00:01.000Z',
      }),
    });

    expect(transaction.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-1',
        updatedAt: new Date('2026-07-12T08:00:00.000Z'),
        status: 'waiting',
        paymentStatus: 'not_required',
      },
      data: expect.objectContaining({
        pricingMode: 'fixed',
        updatedAt: new Date('2026-07-12T08:00:01.000Z'),
      }),
    });
    expect(transaction.orderCargo.upsert).toHaveBeenCalled();
    expect(transaction.orderLocation.updateMany).toHaveBeenCalledTimes(2);
    expect(transaction.orderRequirement.upsert).toHaveBeenCalled();
    expect(transaction.orderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        actorUserId: 'shipper-1',
        eventType: 'updated',
        attachmentFileIds: ['file-cargo-2'],
      }),
    });
    expect(transaction.orderIdempotencyRecord.update).toHaveBeenCalledWith({
      where: { id: 'idem-1' },
      data: {
        responseSnapshot: expect.objectContaining({
          id: 'order-1',
          pickupAddress: '宝安区新装货仓',
          deliveryAddress: '南山区新门店',
          vehicleRequirement: 'box',
          cargoPhotoFileIds: ['file-cargo-2'],
          updatedAtIso: '2026-07-12T08:00:01.000Z',
        }),
      },
    });
  });

  it.each([
    {
      name: 'replays the stored response',
      inputOrderId: 'order-1',
      nowIso: '2026-07-12T12:00:00.000Z',
      recordOverrides: {},
      expected: {
        kind: 'success' as const,
        replayed: true,
        order: expect.objectContaining({ id: 'order-1', status: 'cancelled' }),
      },
    },
    {
      name: 'returns key-expired for an expired record',
      inputOrderId: 'order-1',
      nowIso: '2026-07-14T08:00:00.000Z',
      recordOverrides: {},
      expected: { kind: 'key-expired' as const },
    },
    {
      name: 'returns key-reused when the key is pointed at a missing order',
      inputOrderId: 'missing-order',
      nowIso: '2026-07-12T12:00:00.000Z',
      recordOverrides: {},
      expected: { kind: 'key-reused' as const },
    },
  ])('$name before loading the target order', async testCase => {
    const originalInput = createPrismaCancelMutationInput(
      'order-1',
      '2026-07-12T08:00:00.000Z',
    );
    const input = createPrismaCancelMutationInput(
      testCase.inputOrderId,
      '2026-07-12T08:00:00.000Z',
    );
    const responseSnapshot = {
      ...createInput('宝安区福永物流园'),
      id: 'order-1',
      orderNo: 'HY202607120001',
      shipperId: 'shipper-1',
      status: 'cancelled' as const,
      createdAtIso: '2026-07-12T08:00:00.000Z',
      updatedAtIso: '2026-07-12T08:00:01.000Z',
      events: [],
    };
    const transaction = {
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      orderIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(
          createPrismaOrderIdempotencyRecord({
            requestFingerprint: originalInput.requestFingerprint,
            responseSnapshot,
            ...testCase.recordOverrides,
          }),
        ),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
      orderIdempotencyRecord: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaOrdersClient;
    const repository = new PrismaOrdersRepository(
      prisma,
      () => new Date(testCase.nowIso),
    );

    await expect(repository.executeIdempotentOrderMutation(input)).resolves.toEqual(
      testCase.expected,
    );

    expect(transaction.orderIdempotencyRecord.findUnique).toHaveBeenCalledWith({
      where: {
        OrderIdempotencyRecord_actor_operation_key_unique: {
          actorUserId: 'shipper-1',
          operation: 'shipper_cancel',
          idempotencyKey: 'shipper-cancel-key',
        },
      },
    });
    expect(transaction.order.findUnique).not.toHaveBeenCalled();
    expect(transaction.orderIdempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('replays an existing idempotency record when the reservation key already exists', async () => {
    const input = createPrismaCancelMutationInput(
      'order-1',
      '2026-07-12T08:00:00.000Z',
    );
    const responseSnapshot = {
      ...createInput('宝安区福永物流园'),
      id: 'order-1',
      orderNo: 'HY202607120001',
      shipperId: 'shipper-1',
      status: 'cancelled' as const,
      createdAtIso: '2026-07-12T08:00:00.000Z',
      updatedAtIso: '2026-07-12T08:00:01.000Z',
      events: [
        {
          id: 'event-created',
          actorUserId: 'shipper-1',
          eventType: 'created',
          noteText: '货主发布订单',
          createdAtIso: '2026-07-12T08:00:00.000Z',
        },
        {
          id: 'event-cancelled',
          actorUserId: 'shipper-1',
          eventType: 'cancelled',
          noteText: '计划变更：客户临时取消出货',
          createdAtIso: '2026-07-12T08:00:01.000Z',
        },
      ],
    };
    const transaction = {
      order: {
        findUnique: jest.fn().mockResolvedValue(createPrismaMutationOrderRecord()),
      },
      orderIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
      orderIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(
          createPrismaOrderIdempotencyRecord({
            requestFingerprint: input.requestFingerprint,
            responseSnapshot,
          }),
        ),
      },
    } as unknown as PrismaOrdersClient;
    const repository = new PrismaOrdersRepository(
      prisma,
      () => new Date('2026-07-12T12:00:00.000Z'),
    );

    await expect(repository.executeIdempotentOrderMutation(input)).resolves.toEqual({
      kind: 'success',
      replayed: true,
      order: responseSnapshot,
    });

    expect(prisma.orderIdempotencyRecord?.findUnique).toHaveBeenCalledWith({
      where: {
        OrderIdempotencyRecord_actor_operation_key_unique: {
          actorUserId: 'shipper-1',
          operation: 'shipper_cancel',
          idempotencyKey: 'shipper-cancel-key',
        },
      },
    });
  });

  it('returns conflict when the conditional order update loses the optimistic race', async () => {
    const currentOrder = createPrismaMutationOrderRecord({
      updatedAt: new Date('2026-07-12T08:00:00.000Z'),
    });
    const transaction = {
      order: {
        findUnique: jest.fn().mockResolvedValue(currentOrder),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      orderCargo: {
        upsert: jest.fn(),
      },
      orderLocation: {
        updateMany: jest.fn(),
      },
      orderRequirement: {
        upsert: jest.fn(),
      },
      orderEvent: {
        create: jest.fn(),
      },
      orderIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'idem-1' }),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
      orderIdempotencyRecord: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaOrdersClient;
    const repository = new PrismaOrdersRepository(
      prisma,
      () => new Date('2026-07-12T08:00:01.000Z'),
    );

    await expect(
      repository.executeIdempotentOrderMutation(
        createPrismaCancelMutationInput(
          'order-1',
          '2026-07-12T08:00:00.000Z',
        ),
      ),
    ).resolves.toEqual({ kind: 'conflict' });

    expect(transaction.orderEvent.create).not.toHaveBeenCalled();
    expect(transaction.orderIdempotencyRecord.update).not.toHaveBeenCalled();
  });

  it('updates an exception case and action history in one transaction', async () => {
    const currentCase = createPrismaExceptionCaseRecord();
    const updatedCase = createPrismaExceptionCaseRecord({
      status: 'processing',
      updatedAt: new Date('2026-07-12T08:00:01.000Z'),
      actions: [
        {
          id: 'action-1',
          adminUserId: 'admin-1',
          fromStatus: 'pending',
          toStatus: 'processing',
          content: '客服已经联系司机核实异常情况。',
          createdAt: new Date('2026-07-12T08:00:01.000Z'),
        },
      ],
    });
    const transaction = {
      orderExceptionCase: {
        update: jest.fn().mockResolvedValue(updatedCase),
      },
      orderExceptionCaseAction: {
        create: jest.fn().mockResolvedValue({ id: 'action-1' }),
      },
    };
    const prisma = {
      orderExceptionCase: {
        findUnique: jest.fn().mockResolvedValue(currentCase),
      },
      orderExceptionCaseAction: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async callback => callback(transaction)),
    } as unknown as PrismaOrdersClient;
    const repository = new PrismaOrdersRepository(
      prisma,
      () => new Date('2026-07-12T08:00:01.000Z'),
    );

    await expect(
      repository.transitionOrderExceptionCase(
        'case-1',
        'admin-1',
        'pending',
        'processing',
        {
          baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
          content: '客服已经联系司机核实异常情况。',
        },
      ),
    ).resolves.toMatchObject({ status: 'processing' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.orderExceptionCaseAction.create).toHaveBeenCalled();
    expect(transaction.orderExceptionCase.update).toHaveBeenCalled();
  });

  it('creates a shipper exception event and case in one transaction', async () => {
    const event = {
      id: 'event-exception-1',
      actorUserId: 'shipper-1',
      eventType: 'exception_reported',
      noteText: '司机延误：司机反馈高速拥堵，预计晚到 40 分钟',
      attachmentFileIds: ['file-exception-1'],
      createdAt: new Date('2026-07-12T08:00:00.000Z'),
    };
    const transaction = {
      orderEvent: {
        create: jest.fn().mockResolvedValue(event),
      },
      orderExceptionCase: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'case-1',
          caseNo: 'YC202607120001',
        }),
      },
      order: {
        update: jest.fn().mockResolvedValue(
          createPrismaOrderRecord({ events: [event] }),
        ),
        findUnique: jest.fn().mockResolvedValue(
          createPrismaOrderRecord({ events: [event] }),
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
    } as unknown as PrismaOrdersClient;
    const repository = new PrismaOrdersRepository(
      prisma,
      () => new Date('2026-07-12T08:00:00.000Z'),
    );

    await repository.reportOrderException('order-1', 'shipper-1', {
      typeLabel: '司机延误',
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
      photoFileIds: ['file-exception-1'],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.orderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        actorUserId: 'shipper-1',
        eventType: 'exception_reported',
      }),
    });
    expect(transaction.orderExceptionCase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        sourceEventId: 'event-exception-1',
        reporterUserId: 'shipper-1',
        sourceRole: 'shipper',
        status: 'pending',
      }),
    });
  });

  it('creates a driver exception event and case in one transaction', async () => {
    const event = {
      id: 'event-driver-exception-1',
      actorUserId: 'driver-1',
      eventType: 'driver_exception_reported',
      noteText: '货物损坏：装货时发现外包装已经破损。',
      attachmentFileIds: [],
      createdAt: new Date('2026-07-12T08:00:00.000Z'),
    };
    const transaction = {
      orderEvent: { create: jest.fn().mockResolvedValue(event) },
      orderExceptionCase: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'case-1',
          caseNo: 'YC202607120001',
        }),
      },
      order: {
        update: jest.fn().mockResolvedValue(
          createPrismaOrderRecord({ events: [event] }),
        ),
        findUnique: jest.fn().mockResolvedValue(
          createPrismaOrderRecord({ events: [event] }),
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
    } as unknown as PrismaOrdersClient;
    const repository = new PrismaOrdersRepository(prisma);

    await repository.reportDriverOrderException('order-1', 'driver-1', {
      typeLabel: '货物损坏',
      description: '装货时发现外包装已经破损。',
    });

    expect(transaction.orderExceptionCase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceEventId: 'event-driver-exception-1',
        reporterUserId: 'driver-1',
        sourceRole: 'driver',
      }),
    });
  });

  it('records cargo file ids on the created order event', async () => {
    const input = {
      ...createInput('宝安区福永物流园'),
      cargoPhotoFileIds: ['file-cargo-1'],
    };
    const created = createPrismaOrderRecord({
      cargoPhotoFileIds: ['file-cargo-1'],
      events: [
        {
          id: 'event-created',
          actorUserId: 'shipper-1',
          eventType: 'created',
          noteText: '货主发布订单',
          attachmentFileIds: ['file-cargo-1'],
          createdAt: new Date('2026-07-01T08:00:00.000Z'),
        },
      ],
    });
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ value: 1n }]),
      order: {
        create: jest.fn().mockResolvedValue(created),
        findUnique: jest.fn().mockResolvedValue(created),
      },
      orderIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'idempotency-create-1' }),
        update: jest.fn().mockResolvedValue({ id: 'idempotency-create-1' }),
      },
      shipperCoupon: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
      orderIdempotencyRecord: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaOrdersClient;
    const repository = new PrismaOrdersRepository(
      prisma,
      () => new Date('2026-07-01T08:00:00.000Z'),
    );

    await repository.executeIdempotentOrderCreate({
      actorUserId: 'shipper-1',
      operation: 'shipper_create',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      requestFingerprint: createOrderCreateFingerprint(input),
      expiresAtIso: '2026-07-02T08:00:00.000Z',
      input,
    });

    expect(transaction.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          events: {
            create: expect.objectContaining({
              eventType: 'created',
              attachmentFileIds: ['file-cargo-1'],
            }),
          },
        }),
      }),
    );
  });

  it('records cargo file ids on the updated order event', async () => {
    const prisma = {
      order: {
        update: jest.fn().mockResolvedValue(
          createPrismaOrderRecord({
            cargoPhotoFileIds: ['file-cargo-after'],
            events: [
              {
                id: 'event-updated',
                actorUserId: 'shipper-1',
                eventType: 'updated',
                noteText: '货主修改订单',
                attachmentFileIds: ['file-cargo-after'],
                createdAt: new Date('2026-07-01T08:00:00.000Z'),
              },
            ],
          }),
        ),
      },
    } as unknown as PrismaOrdersClient;
    const repository = new PrismaOrdersRepository(
      prisma,
      () => new Date('2026-07-01T08:00:00.000Z'),
    );

    await repository.updateOrder(
      'order-1',
      'shipper-1',
      createInput('宝安区新装货仓', {
        cargoPhotoFileIds: ['file-cargo-after'],
      }),
    );

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          events: {
            create: expect.objectContaining({
              eventType: 'updated',
              attachmentFileIds: ['file-cargo-after'],
            }),
          },
        }),
      }),
    );
  });

  it('drops stale fixed price coupon fields when mapping a negotiable order', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-negotiable-stale-coupon',
          orderNo: 'HY202607010003',
          shipperId: 'shipper-1',
          status: 'waiting',
          pricingMode: 'negotiable',
          priceCents: 76000,
          payablePriceCents: 73000,
          paymentMethod: 'cod',
          couponId: 'coupon-platform-30',
          couponTitle: '满 300 减 30',
          couponDiscountCents: 3000,
          pickupTime: new Date('2026-07-02T02:00:00.000Z'),
          expectedDeliveryText: null,
          createdAt: new Date('2026-07-01T08:00:00.000Z'),
          updatedAt: new Date('2026-07-01T08:00:00.000Z'),
          cargo: {
            cargoType: 'digital',
            weightText: '1.5 吨',
            volumeText: null,
            quantityText: '8 箱',
            description: null,
            cargoPhotoCount: 0,
          },
          locations: [
            {
              type: 'pickup',
              address: '宝安区平台仓',
              contactName: '赵经理',
              contactPhone: '13900139001',
              noteText: null,
            },
            {
              type: 'delivery',
              address: '南山区平台门店',
              contactName: '钱店长',
              contactPhone: '13900139002',
              noteText: null,
            },
          ],
          requirement: {
            vehicleType: 'medium',
            vehicleLengthText: null,
            needTailboard: false,
            needTarp: false,
            valueAddedServicesText: null,
          },
          events: [],
        }),
      },
    } as unknown as PrismaOrdersClient;
    const repository = new PrismaOrdersRepository(prisma);

    await expect(
      repository.findOrderById('order-negotiable-stale-coupon'),
    ).resolves.toMatchObject({
      pricingMode: 'negotiable',
      priceCents: undefined,
      payablePriceCents: undefined,
      couponId: undefined,
      couponTitle: undefined,
      couponDiscountCents: undefined,
    });
  });
});

function createInput(
  pickupAddress: string,
  overrides: Partial<CreateShipperOrderRequest> = {},
) {
  return {
    ...createBaseInput(),
    pickupAddress,
    ...overrides,
  };
}

let nextCreateIdempotencyKeySequence = 0;

function createOrderForTest(
  service: OrdersService,
  shipperId: string,
  input: CreateShipperOrderRequest,
) {
  nextCreateIdempotencyKeySequence += 1;
  const suffix = nextCreateIdempotencyKeySequence
    .toString(16)
    .padStart(12, '0');

  return service.createOrder(
    shipperId,
    `00000000-0000-4000-8000-${suffix}`,
    input,
  );
}

function createPrismaOrderRecord(overrides: {
  cargoPhotoFileIds?: string[];
  events?: Array<{
    id: string;
    actorUserId: string;
    eventType: string;
    noteText: string | null;
    attachmentFileIds: string[];
    createdAt: Date;
  }>;
} = {}): PrismaOrderRecord {
  return {
    id: 'order-1',
    orderNo: 'HY202607010001',
    shipperId: 'shipper-1',
    status: 'waiting',
    pricingMode: 'fixed',
    priceCents: 76000,
    payablePriceCents: null,
    paymentMethod: 'cod',
    couponId: null,
    couponTitle: null,
    couponDiscountCents: null,
    pickupTime: new Date('2026-07-02T02:00:00.000Z'),
    expectedDeliveryText: null,
    createdAt: new Date('2026-07-01T08:00:00.000Z'),
    updatedAt: new Date('2026-07-01T08:00:00.000Z'),
    cargo: {
      cargoType: 'build',
      weightText: '2.5 吨',
      volumeText: null,
      quantityText: '12 箱',
      description: null,
      cargoPhotoCount: overrides.cargoPhotoFileIds?.length ?? 0,
      cargoPhotoFileIds: overrides.cargoPhotoFileIds ?? [],
    },
    locations: [
      {
        type: 'pickup',
        address: '宝安区福永物流园',
        contactName: '赵经理',
        contactPhone: '13900139001',
        noteText: null,
      },
      {
        type: 'delivery',
        address: '南山区科技园',
        contactName: '钱店长',
        contactPhone: '13900139002',
        noteText: null,
      },
    ],
    requirement: {
      vehicleType: 'medium',
      vehicleLengthText: null,
      needTailboard: false,
      needTarp: false,
      valueAddedServicesText: null,
    },
    events: overrides.events ?? [],
  };
}

function createPrismaMutationOrderRecord(
  overrides: Partial<PrismaOrderRecord> = {},
): PrismaOrderRecord {
  const base = createPrismaOrderRecord();

  return {
    ...base,
    ...overrides,
    cargo: overrides.cargo ?? base.cargo,
    locations: overrides.locations ?? base.locations,
    requirement: overrides.requirement ?? base.requirement,
    events: overrides.events ?? base.events,
  };
}

function createPrismaShipperUpdateMutationInput(
  orderId: string,
  baseUpdatedAtIso: string,
): ExecuteOrderMutationInput {
  const mutationInput = createInput('宝安区新装货仓', {
    deliveryAddress: '南山区新门店',
    vehicleRequirement: 'box',
    cargoPhotoFileIds: ['file-cargo-2'],
  });
  const request = {
    ...mutationInput,
    baseUpdatedAtIso,
  };

  return {
    actorUserId: 'shipper-1',
    orderId,
    operation: 'shipper_update',
    idempotencyKey: 'shipper-update-key',
    requestFingerprint: createOrderMutationFingerprint(orderId, request),
    baseUpdatedAtIso,
    expiresAtIso: '2026-07-13T08:00:00.000Z',
    mutation: {
      type: 'shipper_update',
      input: mutationInput,
    },
  };
}

function createPrismaCancelMutationInput(
  orderId: string,
  baseUpdatedAtIso: string,
): ExecuteOrderMutationInput {
  const request = {
    reasonText: '计划变更',
    description: '客户临时取消出货',
    baseUpdatedAtIso,
  };

  return {
    actorUserId: 'shipper-1',
    orderId,
    operation: 'shipper_cancel',
    idempotencyKey: 'shipper-cancel-key',
    requestFingerprint: createOrderMutationFingerprint(orderId, request),
    baseUpdatedAtIso,
    expiresAtIso: '2026-07-13T08:00:00.000Z',
    mutation: {
      type: 'shipper_cancel',
      input: {
        reasonText: request.reasonText,
        description: request.description,
      },
    },
  };
}

function createPrismaOrderIdempotencyRecord(
  overrides: Partial<{
    actorUserId: string;
    orderId: string;
    operation: string;
    idempotencyKey: string;
    requestFingerprint: string;
    responseSnapshot: unknown;
    createdAt: Date;
    expiresAt: Date;
  }> = {},
) {
  return {
    id: 'idem-1',
    actorUserId: 'shipper-1',
    orderId: 'order-1',
    operation: 'shipper_cancel',
    idempotencyKey: 'shipper-cancel-key',
    requestFingerprint: 'request-fingerprint',
    responseSnapshot: {},
    createdAt: new Date('2026-07-12T08:00:00.000Z'),
    expiresAt: new Date('2026-07-13T08:00:00.000Z'),
    ...overrides,
  };
}

function createPrismaExceptionCaseRecord(
  overrides: Partial<{
    status: 'pending' | 'processing' | 'resolved' | 'closed';
    updatedAt: Date;
    actions: Array<{
      id: string;
      adminUserId: string;
      fromStatus: 'pending' | 'processing' | 'resolved' | 'closed';
      toStatus: 'pending' | 'processing' | 'resolved' | 'closed';
      content: string;
      createdAt: Date;
    }>;
  }> = {},
) {
  return {
    id: 'case-1',
    caseNo: 'YC202607120001',
    orderId: 'order-1',
    sourceEventId: 'event-exception-1',
    reporterUserId: 'driver-1',
    sourceRole: 'driver' as const,
    typeLabel: '货物损坏',
    description: '装货时发现外包装已经破损。',
    attachmentFileIds: [],
    status: 'pending' as const,
    resolutionText: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: new Date('2026-07-12T08:00:00.000Z'),
    updatedAt: new Date('2026-07-12T08:00:00.000Z'),
    order: { orderNo: 'HY202607120001' },
    actions: [],
    ...overrides,
  };
}

function createBaseInput() {
  return {
    cargoType: 'build',
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
    pickupTimeIso: '2026-07-02T02:00:00.000Z',
    pricingMode: 'fixed' as const,
    priceCents: 76000,
    paymentMethod: 'cod' as const,
  };
}

function createCoupon(
  overrides: Partial<{
    id: string;
    shipperId: string;
    title: string;
    status: 'usable' | 'locked' | 'used' | 'expired';
    conditionText: string;
    discountCents: number;
    minOrderAmountCents: number;
    validFromIso: string;
    validUntilIso: string;
    sourceText: string;
    issuedAtIso: string;
    usedOrderNo: string;
    usedAtIso: string;
  }>,
) {
  return {
    id: 'coupon-1',
    shipperId: 'shipper-1',
    title: '满 300 减 30',
    status: 'usable' as const,
    conditionText: '发单满 300 元可用',
    discountCents: 3000,
    minOrderAmountCents: 30000,
    validFromIso: '2026-07-01T00:00:00.000Z',
    validUntilIso: '2026-07-31T15:59:59.000Z',
    sourceText: '平台活动发放',
    issuedAtIso: '2026-07-09T08:00:00.000Z',
    ...overrides,
  };
}

function setInMemoryOrderStatus(
  repository: InMemoryOrdersRepository,
  index: number,
  status: 'loading' | 'transporting' | 'confirming' | 'completed',
) {
  const seededRepository = repository as unknown as {
    orders: Array<{ status: string }>;
  };
  seededRepository.orders[index].status = status;
}

async function createUploadedFile(
  repository: InMemoryFilesRepository,
  ownerUserId: string,
  input: {
    purpose: 'cargo' | 'exception' | 'evaluation' | 'receipt';
    fileName: string;
    contentType: string;
  },
) {
  const file = await repository.createPendingFile(ownerUserId, {
    ...input,
    byteSize: 1024,
    objectKey: `${ownerUserId}/${input.purpose}/${input.fileName}`,
  });

  return repository.markFileUploaded(file.id, ownerUserId, {});
}
