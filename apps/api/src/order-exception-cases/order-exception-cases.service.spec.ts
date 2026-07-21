import { ApiErrorCode, BusinessError } from '../common/errors';
import { InMemoryOrdersRepository } from '../orders/orders.repository';
import { OrderExceptionCasesService } from './order-exception-cases.service';

describe('OrderExceptionCasesService', () => {
  const now = new Date('2026-07-12T08:00:00.000Z');

  async function createCase() {
    const repository = new InMemoryOrdersRepository(() => now);
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    await repository.reportDriverOrderException(order.id, 'driver-1', {
      typeLabel: '货物损坏',
      description: '装货时发现外包装已经破损。',
    });
    const snapshot = await repository.listOrderExceptionCases(order.id);

    return {
      repository,
      order,
      exceptionCase: snapshot.items[0],
      service: new OrderExceptionCasesService(repository),
    };
  }

  it('lets the order shipper and accepted driver read case progress', async () => {
    const { order, service } = await createCase();

    await expect(service.listForShipper('shipper-1', order.id)).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ sourceRole: 'driver' })],
    });
    await expect(service.listForDriver('driver-1', order.id)).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ orderId: order.id })],
    });
  });

  it('hides cases from unrelated shippers and drivers', async () => {
    const { order, service } = await createCase();

    await expect(service.listForShipper('shipper-2', order.id)).rejects.toEqual(
      new BusinessError(ApiErrorCode.EXCEPTION_CASE_NOT_FOUND, '异常工单不存在'),
    );
    await expect(service.listForDriver('driver-2', order.id)).rejects.toEqual(
      new BusinessError(ApiErrorCode.EXCEPTION_CASE_NOT_FOUND, '异常工单不存在'),
    );
  });

  it('processes, resolves and closes a case with public action history', async () => {
    const { exceptionCase, service } = await createCase();

    const processing = await service.processCase('admin-1', exceptionCase.id, {
      baseUpdatedAtIso: exceptionCase.updatedAtIso,
      content: '客服已经联系司机核实异常情况。',
    });
    const resolved = await service.resolveCase('admin-1', exceptionCase.id, {
      baseUpdatedAtIso: processing.updatedAtIso,
      content: '双方确认外包装破损但货物完好。',
      compensationStatus: 'pending',
      compensationTargetRole: 'shipper',
      compensationAmountCents: 3600,
    });
    const closed = await service.closeCase('admin-1', exceptionCase.id, {
      baseUpdatedAtIso: resolved.updatedAtIso,
      content: '双方已确认处理结果，工单关闭。',
    });

    expect(closed).toMatchObject({
      status: 'closed',
      resolutionText: '双方确认外包装破损但货物完好。',
      compensationStatus: 'pending',
      compensationTargetRole: 'shipper',
      compensationAmountCents: 3600,
      actions: [
        expect.objectContaining({ fromStatus: 'pending', toStatus: 'processing' }),
        expect.objectContaining({ fromStatus: 'processing', toStatus: 'resolved' }),
        expect.objectContaining({ fromStatus: 'resolved', toStatus: 'closed' }),
      ],
    });
  });

  it('rejects stale versions and invalid transitions without mutation', async () => {
    const { exceptionCase, service } = await createCase();
    const staleUpdatedAtIso = exceptionCase.updatedAtIso;

    await expect(
      service.resolveCase('admin-1', exceptionCase.id, {
        baseUpdatedAtIso: exceptionCase.updatedAtIso,
        content: '试图跳过受理阶段直接解决工单。',
        compensationStatus: 'not_required',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前异常工单状态不允许执行该操作',
      ),
    );

    const processing = await service.processCase('admin-1', exceptionCase.id, {
      baseUpdatedAtIso: staleUpdatedAtIso,
      content: '客服已经联系司机核实异常情况。',
    });

    await expect(
      service.resolveCase('admin-2', exceptionCase.id, {
        baseUpdatedAtIso: staleUpdatedAtIso,
        content: '使用过期页面提交解决结果。',
        compensationStatus: 'not_required',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_CONFLICT,
        '异常工单已被其他管理员更新，请刷新后重试',
      ),
    );
    await expect(service.getForAdmin(exceptionCase.id)).resolves.toMatchObject({
      status: processing.status,
      actions: [expect.objectContaining({ toStatus: 'processing' })],
    });
  });

  async function resolvePendingCompensation() {
    const context = await createCase();
    const { exceptionCase, service } = context;
    const processing = await service.processCase('admin-1', exceptionCase.id, {
      baseUpdatedAtIso: exceptionCase.updatedAtIso,
      content: '客服已经联系司机核实异常情况。',
    });
    const resolved = await service.resolveCase('admin-1', exceptionCase.id, {
      baseUpdatedAtIso: processing.updatedAtIso,
      content: '双方确认货物受损，需向货主赔付。',
      compensationStatus: 'pending',
      compensationTargetRole: 'shipper',
      compensationAmountCents: 3600,
    });

    return { ...context, resolved };
  }

  it('executes a resolved pending compensation through the ledger', async () => {
    const { exceptionCase, service, resolved } =
      await resolvePendingCompensation();

    const executed = await service.executeCompensation(
      'admin-1',
      exceptionCase.id,
      'req-comp-1',
      {
        baseUpdatedAtIso: resolved.updatedAtIso,
        idempotencyKey: 'idem-comp-service-1',
        content: '平台已线下向货主完成赔付结清。',
      },
    );

    expect(executed).toMatchObject({
      compensationStatus: 'executed',
      compensationTargetRole: 'shipper',
      compensationAmountCents: 3600,
    });
    expect(executed.compensationTransactionId).toBeDefined();
  });

  it('rejects executing compensation that was never marked pending', async () => {
    const { exceptionCase, service } = await createCase();
    const processing = await service.processCase('admin-1', exceptionCase.id, {
      baseUpdatedAtIso: exceptionCase.updatedAtIso,
      content: '客服已经联系司机核实异常情况。',
    });
    const resolved = await service.resolveCase('admin-1', exceptionCase.id, {
      baseUpdatedAtIso: processing.updatedAtIso,
      content: '双方确认无需赔付。',
      compensationStatus: 'not_required',
    });

    await expect(
      service.executeCompensation('admin-1', exceptionCase.id, 'req-comp-2', {
        baseUpdatedAtIso: resolved.updatedAtIso,
        idempotencyKey: 'idem-comp-service-2',
        content: '试图对无需赔付的工单执行赔付。',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_COMPENSATION_NOT_EXECUTABLE,
        '当前异常工单状态不允许执行赔付',
      ),
    );
  });

  it('rejects a second execution of an already executed compensation', async () => {
    const { exceptionCase, service, resolved } =
      await resolvePendingCompensation();
    await service.executeCompensation('admin-1', exceptionCase.id, 'req-comp-3', {
      baseUpdatedAtIso: resolved.updatedAtIso,
      idempotencyKey: 'idem-comp-service-3',
      content: '平台已线下向货主完成赔付结清。',
    });

    const executedCase = await service.getForAdmin(exceptionCase.id);

    await expect(
      service.executeCompensation('admin-1', exceptionCase.id, 'req-comp-4', {
        baseUpdatedAtIso: executedCase.updatedAtIso,
        idempotencyKey: 'idem-comp-service-4',
        content: '试图对已执行赔付的工单重复执行。',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_COMPENSATION_ALREADY_EXECUTED,
        '该异常工单赔付已执行，不能重复赔付',
      ),
    );
  });

  it('lets the shipper appeal a resolved case back to processing', async () => {
    const { order, exceptionCase, service, resolved } =
      await resolvePendingCompensation();

    const appealed = await service.appealForShipper(
      'shipper-1',
      order.id,
      exceptionCase.id,
      {
        baseUpdatedAtIso: resolved.updatedAtIso,
        reason: '货主认为赔付金额过低，申请重新核定。',
      },
    );

    expect(appealed).toMatchObject({
      status: 'processing',
      appealStatus: 'requested',
    });
  });

  it('rejects an appeal from an unrelated driver with not found', async () => {
    const { order, exceptionCase, service, resolved } =
      await resolvePendingCompensation();

    await expect(
      service.appealForDriver('driver-9', order.id, exceptionCase.id, {
        baseUpdatedAtIso: resolved.updatedAtIso,
        reason: '无关司机试图申诉他人订单工单。',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.EXCEPTION_CASE_NOT_FOUND, '异常工单不存在'),
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
