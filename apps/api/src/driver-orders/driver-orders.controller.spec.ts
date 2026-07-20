import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode } from '../common/errors';
import { DriverOrdersController } from './driver-orders.controller';
import type { DriverOrdersService } from './driver-orders.service';

const IDEMPOTENCY_KEY = '550e8400-e29b-41d4-a716-446655440000';

describe('DriverOrdersController', () => {
  it('lists the driver order hall for the authenticated driver', async () => {
    const service = {
      listOrderHall: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.listOrderHall(createRequest('driver-1'), {}),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { items: [], total: 0 },
    });
    expect(service.listOrderHall).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      { page: 1, pageSize: 20 },
    );
  });

  it('gets current driver acceptance settings', async () => {
    const service = {
      getAcceptanceSettings: jest.fn().mockResolvedValue({
        driverId: 'driver-1',
        isOnline: true,
        maxDistanceKm: 50,
        vehicleTypePreferences: ['medium', 'box'],
        createdAtIso: '2026-07-09T02:00:00.000Z',
        updatedAtIso: '2026-07-09T02:00:00.000Z',
      }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.getAcceptanceSettings(createRequest('driver-1')),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        driverId: 'driver-1',
        isOnline: true,
        maxDistanceKm: 50,
      },
    });
    expect(service.getAcceptanceSettings).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
    );
  });

  it('saves current driver acceptance settings', async () => {
    const service = {
      saveAcceptanceSettings: jest.fn().mockResolvedValue({
        driverId: 'driver-1',
        isOnline: false,
        maxDistanceKm: 30,
        vehicleTypePreferences: ['medium'],
        createdAtIso: '2026-07-09T02:00:00.000Z',
        updatedAtIso: '2026-07-09T02:05:00.000Z',
      }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.saveAcceptanceSettings(createRequest('driver-1'), {
        isOnline: false,
        maxDistanceKm: 30,
        vehicleTypePreferences: [' medium ', 'medium'],
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        isOnline: false,
        maxDistanceKm: 30,
        vehicleTypePreferences: ['medium'],
      },
    });
    expect(service.saveAcceptanceSettings).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      {
        isOnline: false,
        maxDistanceKm: 30,
        vehicleTypePreferences: ['medium'],
      },
    );
  });

  it('gets current driver income overview', async () => {
    const service = {
      getIncomeOverview: jest.fn().mockResolvedValue({
        driverId: 'driver-1',
        summary: {
          todayIncomeCents: 36100,
          weekIncomeCents: 36100,
          monthIncomeCents: 36100,
          historyIncomeCents: 36100,
          pendingSettlementCents: 72200,
          availableWithdrawalCents: 24100,
          reviewingWithdrawalCents: 12000,
          completedOrderCount: 1,
        },
        records: [],
      }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.getIncomeOverview(createRequest('driver-1')),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        driverId: 'driver-1',
        summary: {
          availableWithdrawalCents: 24100,
          completedOrderCount: 1,
        },
      },
    });
    expect(service.getIncomeOverview).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
    );
  });

  it('lists current driver withdrawals', async () => {
    const service = {
      listWithdrawals: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'withdrawal-1',
            status: 'reviewing',
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.listWithdrawals(createRequest('driver-1'), {}),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        items: [{ id: 'withdrawal-1', status: 'reviewing' }],
        total: 1,
      },
    });
    expect(service.listWithdrawals).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      { page: 1, pageSize: 20 },
    );
  });

  it('creates a driver withdrawal with a normalized request', async () => {
    const service = {
      createWithdrawal: jest.fn().mockResolvedValue({
        id: 'withdrawal-1',
        amountCents: 12000,
      }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.createWithdrawal(
        createRequest('driver-1'),
        IDEMPOTENCY_KEY,
        {
          amountCents: 12000,
          bankAccountName: '  李师傅  ',
          bankName: '  招商银行深圳宝安支行  ',
          bankAccountNo: '  6225 8888 0000 1234  ',
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'withdrawal-1', amountCents: 12000 },
    });
    expect(service.createWithdrawal).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      IDEMPOTENCY_KEY,
      {
        amountCents: 12000,
        bankAccountName: '李师傅',
        bankName: '招商银行深圳宝安支行',
        bankAccountNo: '6225888800001234',
      },
    );
  });

  it('rejects a missing withdrawal idempotency key before service I/O', async () => {
    const service = {
      createWithdrawal: jest.fn(),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.createWithdrawal(createRequest('driver-1'), undefined, {
        amountCents: 12000,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountNo: '6225888800001234',
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.IDEMPOTENCY_KEY_INVALID });
    expect(service.createWithdrawal).not.toHaveBeenCalled();
  });

  it('quotes an order for the authenticated driver', async () => {
    const service = {
      quoteOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.quoteOrder(createRequest('driver-1'), 'order-1', {
        quoteCents: 88000,
        arrivalText: '45 分钟到达',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1' },
    });
    expect(service.quoteOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      'order-1',
      { quoteCents: 88000, arrivalText: '45 分钟到达' },
    );
  });

  it('rejects non-driver order hall access before parsing query data', async () => {
    const service = {
      listOrderHall: jest.fn(),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.listOrderHall(createRequest('shipper-1', 'shipper'), {
        page: '0',
      }),
    ).rejects.toMatchObject({
      code: ApiErrorCode.AUTH_FORBIDDEN,
      message: '当前账号不是司机',
    });
    expect(service.listOrderHall).not.toHaveBeenCalled();
  });

  it('rejects non-driver quotes before parsing request data', async () => {
    const service = {
      quoteOrder: jest.fn(),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.quoteOrder(
        createRequest('shipper-1', 'shipper'),
        'order-1',
        {} as never,
      ),
    ).rejects.toMatchObject({
      code: ApiErrorCode.AUTH_FORBIDDEN,
      message: '当前账号不是司机',
    });
    expect(service.quoteOrder).not.toHaveBeenCalled();
  });

  it('accepts an order for the authenticated driver', async () => {
    const service = {
      acceptOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.acceptOrder(
        createRequest('driver-1'),
        'order-1',
        IDEMPOTENCY_KEY,
        {
          noteText: '马上联系货主',
          baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1' },
    });
    expect(service.acceptOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      'order-1',
      IDEMPOTENCY_KEY,
      {
        noteText: '马上联系货主',
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      },
    );
  });

  it('lists current driver accepted orders', async () => {
    const service = {
      listMyOrders: jest.fn().mockResolvedValue({
        items: [{ id: 'order-1', status: 'loading' }],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.listMyOrders(createRequest('driver-1'), {}),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { items: [{ id: 'order-1', status: 'loading' }], total: 1 },
    });
    expect(service.listMyOrders).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      { statuses: ['loading', 'transporting', 'confirming'], page: 1, pageSize: 20 },
    );
  });

  it('gets current driver order detail', async () => {
    const service = {
      getOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.getOrder(createRequest('driver-1'), 'order-1'),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1' },
    });
    expect(service.getOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      'order-1',
    );
  });

  it('advances current driver order status', async () => {
    const service = {
      advanceOrderStatus: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'transporting',
      }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.advanceOrderStatus(
        createRequest('driver-1'),
        'order-1',
        IDEMPOTENCY_KEY,
        {
          nextStatus: 'transporting',
          baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1', status: 'transporting' },
    });
    expect(service.advanceOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      'order-1',
      IDEMPOTENCY_KEY,
      {
        nextStatus: 'transporting',
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      },
    );
  });

  it('passes receiptPhotoFileIds through the advance status endpoint', async () => {
    const service = {
      advanceOrderStatus: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'transporting',
      }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await controller.advanceOrderStatus(
      createRequest('driver-1'),
      'order-1',
      IDEMPOTENCY_KEY,
      {
        nextStatus: 'transporting',
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        receiptPhotoFileIds: ['file-receipt-1'],
      },
    );

    expect(service.advanceOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      'order-1',
      IDEMPOTENCY_KEY,
      {
        nextStatus: 'transporting',
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        receiptPhotoFileIds: ['file-receipt-1'],
      },
    );
  });

  it('rejects missing idempotency keys before mutating driver orders', async () => {
    const service = {
      acceptOrder: jest.fn(),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.acceptOrder(createRequest('driver-1'), 'order-1', undefined, {
        noteText: '马上联系货主',
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      code: ApiErrorCode.IDEMPOTENCY_KEY_INVALID,
      message: 'Idempotency-Key 无效',
    });
    expect(service.acceptOrder).not.toHaveBeenCalled();
  });

  it('reports an exception for the authenticated driver', async () => {
    const service = {
      reportException: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'loading',
      }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.reportException(createRequest('driver-1'), 'order-1', {
        typeLabel: ' 货物损坏 ',
        description: ' 装货时发现外包装已经破损。 ',
        photoFileIds: [' file-1 ', 'file-1'],
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1', status: 'loading' },
    });

    expect(service.reportException).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      'order-1',
      {
        typeLabel: '货物损坏',
        description: '装货时发现外包装已经破损。',
        photoFileIds: ['file-1'],
      },
    );
  });

  it('rejects non-driver exception reports before service invocation', async () => {
    const service = {
      reportException: jest.fn(),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.reportException(
        createRequest('shipper-1', 'shipper'),
        'order-1',
        {} as never,
      ),
    ).rejects.toMatchObject({
      code: ApiErrorCode.AUTH_FORBIDDEN,
      message: '当前账号不是司机',
    });
    expect(service.reportException).not.toHaveBeenCalled();
  });

  it('replies to an evaluated order for the authenticated driver', async () => {
    const service = {
      replyToEvaluation: jest.fn().mockResolvedValue({
        id: 'order-1',
      }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.replyToEvaluation(createRequest('driver-1'), 'order-1', {
        content: '  谢谢认可，后续继续保持。  ',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1' },
    });
    expect(service.replyToEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      'order-1',
      {
        content: '谢谢认可，后续继续保持。',
      },
    );
  });

  it('submits a shipper evaluation for the authenticated driver', async () => {
    const service = {
      evaluateShipper: jest.fn().mockResolvedValue({
        id: 'order-1',
      }),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.evaluateShipper(createRequest('driver-1'), 'order-1', {
        rating: 5,
        tags: [' 沟通顺畅 ', '装货配合', '沟通顺畅'],
        content: '  货主装货配合好，结算沟通清楚。  ',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1' },
    });
    expect(service.evaluateShipper).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      'order-1',
      {
        rating: 5,
        tags: ['沟通顺畅', '装货配合'],
        content: '货主装货配合好，结算沟通清楚。',
      },
    );
  });

  it('rejects non-driver evaluation replies before parsing request data', async () => {
    const service = {
      replyToEvaluation: jest.fn(),
    } as unknown as DriverOrdersService;
    const controller = new DriverOrdersController(service);

    await expect(
      controller.replyToEvaluation(
        createRequest('shipper-1', 'shipper'),
        'order-1',
        {} as never,
      ),
    ).rejects.toMatchObject({
      code: ApiErrorCode.AUTH_FORBIDDEN,
      message: '当前账号不是司机',
    });
    expect(service.replyToEvaluation).not.toHaveBeenCalled();
  });
});

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'driver',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_driver_order_test' },
    currentUser: { id: userId, phone: '13900139009', userType },
  };
}
