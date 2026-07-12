import { InMemoryOrdersRepository } from './orders.repository';

describe('InMemoryOrdersRepository exception cases', () => {
  it('filters admin case lists and preserves case action ordering', async () => {
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-12T08:00:00.000Z'),
    );
    const order = await repository.createOrder('shipper-1', createOrderInput());
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '司机延误',
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
    });
    const created = (await repository.listOrderExceptionCases(order.id)).items[0];
    const processing = await repository.transitionOrderExceptionCase(
      created.id,
      'admin-1',
      'pending',
      'processing',
      {
        baseUpdatedAtIso: created.updatedAtIso,
        content: '客服已经联系双方核实异常情况。',
      },
    );

    expect(processing).toMatchObject({
      status: 'processing',
      actions: [expect.objectContaining({ toStatus: 'processing' })],
    });
    await expect(
      repository.listAdminOrderExceptionCases({
        page: 1,
        pageSize: 20,
        status: 'processing',
        sourceRole: 'shipper',
        keyword: order.orderNo,
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: created.id })],
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
