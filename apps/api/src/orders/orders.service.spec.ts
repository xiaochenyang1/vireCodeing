import { ApiErrorCode, BusinessError } from '../common/errors';
import { InMemoryFilesRepository } from '../files/files.repository';
import { InMemoryProfileCouponsRepository } from '../profile-coupons/profile-coupons.repository';
import { ProfileCouponsService } from '../profile-coupons/profile-coupons.service';
import type { CreateShipperOrderRequest } from './dto';
import {
  InMemoryOrdersRepository,
  PrismaOrdersRepository,
  type PrismaOrdersClient,
} from './orders.repository';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const now = new Date('2026-07-01T08:00:00.000Z');

  function createService() {
    const repository = new InMemoryOrdersRepository(() => now);
    const filesRepository = new InMemoryFilesRepository(() => now);
    return {
      filesRepository,
      repository,
      service: new OrdersService(repository, filesRepository),
    };
  }

  function createServiceWithCoupons() {
    const repository = new InMemoryOrdersRepository(() => now);
    const filesRepository = new InMemoryFilesRepository(() => now);
    const couponsRepository = new InMemoryProfileCouponsRepository({
      coupons: [
        createCoupon({ id: 'coupon-1', title: '满 300 减 30' }),
        createCoupon({ id: 'coupon-2', title: '满 500 减 50' }),
      ],
    });
    const couponsService = new ProfileCouponsService(couponsRepository);

    return {
      couponsService,
      filesRepository,
      repository,
      service: new OrdersService(
        repository,
        filesRepository,
        undefined,
        couponsService,
      ),
    };
  }

  it('creates a waiting shipper order and records an event', async () => {
    const { service } = createService();

    const order = await service.createOrder('shipper-1', {
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
      orderNo: 'HY202607010001',
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

    const order = await service.createOrder('shipper-1', {
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

    const order = await service.createOrder('shipper-1', {
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
    const order = await service.createOrder('shipper-1', {
      ...createInput('宝安区福永物流园'),
      couponId: 'coupon-1',
      couponTitle: '满 300 减 30',
      couponDiscountCents: 3000,
      payablePriceCents: 73000,
    });

    await service.cancelOrder('shipper-1', order.id, {
      reasonText: '计划变更',
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
    const order = await service.createOrder('shipper-1', {
      ...createInput('宝安区福永物流园'),
      couponId: 'coupon-1',
      couponTitle: '满 300 减 30',
      couponDiscountCents: 3000,
      payablePriceCents: 73000,
    });
    setInMemoryOrderStatus(repository, 0, 'confirming');

    await service.completeOrder('shipper-1', order.id);

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
    const order = await service.createOrder('shipper-1', {
      ...createInput('宝安区福永物流园'),
      couponId: 'coupon-1',
      couponTitle: '满 300 减 30',
      couponDiscountCents: 3000,
      payablePriceCents: 73000,
    });

    await service.updateOrder('shipper-1', order.id, {
      ...createInput('宝安区新装货仓'),
      couponId: 'coupon-2',
      couponTitle: '满 500 减 50',
      couponDiscountCents: 5000,
      payablePriceCents: 71000,
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
      service.createOrder('shipper-1', {
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
    const order = await service.createOrder('shipper-1', {
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
    const order = await repository.createOrder(
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
    const order = await repository.createOrder('shipper-1', {
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
    const orderWithMissingCargoFile = await repository.createOrder('shipper-1', {
      ...createInput('宝安区福永物流园'),
      cargoPhotoFileIds: ['file-missing-cargo'],
    });
    await repository.createOrder('shipper-2', createInput('龙华区民治仓'));

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
    const order = await repository.createOrder(
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
    await repository.createOrder('shipper-1', {
      ...createInput('宝安区缺失附件仓'),
      cargoPhotoFileIds: ['file-missing-cargo'],
    });
    const resolvedFile = await createUploadedFile(filesRepository, 'shipper-2', {
      purpose: 'cargo',
      fileName: 'cargo-ok.png',
      contentType: 'image/png',
    });
    const resolvedOrder = await repository.createOrder('shipper-2', {
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
    await repository.createOrder('shipper-1', {
      ...createInput('宝安区待接单附件仓'),
      cargoPhotoFileIds: ['file-waiting-cargo'],
    });
    const loadingOrder = await repository.createOrder('shipper-2', {
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
    await repository.createOrder('shipper-1', {
      ...createInput('宝安区一号货主附件仓'),
      cargoPhotoFileIds: ['file-shipper-1-cargo'],
    });
    const shipper2Order = await repository.createOrder('shipper-2', {
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

    await service.createOrder('shipper-1', createInput('宝安区福永物流园'));
    await service.createOrder('shipper-2', createInput('龙华区民治仓'));

    await expect(
      service.listOrders('shipper-1', { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ shipperId: 'shipper-1' })],
    });
  });

  it('filters shipper orders by keyword and created time range', async () => {
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-01T08:00:00.000Z'),
    );
    const service = new OrdersService(repository);

    await repository.createOrder(
      'shipper-1',
      createInput('宝安区福永物流园', {
        deliveryAddress: '南山门店新址',
        cargoDescription: '平台筛选目标货物',
      }),
    );
    await repository.createOrder(
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

    await service.createOrder('shipper-1', createInput('宝安区福永物流园'));
    await service.createOrder('shipper-1', createInput('龙华区民治仓'));
    await service.createOrder('shipper-1', createInput('盐田港仓储中心'));
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

    const order = await service.createOrder(
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(service.getOrder('shipper-2', order.id)).rejects.toEqual(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });

  it('updates a waiting shipper order and records an update event', async () => {
    const { service } = createService();
    const order = await service.createOrder(
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    const updatedOrder = await service.updateOrder(
      'shipper-1',
      order.id,
      createInput('宝安区新装货仓', {
        deliveryAddress: '南山区新门店',
        cargoDescription: '修改后的货物说明',
        priceCents: 88000,
      }),
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
    const order = await service.createOrder('shipper-1', {
      ...createInput('宝安区福永物流园'),
      cargoPhotoFileIds: [firstFile.id],
    });

    const updatedOrder = await service.updateOrder(
      'shipper-1',
      order.id,
      createInput('宝安区新装货仓', {
        cargoPhotoFileIds: [secondFile.id],
      }),
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
    const order = await service.createOrder(
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(
      service.updateOrder(
        'shipper-2',
        order.id,
        createInput('宝安区新装货仓'),
      ),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });

  it('rejects update for a non-waiting order', async () => {
    const { repository, service } = createService();
    const order = await service.createOrder(
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    setInMemoryOrderStatus(repository, 0, 'loading');

    await expect(
      service.updateOrder(
        'shipper-1',
        order.id,
        createInput('宝安区新装货仓'),
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
    const order = await service.createOrder(
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    const cancelledOrder = await service.cancelOrder('shipper-1', order.id, {
      reasonText: '计划变更',
      description: '客户临时取消出货',
    });

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
    const order = await service.createOrder(
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(
      service.cancelOrder('shipper-2', order.id, {
        reasonText: '计划变更',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });

  it('rejects cancellation for a completed order', async () => {
    const { repository, service } = createService();
    const order = await service.createOrder(
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    setInMemoryOrderStatus(repository, 0, 'completed');

    await expect(
      service.cancelOrder('shipper-1', order.id, {
        reasonText: '计划变更',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许取消',
      ),
    );
  });

  it('completes a confirming shipper order and records a completion event', async () => {
    const { repository, service } = createService();
    const order = await service.createOrder(
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    setInMemoryOrderStatus(repository, 0, 'confirming');

    const completedOrder = await service.completeOrder('shipper-1', order.id);

    expect(completedOrder).toMatchObject({
      id: order.id,
      status: 'completed',
      events: [
        expect.objectContaining({ eventType: 'created' }),
        expect.objectContaining({
          eventType: 'completed',
          noteText: '货主确认送达',
        }),
      ],
    });
  });

  it('rejects completion for another shipper order', async () => {
    const { repository, service } = createService();
    const order = await service.createOrder(
      'shipper-1',
      createInput('宝安区福永物流园'),
    );
    setInMemoryOrderStatus(repository, 0, 'confirming');

    await expect(service.completeOrder('shipper-2', order.id)).rejects.toEqual(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });

  it('rejects completion for a non-confirming order', async () => {
    const { service } = createService();
    const order = await service.createOrder(
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(service.completeOrder('shipper-1', order.id)).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许确认送达',
      ),
    );
  });

  it('advances a waiting shipper order to loading and records a status event', async () => {
    const { service } = createService();
    const order = await service.createOrder(
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    const advancedOrder = await service.advanceOrderStatus(
      'shipper-1',
      order.id,
      { nextStatus: 'loading' },
    );

    expect(advancedOrder).toMatchObject({
      id: order.id,
      status: 'loading',
      events: [
        expect.objectContaining({ eventType: 'created' }),
        expect.objectContaining({
          eventType: 'status_changed',
          noteText: '订单进入待装货',
        }),
      ],
    });
  });

  it('rejects an invalid shipper order status transition', async () => {
    const { service } = createService();
    const order = await service.createOrder(
      'shipper-1',
      createInput('宝安区福永物流园'),
    );

    await expect(
      service.advanceOrderStatus('shipper-1', order.id, {
        nextStatus: 'transporting',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许推进到目标状态',
      ),
    );
  });

  it('reports an exception for a transporting shipper order and records an event', async () => {
    const { repository, service } = createService();
    const order = await service.createOrder(
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
  });

  it('binds uploaded exception files to the exception event', async () => {
    const { filesRepository, repository, service } = createService();
    const order = await service.createOrder(
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
    const order = await service.createOrder(
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
    const order = await service.createOrder(
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
    const order = await service.createOrder(
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
            '5 星：准时送达、服务好；匿名评价；图片凭证 1 张；司机服务细致，整体运输体验很好',
        }),
      ],
    });
  });

  it('rejects evaluation for a non-completed order', async () => {
    const { service } = createService();
    const order = await service.createOrder(
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
    const order = await service.createOrder(
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
    const order = await service.createOrder(
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
});

describe('PrismaOrdersRepository', () => {
  it('records cargo file ids on the created order event', async () => {
    const prisma = {
      order: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(
          createPrismaOrderRecord({
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
          }),
        ),
      },
    } as unknown as PrismaOrdersClient;
    const repository = new PrismaOrdersRepository(
      prisma,
      () => new Date('2026-07-01T08:00:00.000Z'),
    );

    await repository.createOrder('shipper-1', {
      ...createInput('宝安区福永物流园'),
      cargoPhotoFileIds: ['file-cargo-1'],
    });

    expect(prisma.order.create).toHaveBeenCalledWith(
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
} = {}) {
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
