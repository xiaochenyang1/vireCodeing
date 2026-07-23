import type { OrdersService } from './orders.service';
import {
  AdminOrdersController,
  OrdersController,
} from './orders.controller';
import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';

const IDEMPOTENCY_KEY = '550e8400-e29b-41d4-a716-446655440000';

describe('OrdersController', () => {
  const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

  function cancelAdminOrderForTest(
    controller: AdminOrdersController,
    request: AuthenticatedRequest,
    orderId: string,
    idempotencyKeyValue: unknown,
    body: {
      reasonText: string;
      description?: string;
      baseUpdatedAtIso: string;
    },
  ) {
    return Promise.resolve().then(() =>
      (
        controller as unknown as {
          cancelAdminOrder: (
            request: AuthenticatedRequest,
            orderId: string,
            idempotencyKeyValue: unknown,
            body: {
              reasonText: string;
              description?: string;
              baseUpdatedAtIso: string;
            },
          ) => Promise<unknown>;
        }
      ).cancelAdminOrder(request, orderId, idempotencyKeyValue, body),
    );
  }

  function batchCancelAdminOrdersForTest(
    controller: AdminOrdersController,
    request: AuthenticatedRequest,
    idempotencyKeyValue: unknown,
    body: {
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
        controller as unknown as {
          batchCancelAdminOrders: (
            request: AuthenticatedRequest,
            idempotencyKeyValue: unknown,
            body: {
              items: Array<{
                orderId: string;
                baseUpdatedAtIso: string;
              }>;
              reasonText: string;
              description?: string;
            },
          ) => Promise<unknown>;
        }
      ).batchCancelAdminOrders(request, idempotencyKeyValue, body),
    );
  }

  it('creates an order for the authenticated shipper', async () => {
    const service = {
      createOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
    } as unknown as OrdersService;
    const controller = new OrdersController(service);
    const body = createBody();

    await expect(
      controller.createOrder(
        createRequest('shipper-1'),
        idempotencyKey,
        body,
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1' },
      requestId: 'req_order_test',
    });
    expect(service.createOrder).toHaveBeenCalledWith(
      'shipper-1',
      idempotencyKey,
      body,
    );
  });

  it('rejects a missing create idempotency key', async () => {
    const service = { createOrder: jest.fn() } as unknown as OrdersService;
    const controller = new OrdersController(service);

    await expect(
      controller.createOrder(
        createRequest('shipper-1'),
        undefined,
        createBody(),
      ),
    ).rejects.toMatchObject({ code: ApiErrorCode.IDEMPOTENCY_KEY_INVALID });
    expect(service.createOrder).not.toHaveBeenCalled();
  });

  it('lists orders for the authenticated shipper', async () => {
    const service = {
      listOrders: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    } as unknown as OrdersService;
    const controller = new OrdersController(service);

    await expect(
      controller.listOrders(createRequest('shipper-1'), {}),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { items: [], total: 0 },
      requestId: 'req_order_test',
    });
  });

  it('updates an order for the authenticated shipper', async () => {
    const service = {
      updateOrder: jest.fn().mockResolvedValue({
        id: 'order-1',
        pickupAddress: '宝安区新装货仓',
      }),
    } as unknown as OrdersService;
    const controller = new OrdersController(service);
    const body = createBody();

    await expect(
      controller.updateOrder(
        createRequest('shipper-1'),
        'order-1',
        IDEMPOTENCY_KEY,
        {
          ...body,
          pickupAddress: '宝安区新装货仓',
          baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1', pickupAddress: '宝安区新装货仓' },
      requestId: 'req_order_test',
    });
    expect(service.updateOrder).toHaveBeenCalledWith(
      'shipper-1',
      'order-1',
      IDEMPOTENCY_KEY,
      {
        ...body,
        pickupAddress: '宝安区新装货仓',
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      },
    );
  });

  it('cancels an order for the authenticated shipper', async () => {
    const service = {
      cancelOrder: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'cancelled',
      }),
    } as unknown as OrdersService;
    const controller = new OrdersController(service);

    await expect(
      controller.cancelOrder(
        createRequest('shipper-1'),
        'order-1',
        IDEMPOTENCY_KEY,
        {
          reasonText: '计划变更',
          description: '客户临时取消出货',
          baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1', status: 'cancelled' },
      requestId: 'req_order_test',
    });
    expect(service.cancelOrder).toHaveBeenCalledWith(
      'shipper-1',
      'order-1',
      IDEMPOTENCY_KEY,
      {
        reasonText: '计划变更',
        description: '客户临时取消出货',
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      },
    );
  });

  it('completes an order for the authenticated shipper', async () => {
    const service = {
      completeOrder: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'completed',
      }),
    } as unknown as OrdersService;
    const controller = new OrdersController(service);

    await expect(
      controller.completeOrder(
        createRequest('shipper-1'),
        'order-1',
        IDEMPOTENCY_KEY,
        {
          baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1', status: 'completed' },
      requestId: 'req_order_test',
    });
    expect(service.completeOrder).toHaveBeenCalledWith(
      'shipper-1',
      'order-1',
      IDEMPOTENCY_KEY,
      {
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      },
    );
  });

  it('advances an order status for the authenticated shipper', async () => {
    const service = {
      advanceOrderStatus: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'loading',
      }),
    } as unknown as OrdersService;
    const controller = new OrdersController(service);

    await expect(
      controller.advanceOrderStatus(
        createRequest('shipper-1'),
        'order-1',
        IDEMPOTENCY_KEY,
        {
          nextStatus: 'loading',
          baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1', status: 'loading' },
      requestId: 'req_order_test',
    });
    expect(service.advanceOrderStatus).toHaveBeenCalledWith(
      'shipper-1',
      'order-1',
      IDEMPOTENCY_KEY,
      {
        nextStatus: 'loading',
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      },
    );
  });

  it('rejects missing idempotency keys before mutating shipper orders', async () => {
    const service = {
      cancelOrder: jest.fn(),
    } as unknown as OrdersService;
    const controller = new OrdersController(service);

    await expect(
      controller.cancelOrder(createRequest('shipper-1'), 'order-1', undefined, {
        reasonText: '计划变更',
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      }),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.IDEMPOTENCY_KEY_INVALID,
        'Idempotency-Key 无效',
      ),
    );
    expect(service.cancelOrder).not.toHaveBeenCalled();
  });

  it('reports an order exception for the authenticated shipper', async () => {
    const service = {
      reportOrderException: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'transporting',
      }),
    } as unknown as OrdersService;
    const controller = new OrdersController(service);

    await expect(
      controller.reportOrderException(createRequest('shipper-1'), 'order-1', {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
        photoCount: 2,
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1', status: 'transporting' },
      requestId: 'req_order_test',
    });
    expect(service.reportOrderException).toHaveBeenCalledWith(
      'shipper-1',
      'order-1',
      {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
        photoCount: 2,
      },
    );
  });

  it('submits an order evaluation for the authenticated shipper', async () => {
    const service = {
      submitOrderEvaluation: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'completed',
      }),
    } as unknown as OrdersService;
    const controller = new OrdersController(service);

    await expect(
      controller.submitOrderEvaluation(createRequest('shipper-1'), 'order-1', {
        rating: 5,
        tags: ['准时送达', '服务好'],
        content: '司机服务细致，整体运输体验很好',
        anonymous: true,
        photoCount: 1,
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1', status: 'completed' },
      requestId: 'req_order_test',
    });
    expect(service.submitOrderEvaluation).toHaveBeenCalledWith(
      'shipper-1',
      'order-1',
      {
        rating: 5,
        tags: ['准时送达', '服务好'],
        content: '司机服务细致，整体运输体验很好',
        anonymous: true,
        photoCount: 1,
      },
    );
  });

  it('submits an order change request for the authenticated shipper', async () => {
    const service = {
      submitOrderChangeRequest: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'transporting',
      }),
    } as unknown as OrdersService;
    const controller = new OrdersController(service);

    await expect(
      controller.submitOrderChangeRequest(createRequest('shipper-1'), 'order-1', {
        description: '请把卸货地址改到南山门店二期',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1', status: 'transporting' },
      requestId: 'req_order_test',
    });
    expect(service.submitOrderChangeRequest).toHaveBeenCalledWith(
      'shipper-1',
      'order-1',
      {
        description: '请把卸货地址改到南山门店二期',
      },
    );
  });

  it('rejects non-shipper users before creating shipper orders', async () => {
    const service = {
      createOrder: jest.fn(),
    } as unknown as OrdersService;
    const controller = new OrdersController(service);

    await expect(
      controller.createOrder(
        createRequest('driver-1', 'driver'),
        idempotencyKey,
        createBody(),
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主'),
    );
    expect(service.createOrder).not.toHaveBeenCalled();
  });

  it('returns order attachment audit for the authenticated admin', async () => {
    const service = {
      getAdminOrderAttachmentAudit: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        cargo: { fileIds: [], files: [], missingFileIds: [] },
        events: [],
      }),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      controller.getOrderAttachmentAudit(
        createRequest('admin-1', 'admin'),
        'order-1',
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        orderId: 'order-1',
        cargo: { fileIds: [], files: [], missingFileIds: [] },
      },
      requestId: 'req_order_test',
    });
    expect(service.getAdminOrderAttachmentAudit).toHaveBeenCalledWith(
      'order-1',
    );
  });

  it('lists admin orders for the authenticated admin', async () => {
    const service = {
      listAdminOrders: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'order-1',
            orderNo: 'HY202607010001',
            shipperId: 'shipper-1',
            status: 'loading',
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      controller.listAdminOrders(createRequest('admin-1', 'admin'), {
        page: '1',
        pageSize: '20',
        keyword: 'HY202607',
        statuses: 'loading,transporting',
        createdFromIso: '2026-07-01T00:00:00.000Z',
        createdToIso: '2026-07-31T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        items: [
          {
            id: 'order-1',
            orderNo: 'HY202607010001',
            shipperId: 'shipper-1',
            status: 'loading',
          },
        ],
        total: 1,
      },
      requestId: 'req_order_test',
    });
    expect(service.listAdminOrders).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      keyword: 'HY202607',
      status: undefined,
      statuses: ['loading', 'transporting'],
      createdFromIso: '2026-07-01T00:00:00.000Z',
      createdToIso: '2026-07-31T00:00:00.000Z',
    });
  });

  it('returns admin order report for the authenticated admin', async () => {
    const service = {
      getAdminOrderReport: jest.fn().mockResolvedValue({
        generatedAtIso: '2026-07-18T03:00:00.000Z',
        filters: {
          keyword: 'HY202607',
          statuses: ['loading', 'transporting'],
        },
        summary: {
          totalOrderCount: 2,
          waitingOrderCount: 0,
          activeOrderCount: 2,
          completedOrderCount: 0,
          cancelledOrderCount: 0,
          exceptionOrderCount: 1,
        },
        statusBreakdown: [],
        paymentStatusBreakdown: [],
        pricingModeBreakdown: [],
        paymentMethodBreakdown: [],
        topShippers: [],
      }),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      controller.getAdminOrderReport(createRequest('admin-1', 'admin'), {
        keyword: 'HY202607',
        statuses: 'loading,transporting',
        createdFromIso: '2026-07-01T00:00:00.000Z',
        createdToIso: '2026-07-31T00:00:00.000Z',
        topShippersLimit: '8',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        generatedAtIso: '2026-07-18T03:00:00.000Z',
        summary: {
          totalOrderCount: 2,
          activeOrderCount: 2,
          exceptionOrderCount: 1,
        },
      },
      requestId: 'req_order_test',
    });
    expect(service.getAdminOrderReport).toHaveBeenCalledWith({
      keyword: 'HY202607',
      status: undefined,
      statuses: ['loading', 'transporting'],
      createdFromIso: '2026-07-01T00:00:00.000Z',
      createdToIso: '2026-07-31T00:00:00.000Z',
      topShippersLimit: 8,
    });
  });

  it('exports admin orders as csv for the authenticated admin', async () => {
    const service = {
      exportAdminOrdersCsv: jest
        .fn()
        .mockResolvedValue('\uFEFForderId,orderNo\r\norder-1,HY202607010001'),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      controller.exportAdminOrders(
        createRequest('admin-1', 'admin'),
        {
          keyword: 'HY202607',
          statuses: 'loading,transporting',
          createdFromIso: '2026-07-01T00:00:00.000Z',
          createdToIso: '2026-07-31T00:00:00.000Z',
        },
      ),
    ).resolves.toBe('\uFEFForderId,orderNo\r\norder-1,HY202607010001');
    expect(service.exportAdminOrdersCsv).toHaveBeenCalledWith({
      keyword: 'HY202607',
      status: undefined,
      statuses: ['loading', 'transporting'],
      createdFromIso: '2026-07-01T00:00:00.000Z',
      createdToIso: '2026-07-31T00:00:00.000Z',
    });
  });

  it('returns admin order detail for the authenticated admin', async () => {
    const service = {
      getAdminOrder: jest.fn().mockResolvedValue({
        id: 'order-1',
        orderNo: 'HY202607010001',
        shipperId: 'shipper-1',
        status: 'transporting',
      }),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      controller.getAdminOrder(createRequest('admin-1', 'admin'), 'order-1'),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'order-1',
        orderNo: 'HY202607010001',
        shipperId: 'shipper-1',
        status: 'transporting',
      },
      requestId: 'req_order_test',
    });
    expect(service.getAdminOrder).toHaveBeenCalledWith('order-1');
  });

  it('cancels a waiting order for the authenticated admin', async () => {
    const service = {
      cancelAdminOrder: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'cancelled',
      }),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      cancelAdminOrderForTest(
        controller,
        createRequest('admin-1', 'admin'),
        'order-1',
        IDEMPOTENCY_KEY,
        {
          reasonText: '后台取消',
          description: '运营按筛选结果批量清理 waiting 单',
          baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1', status: 'cancelled' },
      requestId: 'req_order_test',
    });
    expect(service.cancelAdminOrder).toHaveBeenCalledWith(
      'admin-1',
      'order-1',
      IDEMPOTENCY_KEY,
      {
        reasonText: '后台取消',
        description: '运营按筛选结果批量清理 waiting 单',
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      },
    );
  });

  it('batch cancels waiting orders for the authenticated admin', async () => {
    const service = {
      batchCancelAdminOrders: jest.fn().mockResolvedValue({
        orderIds: ['order-2', 'order-1'],
        updatedCount: 2,
        items: [
          { id: 'order-2', status: 'cancelled' },
          { id: 'order-1', status: 'cancelled' },
        ],
      }),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      batchCancelAdminOrdersForTest(
        controller,
        createRequest('admin-1', 'admin'),
        IDEMPOTENCY_KEY,
        {
          items: [
            {
              orderId: ' order-2 ',
              baseUpdatedAtIso: '2026-07-12T08:05:00.000Z',
            },
            {
              orderId: 'order-1',
              baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
            },
          ],
          reasonText: '后台取消',
          description: '运营按筛选结果批量清理 waiting 单',
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        orderIds: ['order-2', 'order-1'],
        updatedCount: 2,
      },
      requestId: 'req_order_test',
    });
    expect(service.batchCancelAdminOrders).toHaveBeenCalledWith(
      'admin-1',
      IDEMPOTENCY_KEY,
      {
        items: [
          {
            orderId: 'order-2',
            baseUpdatedAtIso: '2026-07-12T08:05:00.000Z',
          },
          {
            orderId: 'order-1',
            baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
          },
        ],
        reasonText: '后台取消',
        description: '运营按筛选结果批量清理 waiting 单',
      },
    );
  });

  it('rejects missing idempotency keys before cancelling admin orders', async () => {
    const service = {
      cancelAdminOrder: jest.fn(),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      cancelAdminOrderForTest(
        controller,
        createRequest('admin-1', 'admin'),
        'order-1',
        undefined,
        {
          reasonText: '后台取消',
          baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.IDEMPOTENCY_KEY_INVALID,
        'Idempotency-Key 无效',
      ),
    );
    expect(service.cancelAdminOrder).not.toHaveBeenCalled();
  });

  it('lists order attachment audit summaries for the authenticated admin', async () => {
    const service = {
      listAdminOrderAttachmentAudits: jest.fn().mockResolvedValue({
        items: [
          {
            orderId: 'order-1',
            orderNo: 'HY202607010001',
            missingFileIds: ['file-missing'],
            hasMissingFiles: true,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      controller.listOrderAttachmentAudits(createRequest('admin-1', 'admin'), {
        page: '1',
        pageSize: '20',
        keyword: 'HY202607',
        status: 'loading',
        shipperId: 'shipper-2',
        hasMissingFiles: 'true',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        items: [
          {
            orderId: 'order-1',
            missingFileIds: ['file-missing'],
            hasMissingFiles: true,
          },
        ],
        total: 1,
      },
      requestId: 'req_order_test',
    });
    expect(service.listAdminOrderAttachmentAudits).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      keyword: 'HY202607',
      status: 'loading',
      shipperId: 'shipper-2',
      createdFromIso: undefined,
      createdToIso: undefined,
      hasMissingFiles: true,
    });
  });

  it('returns driver execution receipt attachment summaries for the authenticated admin', async () => {
    const service = {
      listAdminOrderAttachmentAudits: jest.fn().mockResolvedValue({
        items: [
          {
            orderId: 'order-driver-1',
            orderNo: 'HY202607080021',
            shipperId: 'shipper-1',
            status: 'transporting',
            createdAtIso: '2026-07-08T08:00:00.000Z',
            cargoFileCount: 0,
            eventAttachmentFileCount: 1,
            totalFileIdCount: 1,
            resolvedFileCount: 1,
            missingFileIds: [],
            hasMissingFiles: false,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      controller.listOrderAttachmentAudits(createRequest('admin-1', 'admin'), {
        page: '1',
        pageSize: '20',
        keyword: '司机凭证',
        hasMissingFiles: 'false',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        items: [
          {
            orderId: 'order-driver-1',
            status: 'transporting',
            eventAttachmentFileCount: 1,
            resolvedFileCount: 1,
            hasMissingFiles: false,
          },
        ],
        total: 1,
      },
      requestId: 'req_order_test',
    });
    expect(service.listAdminOrderAttachmentAudits).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      keyword: '司机凭证',
      status: undefined,
      shipperId: undefined,
      createdFromIso: undefined,
      createdToIso: undefined,
      hasMissingFiles: false,
    });
  });

  it('rejects non-admin users before listing order attachment audit summaries', async () => {
    const service = {
      listAdminOrderAttachmentAudits: jest.fn(),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      controller.listOrderAttachmentAudits(
        createRequest('shipper-1', 'shipper'),
        {},
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
    expect(service.listAdminOrderAttachmentAudits).not.toHaveBeenCalled();
  });

  it('rejects non-admin users before listing admin orders', async () => {
    const service = {
      listAdminOrders: jest.fn(),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      controller.listAdminOrders(createRequest('shipper-1', 'shipper'), {}),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
    expect(service.listAdminOrders).not.toHaveBeenCalled();
  });

  it('rejects non-admin users before reading admin order report', async () => {
    const service = {
      getAdminOrderReport: jest.fn(),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      controller.getAdminOrderReport(createRequest('shipper-1', 'shipper'), {}),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
    expect(service.getAdminOrderReport).not.toHaveBeenCalled();
  });

  it('rejects non-admin users before exporting admin orders', async () => {
    const service = {
      exportAdminOrdersCsv: jest.fn(),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      controller.exportAdminOrders(createRequest('shipper-1', 'shipper'), {}),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
    expect(service.exportAdminOrdersCsv).not.toHaveBeenCalled();
  });

  it('rejects non-admin users before reading admin order detail', async () => {
    const service = {
      getAdminOrder: jest.fn(),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      controller.getAdminOrder(
        createRequest('shipper-1', 'shipper'),
        'order-1',
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
    expect(service.getAdminOrder).not.toHaveBeenCalled();
  });

  it('rejects non-admin users before cancelling admin orders', async () => {
    const service = {
      cancelAdminOrder: jest.fn(),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      cancelAdminOrderForTest(
        controller,
        createRequest('shipper-1', 'shipper'),
        'order-1',
        IDEMPOTENCY_KEY,
        {
          reasonText: '后台取消',
          baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
    expect(service.cancelAdminOrder).not.toHaveBeenCalled();
  });

  it('rejects non-admin users before reading order attachment audit', async () => {
    const service = {
      getAdminOrderAttachmentAudit: jest.fn(),
    } as unknown as OrdersService;
    const controller = new AdminOrdersController(service);

    await expect(
      controller.getOrderAttachmentAudit(
        createRequest('shipper-1', 'shipper'),
        'order-1',
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
    expect(service.getAdminOrderAttachmentAudit).not.toHaveBeenCalled();
  });
});

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'shipper',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_order_test' },
    currentUser: { id: userId, phone: '13900139001', userType },
  };
}

function createBody() {
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
