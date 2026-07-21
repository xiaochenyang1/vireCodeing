import type { AuthenticatedRequest } from '../auth/access-token.guard';
import {
  AdminOrderExceptionCasesController,
  DriverOrderExceptionCasesController,
  ShipperOrderExceptionCasesController,
} from './order-exception-cases.controller';

describe('order exception case controllers', () => {
  const service = {
    listForShipper: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    listForDriver: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    listForAdmin: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getForAdmin: jest.fn().mockResolvedValue({ id: 'case-1' }),
    processCase: jest.fn().mockResolvedValue({ id: 'case-1', status: 'processing' }),
    resolveCase: jest.fn().mockResolvedValue({ id: 'case-1', status: 'resolved' }),
    closeCase: jest.fn().mockResolvedValue({ id: 'case-1', status: 'closed' }),
    executeCompensation: jest
      .fn()
      .mockResolvedValue({ id: 'case-1', compensationStatus: 'executed' }),
    appealForShipper: jest
      .fn()
      .mockResolvedValue({ id: 'case-1', status: 'processing', appealStatus: 'requested' }),
    appealForDriver: jest
      .fn()
      .mockResolvedValue({ id: 'case-1', status: 'processing', appealStatus: 'requested' }),
  };

  beforeEach(() => jest.clearAllMocks());

  it('lists shipper and driver cases using the authenticated user', async () => {
    const shipperController = new ShipperOrderExceptionCasesController(
      service as never,
    );
    const driverController = new DriverOrderExceptionCasesController(
      service as never,
    );

    await shipperController.listCases(createRequest('shipper-1', 'shipper'), ' order-1 ');
    await driverController.listCases(createRequest('driver-1', 'driver'), ' order-1 ');

    expect(service.listForShipper).toHaveBeenCalledWith('shipper-1', 'order-1');
    expect(service.listForDriver).toHaveBeenCalledWith('driver-1', 'order-1');
  });

  it('lists and gets cases for an administrator', async () => {
    const controller = new AdminOrderExceptionCasesController(service as never);

    await controller.listCases(createRequest('admin-1', 'admin'), {
      status: 'pending',
    });
    await controller.getCase(createRequest('admin-1', 'admin'), ' case-1 ');

    expect(service.listForAdmin).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: 'pending',
    });
    expect(service.getForAdmin).toHaveBeenCalledWith('case-1');
  });

  it.each([
    ['processCase', 'processCase', 'processing'],
    ['closeCase', 'closeCase', 'closed'],
  ] as const)('calls %s with normalized mutation input', async (method, serviceMethod, status) => {
    const controller = new AdminOrderExceptionCasesController(service as never);
    const result = await controller[method](
      createRequest('admin-1', 'admin'),
      ' case-1 ',
      {
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        content: '  客服已经联系双方核实情况。  ',
      },
    );

    expect(service[serviceMethod]).toHaveBeenCalledWith('admin-1', 'case-1', {
      baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      content: '客服已经联系双方核实情况。',
    });
    expect(result.data).toMatchObject({ status });
  });

  it('calls resolveCase with compensation tracking input', async () => {
    const controller = new AdminOrderExceptionCasesController(service as never);
    const result = await controller.resolveCase(
      createRequest('admin-1', 'admin'),
      ' case-1 ',
      {
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        content: '  客服确认需要后续赔付。  ',
        compensationStatus: 'pending',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 3600,
      },
    );

    expect(service.resolveCase).toHaveBeenCalledWith('admin-1', 'case-1', {
      baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      content: '客服确认需要后续赔付。',
      compensationStatus: 'pending',
      compensationTargetRole: 'shipper',
      compensationAmountCents: 3600,
    });
    expect(result.data).toMatchObject({ status: 'resolved' });
  });
});

function createRequest(
  id: string,
  userType: 'shipper' | 'driver' | 'admin',
) {
  return {
    currentUser: { id, phone: '13900139009', userType },
    headers: { 'x-request-id': 'req-exception-case' },
  } as unknown as AuthenticatedRequest;
}
