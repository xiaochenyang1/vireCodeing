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
