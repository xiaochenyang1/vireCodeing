import { InMemoryOrdersRepository } from '../orders/orders.repository';
import { OrderExceptionCaseOverdueEscalationService } from './order-exception-case-overdue-escalation.service';
import { OrderExceptionCasesService } from './order-exception-cases.service';

describe('OrderExceptionCaseOverdueEscalationService', () => {
  it('escalates overdue acceptance and resolution queues with system audit actions', async () => {
    let currentTime = new Date('2026-07-12T12:00:00.000Z');
    const repository = new InMemoryOrdersRepository(() => currentTime);
    const notificationsService = {
      notifyExceptionEvent: jest.fn().mockResolvedValue(undefined),
    };
    const sweepService = new OrderExceptionCaseOverdueEscalationService(
      repository,
      () => new Date('2026-07-12T13:00:00.000Z'),
      notificationsService,
    );
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());

    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '司机延误',
      description: '第一张异常工单已超时待受理。',
    });
    const acceptanceOverdue = (await repository.listOrderExceptionCases(order.id)).items[0];

    currentTime = new Date('2026-07-12T08:00:00.000Z');
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货损',
      description: '第二张异常工单进入处理中后超时。',
    });
    const resolutionCandidate = (await repository.listOrderExceptionCases(order.id)).items.find(
      item => item.id !== acceptanceOverdue.id,
    );

    if (!resolutionCandidate) {
      throw new Error('resolution candidate missing');
    }

    currentTime = new Date('2026-07-12T08:30:00.000Z');
    const processing = await repository.transitionOrderExceptionCase(
      resolutionCandidate.id,
      'admin-1',
      'pending',
      'processing',
      {
        baseUpdatedAtIso: resolutionCandidate.updatedAtIso,
        content: '客服已经联系双方核实异常情况。',
      },
    );

    expect(processing).toMatchObject({ status: 'processing' });

    await expect(sweepService.sweepOverdueCases('admin')).resolves.toEqual({
      trigger: 'admin',
      triggeredAtIso: '2026-07-12T13:00:00.000Z',
      scannedCount: 2,
      overdueCount: 2,
      escalatedCount: 2,
      skippedCount: 0,
      conflictCount: 0,
      escalatedCaseIds: expect.arrayContaining([
        acceptanceOverdue.id,
        resolutionCandidate.id,
      ]),
    });

    await expect(repository.findOrderExceptionCaseById(acceptanceOverdue.id)).resolves.toEqual(
      expect.objectContaining({
        status: 'pending',
        actions: expect.arrayContaining([
          expect.objectContaining({
            adminUserId: 'system:auto-escalation:acceptance',
            fromStatus: 'pending',
            toStatus: 'pending',
            content:
              expect.stringContaining('受理 SLA 已超时'),
          }),
        ]),
      }),
    );
    await expect(repository.findOrderExceptionCaseById(resolutionCandidate.id)).resolves.toEqual(
      expect.objectContaining({
        status: 'processing',
        actions: expect.arrayContaining([
          expect.objectContaining({
            adminUserId: 'system:auto-escalation:resolution',
            fromStatus: 'processing',
            toStatus: 'processing',
            content:
              expect.stringContaining('解决 SLA 已超时'),
          }),
        ]),
      }),
    );
    expect(notificationsService.notifyExceptionEvent).toHaveBeenNthCalledWith(
      1,
      {
        event: 'exception_case_overdue_escalated',
        caseId: acceptanceOverdue.id,
        caseNo: acceptanceOverdue.caseNo,
        orderId: acceptanceOverdue.orderId,
        orderNo: acceptanceOverdue.orderNo,
        shipperId: 'shipper-1',
        driverId: undefined,
        slaStage: 'acceptance',
        overdueMinutes: 45,
      },
    );
    expect(notificationsService.notifyExceptionEvent).toHaveBeenNthCalledWith(
      2,
      {
        event: 'exception_case_overdue_escalated',
        caseId: resolutionCandidate.id,
        caseNo: resolutionCandidate.caseNo,
        orderId: resolutionCandidate.orderId,
        orderNo: resolutionCandidate.orderNo,
        shipperId: 'shipper-1',
        driverId: undefined,
        slaStage: 'resolution',
        overdueMinutes: 30,
      },
    );
  });

  it('does not append duplicate escalation actions for the same overdue stage', async () => {
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-12T12:00:00.000Z'),
    );
    const sweepService = new OrderExceptionCaseOverdueEscalationService(
      repository,
      () => new Date('2026-07-12T13:00:00.000Z'),
    );
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());

    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '司机延误',
      description: '异常工单已超时待受理。',
    });
    const exceptionCase = (await repository.listOrderExceptionCases(order.id)).items[0];

    await sweepService.sweepOverdueCases('admin');

    await expect(sweepService.sweepOverdueCases('scheduler')).resolves.toEqual({
      trigger: 'scheduler',
      triggeredAtIso: '2026-07-12T13:00:00.000Z',
      scannedCount: 1,
      overdueCount: 1,
      escalatedCount: 0,
      skippedCount: 1,
      conflictCount: 0,
      escalatedCaseIds: [],
    });
    await expect(repository.findOrderExceptionCaseById(exceptionCase.id)).resolves.toEqual(
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            adminUserId: 'system:auto-escalation:acceptance',
          }),
        ]),
      }),
    );
  });

  it('keeps resolution SLA anchored to the original processing transition after escalation', async () => {
    let currentTime = new Date('2026-07-12T08:00:00.000Z');
    const repository = new InMemoryOrdersRepository(() => currentTime);
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());

    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货损',
      description: '异常工单进入处理中后超时。',
    });
    const created = (await repository.listOrderExceptionCases(order.id)).items[0];

    currentTime = new Date('2026-07-12T08:30:00.000Z');
    await repository.transitionOrderExceptionCase(
      created.id,
      'admin-1',
      'pending',
      'processing',
      {
        baseUpdatedAtIso: created.updatedAtIso,
        content: '客服已经联系双方核实异常情况。',
      },
    );

    const sweepService = new OrderExceptionCaseOverdueEscalationService(
      repository,
      () => new Date('2026-07-12T13:00:00.000Z'),
    );
    await sweepService.sweepOverdueCases('admin');

    const caseService = new OrderExceptionCasesService(
      repository,
      undefined,
      () => new Date('2026-07-12T13:00:00.000Z'),
    );

    await expect(caseService.getForAdmin(created.id)).resolves.toMatchObject({
      status: 'processing',
      sla: {
        policyKey: 'exception_case_default_v1',
        stage: 'resolution',
        status: 'overdue',
        targetAtIso: '2026-07-12T12:30:00.000Z',
        overdueMinutes: 30,
      },
    });
  });

  it('does not fail the sweep when overdue escalation notifications fail', async () => {
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-12T12:00:00.000Z'),
    );
    const notificationsService = {
      notifyExceptionEvent: jest
        .fn()
        .mockRejectedValue(new Error('push failed')),
    };
    const sweepService = new OrderExceptionCaseOverdueEscalationService(
      repository,
      () => new Date('2026-07-12T13:00:00.000Z'),
      notificationsService,
    );
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());

    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '司机延误',
      description: '异常工单已超时待受理。',
    });

    await expect(sweepService.sweepOverdueCases('admin')).resolves.toMatchObject(
      {
        escalatedCount: 1,
        conflictCount: 0,
      },
    );
    expect(notificationsService.notifyExceptionEvent).toHaveBeenCalledTimes(1);
    await expect(repository.listOrderExceptionCases(order.id)).resolves.toMatchObject(
      {
        items: [
          expect.objectContaining({
            actions: expect.arrayContaining([
              expect.objectContaining({
                adminUserId: 'system:auto-escalation:acceptance',
              }),
            ]),
          }),
        ],
      },
    );
  });
});

function createOrderInput() {
  return {
    cargoType: 'build',
    weightText: '2.5 吨',
    quantityText: '12 箱',
    pickupAddress: '宝安区福永物流园',
    pickupContact: '赵经理',
    pickupPhone: '13900139001',
    deliveryAddress: '龙岗区坂田仓',
    deliveryContact: '钱店长',
    deliveryPhone: '13900139002',
    vehicleRequirement: 'medium',
    needTailboard: false,
    needTarp: false,
    pickupTimeIso: '2026-07-12T09:00:00.000Z',
    pricingMode: 'fixed' as const,
    priceCents: 76000,
    paymentMethod: 'cod' as const,
  };
}
