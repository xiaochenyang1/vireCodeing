import type { OrdersService } from './orders.service';
import {
  AdminOrderAttachmentsController,
  OrdersController,
} from './orders.controller';
import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';

describe('OrdersController', () => {
  it('creates an order for the authenticated shipper', async () => {
    const service = {
      createOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
    } as unknown as OrdersService;
    const controller = new OrdersController(service);
    const body = createBody();

    await expect(
      controller.createOrder(createRequest('shipper-1'), body),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1' },
      requestId: 'req_order_test',
    });
    expect(service.createOrder).toHaveBeenCalledWith('shipper-1', body);
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
      controller.updateOrder(createRequest('shipper-1'), 'order-1', {
        ...body,
        pickupAddress: '宝安区新装货仓',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1', pickupAddress: '宝安区新装货仓' },
      requestId: 'req_order_test',
    });
    expect(service.updateOrder).toHaveBeenCalledWith('shipper-1', 'order-1', {
      ...body,
      pickupAddress: '宝安区新装货仓',
    });
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
      controller.cancelOrder(createRequest('shipper-1'), 'order-1', {
        reasonText: '计划变更',
        description: '客户临时取消出货',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1', status: 'cancelled' },
      requestId: 'req_order_test',
    });
    expect(service.cancelOrder).toHaveBeenCalledWith('shipper-1', 'order-1', {
      reasonText: '计划变更',
      description: '客户临时取消出货',
    });
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
      controller.completeOrder(createRequest('shipper-1'), 'order-1'),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1', status: 'completed' },
      requestId: 'req_order_test',
    });
    expect(service.completeOrder).toHaveBeenCalledWith('shipper-1', 'order-1');
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
      controller.advanceOrderStatus(createRequest('shipper-1'), 'order-1', {
        nextStatus: 'loading',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1', status: 'loading' },
      requestId: 'req_order_test',
    });
    expect(service.advanceOrderStatus).toHaveBeenCalledWith(
      'shipper-1',
      'order-1',
      { nextStatus: 'loading' },
    );
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
      controller.createOrder(createRequest('driver-1', 'driver'), createBody()),
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
    const controller = new AdminOrderAttachmentsController(service);

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
    const controller = new AdminOrderAttachmentsController(service);

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
    const controller = new AdminOrderAttachmentsController(service);

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
    const controller = new AdminOrderAttachmentsController(service);

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

  it('rejects non-admin users before reading order attachment audit', async () => {
    const service = {
      getAdminOrderAttachmentAudit: jest.fn(),
    } as unknown as OrdersService;
    const controller = new AdminOrderAttachmentsController(service);

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
