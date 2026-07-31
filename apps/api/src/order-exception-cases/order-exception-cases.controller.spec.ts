import type { AuthenticatedRequest } from '../auth/access-token.guard';
import {
  AdminOrderExceptionCasesController,
  DriverOrderExceptionCasesController,
  OrderExceptionCaseAttachmentPreviewsController,
  ShipperOrderExceptionCasesController,
} from './order-exception-cases.controller';
import type { OrderExceptionCaseOverdueEscalationService } from './order-exception-case-overdue-escalation.service';

describe('order exception case controllers', () => {
  const service = {
    listForShipper: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    listForDriver: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    listForAdmin: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getForAdmin: jest.fn().mockResolvedValue({ id: 'case-1' }),
    claimCase: jest
      .fn()
      .mockResolvedValue({ id: 'case-1', claimedByAdminUserId: 'admin-1' }),
    takeoverCase: jest
      .fn()
      .mockResolvedValue({ id: 'case-1', claimedByAdminUserId: 'admin-1' }),
    assignCase: jest
      .fn()
      .mockResolvedValue({ id: 'case-1', claimedByAdminUserId: 'admin-2' }),
    unclaimCase: jest.fn().mockResolvedValue({ id: 'case-1' }),
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
    getAttachmentPreview: jest.fn().mockResolvedValue({
      fileId: 'file-1',
      previewUrl: '/api/files/preview-contents/file-1?signature=fresh',
      previewExpiresAtIso: '2026-07-31T08:10:00.000Z',
    }),
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

  it('gets an exception case attachment preview for the current participant', async () => {
    const controller = new OrderExceptionCaseAttachmentPreviewsController(
      service as never,
    );
    const request = createRequest('shipper-1', 'shipper');

    await expect(
      controller.getAttachmentPreview(
        request,
        ' order-1 ',
        ' case-1 ',
        ' file-1 ',
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { fileId: 'file-1' },
    });
    expect(service.getAttachmentPreview).toHaveBeenCalledWith(
      request.currentUser,
      'order-1',
      'case-1',
      'file-1',
    );
  });

  it('lists and gets cases for an administrator', async () => {
    const controller = new AdminOrderExceptionCasesController(
      service as never,
      createOverdueEscalationService(),
    );

    await controller.listCases(createRequest('admin-1', 'admin'), {
      status: 'pending',
      compensationStatus: 'pending',
      appealStatus: 'requested',
      slaStatus: 'overdue',
      claimStatus: 'claimed',
      claimedByAdminUserId: 'admin-2',
    });
    await controller.getCase(createRequest('admin-1', 'admin'), ' case-1 ');

    expect(service.listForAdmin).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: 'pending',
      compensationStatus: 'pending',
      appealStatus: 'requested',
      slaStatus: 'overdue',
      claimStatus: 'claimed',
      claimedByAdminUserId: 'admin-2',
    });
    expect(service.getForAdmin).toHaveBeenCalledWith('case-1');
  });

  it('claims a case for the authenticated administrator', async () => {
    const controller = new AdminOrderExceptionCasesController(
      service as never,
      createOverdueEscalationService(),
    );
    const result = await controller.claimCase(
      createRequest('admin-1', 'admin'),
      ' case-1 ',
      {
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        content: '  当前客服先认领跟进。  ',
      },
    );

    expect(service.claimCase).toHaveBeenCalledWith('admin-1', 'case-1', {
      baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      content: '当前客服先认领跟进。',
    });
    expect(result.data).toMatchObject({
      id: 'case-1',
      claimedByAdminUserId: 'admin-1',
    });
  });

  it('force-takes over a case for the authenticated administrator', async () => {
    const controller = new AdminOrderExceptionCasesController(
      service as never,
      createOverdueEscalationService(),
    );
    const result = await controller.takeoverCase(
      createRequest('admin-1', 'admin'),
      ' case-1 ',
      {
        baseUpdatedAtIso: '2026-07-12T08:05:00.000Z',
        content: ' 主管改派给当前客服继续跟进。 ',
      },
    );

    expect(service.takeoverCase).toHaveBeenCalledWith('admin-1', 'case-1', {
      baseUpdatedAtIso: '2026-07-12T08:05:00.000Z',
      content: '主管改派给当前客服继续跟进。',
    });
    expect(result.data).toMatchObject({
      id: 'case-1',
      claimedByAdminUserId: 'admin-1',
    });
  });

  it('assigns a case to the specified administrator', async () => {
    const controller = new AdminOrderExceptionCasesController(
      service as never,
      createOverdueEscalationService(),
    );
    const result = await controller.assignCase(
      createRequest('admin-1', 'admin'),
      ' case-1 ',
      {
        baseUpdatedAtIso: '2026-07-12T08:10:00.000Z',
        targetAdminUserId: ' admin-2 ',
        content: '  白班客服继续跟进。  ',
      },
    );

    expect(service.assignCase).toHaveBeenCalledWith('admin-1', 'case-1', {
      baseUpdatedAtIso: '2026-07-12T08:10:00.000Z',
      targetAdminUserId: 'admin-2',
      content: '白班客服继续跟进。',
    });
    expect(result.data).toMatchObject({
      id: 'case-1',
      claimedByAdminUserId: 'admin-2',
    });
  });

  it('releases a case claim for the authenticated administrator', async () => {
    const controller = new AdminOrderExceptionCasesController(
      service as never,
      createOverdueEscalationService(),
    );
    const result = await controller.unclaimCase(
      createRequest('admin-1', 'admin'),
      ' case-1 ',
      {
        baseUpdatedAtIso: '2026-07-12T08:20:00.000Z',
        content: '  当前班次切换，先释放给公共队列。  ',
      },
    );

    expect(service.unclaimCase).toHaveBeenCalledWith('admin-1', 'case-1', {
      baseUpdatedAtIso: '2026-07-12T08:20:00.000Z',
      content: '当前班次切换，先释放给公共队列。',
    });
    expect(result.data).toMatchObject({
      id: 'case-1',
    });
    expect(result.data).not.toHaveProperty('claimedByAdminUserId');
    expect(result.data).not.toHaveProperty('claimNote');
  });

  it.each([
    ['processCase', 'processCase', 'processing'],
    ['closeCase', 'closeCase', 'closed'],
  ] as const)('calls %s with normalized mutation input', async (method, serviceMethod, status) => {
    const controller = new AdminOrderExceptionCasesController(
      service as never,
      createOverdueEscalationService(),
    );
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
    const controller = new AdminOrderExceptionCasesController(
      service as never,
      createOverdueEscalationService(),
    );
    const result = await controller.resolveCase(
      createRequest('admin-1', 'admin'),
      ' case-1 ',
      {
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        content: '  客服确认需要后续赔付。  ',
        compensationStatus: 'pending',
        appealDecision: 'accepted',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 3600,
      },
    );

    expect(service.resolveCase).toHaveBeenCalledWith('admin-1', 'case-1', {
      baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      content: '客服确认需要后续赔付。',
      compensationStatus: 'pending',
      appealDecision: 'accepted',
      compensationTargetRole: 'shipper',
      compensationAmountCents: 3600,
    });
    expect(result.data).toMatchObject({ status: 'resolved' });
  });

  it('runs overdue escalation sweep for an administrator', async () => {
    const overdueEscalationService = createOverdueEscalationService({
      sweepOverdueCases: jest.fn().mockResolvedValue({
        trigger: 'admin',
        triggeredAtIso: '2026-07-12T08:20:00.000Z',
        scannedCount: 4,
        overdueCount: 2,
        escalatedCount: 2,
        skippedCount: 0,
        conflictCount: 0,
        escalatedCaseIds: ['case-1', 'case-2'],
      }),
    });
    const controller = new AdminOrderExceptionCasesController(
      service as never,
      overdueEscalationService,
    );

    const result = await controller.sweepOverdueCases(
      createRequest('admin-1', 'admin'),
    );

    expect(overdueEscalationService.sweepOverdueCases).toHaveBeenCalledWith(
      'admin',
    );
    expect(result.data).toMatchObject({
      trigger: 'admin',
      overdueCount: 2,
      escalatedCount: 2,
      escalatedCaseIds: ['case-1', 'case-2'],
    });
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

function createOverdueEscalationService(
  overrides: Partial<
    Pick<OrderExceptionCaseOverdueEscalationService, 'sweepOverdueCases'>
  > = {},
): OrderExceptionCaseOverdueEscalationService {
  return {
    sweepOverdueCases: jest.fn(),
    ...overrides,
  } as unknown as OrderExceptionCaseOverdueEscalationService;
}
