import { ApiErrorCode, BusinessError } from '../common/errors';
import { InMemoryOrdersRepository } from '../orders/orders.repository';
import { OrderExceptionCasesService } from './order-exception-cases.service';

describe('OrderExceptionCasesService', () => {
  const now = new Date('2026-07-12T08:00:00.000Z');

  async function createCase(notificationsService?: {
    notifyExceptionEvent: jest.Mock;
  }) {
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
      service: new OrderExceptionCasesService(repository, notificationsService as never),
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

  it('surfaces recently updated exception cases first in the shipper progress list', async () => {
    let currentTime = new Date('2026-07-12T08:00:00.000Z');
    const repository = new InMemoryOrdersRepository(() => currentTime);
    const service = new OrderExceptionCasesService(repository);
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());

    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '司机延误',
      description: '第一张异常工单等待客服处理。',
    });
    const first = (await repository.listOrderExceptionCases(order.id)).items[0];

    currentTime = new Date('2026-07-12T08:05:00.000Z');
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货损',
      description: '第二张异常工单仍在待处理状态。',
    });
    const second = (await repository.listOrderExceptionCases(order.id)).items.find(
      item => item.id !== first.id,
    );

    if (!second) {
      throw new Error('second exception case missing');
    }

    currentTime = new Date('2026-07-12T08:10:00.000Z');
    await service.processCase('admin-1', first.id, {
      baseUpdatedAtIso: first.updatedAtIso,
      content: '客服已经联系司机核实异常情况。',
    });

    await expect(service.listForShipper('shipper-1', order.id)).resolves.toMatchObject({
      total: 2,
      items: [
        expect.objectContaining({
          id: first.id,
          status: 'processing',
          updatedAtIso: '2026-07-12T08:10:00.000Z',
        }),
        expect.objectContaining({
          id: second.id,
          status: 'pending',
          updatedAtIso: '2026-07-12T08:05:00.000Z',
        }),
      ],
    });
  });

  it('adds an acceptance SLA snapshot to open exception cases', async () => {
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-12T08:00:00.000Z'),
    );
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    await repository.reportDriverOrderException(order.id, 'driver-1', {
      typeLabel: '货物损坏',
      description: '装货时发现外包装已经破损。',
    });
    const service = new OrderExceptionCasesService(
      repository,
      undefined,
      () => new Date('2026-07-12T08:10:00.000Z'),
    );

    await expect(service.listForShipper('shipper-1', order.id)).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          status: 'pending',
          sla: {
            policyKey: 'exception_case_default_v1',
            stage: 'acceptance',
            status: 'within_target',
            targetAtIso: '2026-07-12T08:15:00.000Z',
            remainingMinutes: 5,
          },
        }),
      ],
    });
  });

  it('evaluates resolved exception cases against the latest processing transition', async () => {
    let currentTime = new Date('2026-07-12T08:00:00.000Z');
    const repository = new InMemoryOrdersRepository(() => currentTime);
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    await repository.reportDriverOrderException(order.id, 'driver-1', {
      typeLabel: '货物损坏',
      description: '装货时发现外包装已经破损。',
    });
    const created = (await repository.listOrderExceptionCases(order.id)).items[0];
    const service = new OrderExceptionCasesService(
      repository,
      undefined,
      () => currentTime,
    );

    currentTime = new Date('2026-07-12T08:30:00.000Z');
    const processing = await service.processCase('admin-1', created.id, {
      baseUpdatedAtIso: created.updatedAtIso,
      content: '客服已经联系司机核实异常情况。',
    });

    currentTime = new Date('2026-07-12T11:45:00.000Z');
    const resolved = await service.resolveCase('admin-1', created.id, {
      baseUpdatedAtIso: processing.updatedAtIso,
      content: '双方确认外包装破损但货物完好。',
      compensationStatus: 'not_required',
    });

    expect(resolved).toMatchObject({
      status: 'resolved',
      sla: {
        policyKey: 'exception_case_default_v1',
        stage: 'resolution',
        status: 'resolved_within_target',
        targetAtIso: '2026-07-12T12:30:00.000Z',
        remainingMinutes: 45,
      },
    });
  });

  it('filters admin exception queues by derived SLA status', async () => {
    let currentTime = new Date('2026-07-12T08:00:00.000Z');
    const repository = new InMemoryOrdersRepository(() => currentTime);
    const service = new OrderExceptionCasesService(
      repository,
      undefined,
      () => new Date('2026-07-12T08:20:00.000Z'),
    );
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());

    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '司机延误',
      description: '第一张异常工单已经超过受理时限。',
    });

    currentTime = new Date('2026-07-12T08:10:00.000Z');
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货损',
      description: '第二张异常工单仍在受理时限内。',
    });

    const result = await service.listForAdmin({
      page: 1,
      pageSize: 20,
      slaStatus: 'overdue',
    });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        description: '第一张异常工单已经超过受理时限。',
        sla: expect.objectContaining({
          stage: 'acceptance',
          status: 'overdue',
          targetAtIso: '2026-07-12T08:15:00.000Z',
          overdueMinutes: 5,
        }),
      }),
    );
  });

  it('filters admin exception queues by derived claim snapshot and SLA status', async () => {
    let currentTime = new Date('2026-07-12T08:00:00.000Z');
    const repository = new InMemoryOrdersRepository(() => currentTime);
    const service = new OrderExceptionCasesService(
      repository,
      undefined,
      () => currentTime,
    );
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());

    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '司机延误',
      description: '第一张异常工单已认领并超时。',
    });
    currentTime = new Date('2026-07-12T08:01:00.000Z');
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货损',
      description: '第二张异常工单未认领但已超时。',
    });
    currentTime = new Date('2026-07-12T08:10:00.000Z');
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '沟通异常',
      description: '第三张异常工单已认领仍在时限内。',
    });

    const snapshot = await repository.listOrderExceptionCases(order.id);
    const firstCase = snapshot.items.find(
      item => item.description === '第一张异常工单已认领并超时。',
    );
    const secondCase = snapshot.items.find(
      item => item.description === '第二张异常工单未认领但已超时。',
    );
    const thirdCase = snapshot.items.find(
      item => item.description === '第三张异常工单已认领仍在时限内。',
    );

    if (!firstCase || !secondCase || !thirdCase) {
      throw new Error('expected seeded exception cases to exist');
    }

    currentTime = new Date('2026-07-12T08:12:00.000Z');
    await service.claimCase('admin-2', firstCase.id, {
      baseUpdatedAtIso: firstCase.updatedAtIso,
      content: '客服 A 先认领。',
    });

    currentTime = new Date('2026-07-12T08:13:00.000Z');
    await service.claimCase('admin-3', thirdCase.id, {
      baseUpdatedAtIso: thirdCase.updatedAtIso,
      content: '客服 B 先认领。',
    });

    currentTime = new Date('2026-07-12T08:20:00.000Z');

    await expect(
      service.listForAdmin({
        page: 1,
        pageSize: 20,
        claimStatus: 'claimed',
      }),
    ).resolves.toMatchObject({
      total: 2,
      items: [
        expect.objectContaining({
          id: thirdCase.id,
          claimedByAdminUserId: 'admin-3',
          sla: expect.objectContaining({ status: 'within_target' }),
        }),
        expect.objectContaining({
          id: firstCase.id,
          claimedByAdminUserId: 'admin-2',
          sla: expect.objectContaining({ status: 'overdue' }),
        }),
      ],
    });

    await expect(
      service.listForAdmin({
        page: 1,
        pageSize: 20,
        claimStatus: 'unclaimed',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: secondCase.id,
          sla: expect.objectContaining({ status: 'overdue' }),
        }),
      ],
    });

    await expect(
      service.listForAdmin({
        page: 1,
        pageSize: 20,
        claimedByAdminUserId: 'admin-2',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: firstCase.id,
          claimedByAdminUserId: 'admin-2',
        }),
      ],
    });

    await expect(
      service.listForAdmin({
        page: 1,
        pageSize: 20,
        claimStatus: 'claimed',
        slaStatus: 'overdue',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: firstCase.id,
          claimedByAdminUserId: 'admin-2',
          sla: expect.objectContaining({ status: 'overdue' }),
        }),
      ],
    });
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

  it('claims an open case and surfaces the latest claim snapshot', async () => {
    const { exceptionCase, service } = await createCase();

    await expect(
      service.claimCase('admin-2', exceptionCase.id, {
        baseUpdatedAtIso: exceptionCase.updatedAtIso,
        content: '当前客服先认领跟进。',
      }),
    ).resolves.toMatchObject({
      claimedByAdminUserId: 'admin-2',
      claimNote: '当前客服先认领跟进。',
      actions: expect.arrayContaining([
        expect.objectContaining({
          adminUserId: 'admin-2',
          fromStatus: 'pending',
          toStatus: 'pending',
          content: '客服认领：当前客服先认领跟进。',
        }),
      ]),
    });
    await expect(service.getForAdmin(exceptionCase.id)).resolves.toMatchObject({
      claimedByAdminUserId: 'admin-2',
      claimNote: '当前客服先认领跟进。',
    });
  });

  it('assigns an open case to a specific admin and derives the latest claim snapshot from the assignment audit', async () => {
    const { exceptionCase, service } = await createCase();

    await expect(
      service.assignCase('admin-1', exceptionCase.id, {
        baseUpdatedAtIso: exceptionCase.updatedAtIso,
        targetAdminUserId: 'admin-3',
        content: '白班客服继续跟进。',
      }),
    ).resolves.toMatchObject({
      claimedByAdminUserId: 'admin-3',
      claimNote: '白班客服继续跟进。',
      actions: expect.arrayContaining([
        expect.objectContaining({
          adminUserId: 'admin-1',
          fromStatus: 'pending',
          toStatus: 'pending',
          content: '客服指派给 admin-3：白班客服继续跟进。',
        }),
      ]),
    });

    await expect(service.getForAdmin(exceptionCase.id)).resolves.toMatchObject({
      claimedByAdminUserId: 'admin-3',
      claimNote: '白班客服继续跟进。',
    });
  });

  it('rejects claiming a case that is already claimed by the current or another admin', async () => {
    const { exceptionCase, service } = await createCase();

    const claimed = await service.claimCase('admin-2', exceptionCase.id, {
      baseUpdatedAtIso: exceptionCase.updatedAtIso,
      content: '当前客服先认领跟进。',
    });

    await expect(
      service.claimCase('admin-2', exceptionCase.id, {
        baseUpdatedAtIso: claimed.updatedAtIso,
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前管理员已经是该异常工单的认领人，无需重复认领',
      ),
    );

    await expect(
      service.claimCase('admin-3', exceptionCase.id, {
        baseUpdatedAtIso: claimed.updatedAtIso,
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前异常工单已被其他客服认领，请使用强制接管流程',
      ),
    );
  });

  it('rejects stale claim mutations before evaluating the latest ownership snapshot', async () => {
    const { exceptionCase, service } = await createCase();
    const staleUpdatedAtIso = exceptionCase.updatedAtIso;

    await service.claimCase('admin-2', exceptionCase.id, {
      baseUpdatedAtIso: staleUpdatedAtIso,
      content: '当前客服先认领跟进。',
    });

    const staleMutations = [
      () =>
        service.claimCase('admin-2', exceptionCase.id, {
          baseUpdatedAtIso: staleUpdatedAtIso,
        }),
      () =>
        service.takeoverCase('admin-2', exceptionCase.id, {
          baseUpdatedAtIso: staleUpdatedAtIso,
        }),
      () =>
        service.assignCase('admin-1', exceptionCase.id, {
          baseUpdatedAtIso: staleUpdatedAtIso,
          targetAdminUserId: 'admin-3',
        }),
      () =>
        service.unclaimCase('admin-3', exceptionCase.id, {
          baseUpdatedAtIso: staleUpdatedAtIso,
        }),
    ];

    for (const mutate of staleMutations) {
      await expect(mutate()).rejects.toEqual(
        new BusinessError(
          ApiErrorCode.EXCEPTION_CASE_CONFLICT,
          '异常工单已被其他管理员更新，请刷新后重试',
        ),
      );
    }

    await expect(service.getForAdmin(exceptionCase.id)).resolves.toMatchObject({
      claimedByAdminUserId: 'admin-2',
      actions: [expect.objectContaining({ adminUserId: 'admin-2' })],
    });
  });

  it('lets another admin force-take over an already claimed open case', async () => {
    const { exceptionCase, service } = await createCase();

    const claimed = await service.claimCase('admin-2', exceptionCase.id, {
      baseUpdatedAtIso: exceptionCase.updatedAtIso,
      content: '当前客服先认领跟进。',
    });

    await expect(
      service.takeoverCase('admin-4', exceptionCase.id, {
        baseUpdatedAtIso: claimed.updatedAtIso,
        content: '主管改派给当前客服继续跟进。',
      }),
    ).resolves.toMatchObject({
      claimedByAdminUserId: 'admin-4',
      claimNote: '主管改派给当前客服继续跟进。',
      actions: expect.arrayContaining([
        expect.objectContaining({
          adminUserId: 'admin-4',
          fromStatus: 'pending',
          toStatus: 'pending',
          content: '客服强制接管自 admin-2：主管改派给当前客服继续跟进。',
        }),
      ]),
    });

    await expect(service.getForAdmin(exceptionCase.id)).resolves.toMatchObject({
      claimedByAdminUserId: 'admin-4',
      claimNote: '主管改派给当前客服继续跟进。',
    });
    await expect(
      service.listForAdmin({
        page: 1,
        pageSize: 20,
        claimedByAdminUserId: 'admin-4',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: exceptionCase.id })],
    });
  });

  it('rejects forcing takeover for an unclaimed case or when the current admin already owns it', async () => {
    const { exceptionCase, service } = await createCase();

    await expect(
      service.takeoverCase('admin-3', exceptionCase.id, {
        baseUpdatedAtIso: exceptionCase.updatedAtIso,
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前异常工单尚未被认领，无法强制接管',
      ),
    );

    const claimed = await service.claimCase('admin-2', exceptionCase.id, {
      baseUpdatedAtIso: exceptionCase.updatedAtIso,
      content: '当前客服先认领跟进。',
    });

    await expect(
      service.takeoverCase('admin-2', exceptionCase.id, {
        baseUpdatedAtIso: claimed.updatedAtIso,
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前管理员已经是该异常工单的认领人，无需强制接管',
      ),
    );
  });

  it('rejects claiming a resolved case', async () => {
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
      service.claimCase('admin-2', exceptionCase.id, {
        baseUpdatedAtIso: resolved.updatedAtIso,
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前异常工单状态不允许执行该操作',
      ),
    );
  });

  it('lets the current claimer release an open case and clears the claim snapshot', async () => {
    const { exceptionCase, service } = await createCase();

    const claimed = await service.claimCase('admin-2', exceptionCase.id, {
      baseUpdatedAtIso: exceptionCase.updatedAtIso,
      content: '当前客服先认领跟进。',
    });

    await expect(
      service.unclaimCase('admin-2', exceptionCase.id, {
        baseUpdatedAtIso: claimed.updatedAtIso,
        content: '当前班次切换，先释放给公共队列。',
      }),
    ).resolves.toMatchObject({
      id: exceptionCase.id,
      status: 'pending',
      actions: expect.arrayContaining([
        expect.objectContaining({
          adminUserId: 'admin-2',
          fromStatus: 'pending',
          toStatus: 'pending',
          content: '客服释放认领：当前班次切换，先释放给公共队列。',
        }),
      ]),
    });

    await expect(service.getForAdmin(exceptionCase.id)).resolves.not.toHaveProperty(
      'claimedByAdminUserId',
    );
    await expect(
      service.listForAdmin({
        page: 1,
        pageSize: 20,
        claimStatus: 'unclaimed',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: exceptionCase.id })],
    });
  });

  it('rejects releasing an unclaimed case or a case claimed by another admin', async () => {
    const { exceptionCase, service } = await createCase();

    await expect(
      service.unclaimCase('admin-2', exceptionCase.id, {
        baseUpdatedAtIso: exceptionCase.updatedAtIso,
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前异常工单尚未被认领，无需释放认领',
      ),
    );

    const claimed = await service.claimCase('admin-2', exceptionCase.id, {
      baseUpdatedAtIso: exceptionCase.updatedAtIso,
      content: '当前客服先认领跟进。',
    });

    await expect(
      service.unclaimCase('admin-3', exceptionCase.id, {
        baseUpdatedAtIso: claimed.updatedAtIso,
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前管理员不是该异常工单的认领人，不能释放认领',
      ),
    );
  });

  it('lets the current claimer transfer a case to another admin and rejects duplicate or unauthorized transfers', async () => {
    const { exceptionCase, service } = await createCase();

    const claimed = await service.claimCase('admin-2', exceptionCase.id, {
      baseUpdatedAtIso: exceptionCase.updatedAtIso,
      content: '当前客服先认领跟进。',
    });

    await expect(
      service.assignCase('admin-2', exceptionCase.id, {
        baseUpdatedAtIso: claimed.updatedAtIso,
        targetAdminUserId: 'admin-3',
        content: '白班客服接手继续跟进。',
      }),
    ).resolves.toMatchObject({
      claimedByAdminUserId: 'admin-3',
      claimNote: '白班客服接手继续跟进。',
      actions: expect.arrayContaining([
        expect.objectContaining({
          adminUserId: 'admin-2',
          fromStatus: 'pending',
          toStatus: 'pending',
          content: '客服转派给 admin-3：白班客服接手继续跟进。',
        }),
      ]),
    });

    const transferred = await service.getForAdmin(exceptionCase.id);
    expect(transferred).toMatchObject({
      claimedByAdminUserId: 'admin-3',
      claimNote: '白班客服接手继续跟进。',
    });

    await expect(
      service.assignCase('admin-1', exceptionCase.id, {
        baseUpdatedAtIso: transferred.updatedAtIso,
        targetAdminUserId: 'admin-4',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前管理员不是该异常工单的认领人，不能转派给其他客服',
      ),
    );

    await expect(
      service.assignCase('admin-3', exceptionCase.id, {
        baseUpdatedAtIso: transferred.updatedAtIso,
        targetAdminUserId: 'admin-3',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前异常工单已在目标客服名下，无需重复指派',
      ),
    );

    await expect(
      service.listForAdmin({
        page: 1,
        pageSize: 20,
        claimedByAdminUserId: 'admin-3',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: exceptionCase.id })],
    });
  });

  it('does not reset the resolution SLA anchor when a processing case is claimed', async () => {
    let currentTime = new Date('2026-07-12T08:00:00.000Z');
    const repository = new InMemoryOrdersRepository(() => currentTime);
    const service = new OrderExceptionCasesService(repository);
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());

    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货物损坏',
      description: '装货时发现外包装已经破损。',
    });
    const exceptionCase = (await repository.listOrderExceptionCases(order.id)).items[0];

    currentTime = new Date('2026-07-12T08:30:00.000Z');
    const processing = await service.processCase('admin-1', exceptionCase.id, {
      baseUpdatedAtIso: exceptionCase.updatedAtIso,
      content: '客服已经联系司机核实异常情况。',
    });

    currentTime = new Date('2026-07-12T09:00:00.000Z');
    await service.claimCase('admin-2', exceptionCase.id, {
      baseUpdatedAtIso: processing.updatedAtIso,
      content: '夜班客服接手继续跟进。',
    });

    const currentSnapshotService = new OrderExceptionCasesService(
      repository,
      undefined,
      () => new Date('2026-07-12T13:00:00.000Z'),
    );

    await expect(currentSnapshotService.getForAdmin(exceptionCase.id)).resolves.toMatchObject({
      claimedByAdminUserId: 'admin-2',
      claimNote: '夜班客服接手继续跟进。',
      sla: {
        policyKey: 'exception_case_default_v1',
        stage: 'resolution',
        status: 'overdue',
        targetAtIso: '2026-07-12T12:30:00.000Z',
        overdueMinutes: 30,
      },
    });
  });

  it('does not reset the resolution SLA anchor when a processing case is released back to the queue', async () => {
    let currentTime = new Date('2026-07-12T08:00:00.000Z');
    const repository = new InMemoryOrdersRepository(() => currentTime);
    const service = new OrderExceptionCasesService(repository);
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());

    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货物损坏',
      description: '装货时发现外包装已经破损。',
    });
    const exceptionCase = (await repository.listOrderExceptionCases(order.id)).items[0];

    currentTime = new Date('2026-07-12T08:30:00.000Z');
    const processing = await service.processCase('admin-1', exceptionCase.id, {
      baseUpdatedAtIso: exceptionCase.updatedAtIso,
      content: '客服已经联系司机核实异常情况。',
    });

    currentTime = new Date('2026-07-12T09:00:00.000Z');
    const claimed = await service.claimCase('admin-2', exceptionCase.id, {
      baseUpdatedAtIso: processing.updatedAtIso,
      content: '夜班客服接手继续跟进。',
    });

    currentTime = new Date('2026-07-12T09:10:00.000Z');
    await service.unclaimCase('admin-2', exceptionCase.id, {
      baseUpdatedAtIso: claimed.updatedAtIso,
      content: '当前班次切换，先释放给公共队列。',
    });

    const currentSnapshotService = new OrderExceptionCasesService(
      repository,
      undefined,
      () => new Date('2026-07-12T13:00:00.000Z'),
    );

    await expect(currentSnapshotService.getForAdmin(exceptionCase.id)).resolves.toMatchObject({
      sla: {
        policyKey: 'exception_case_default_v1',
        stage: 'resolution',
        status: 'overdue',
        targetAtIso: '2026-07-12T12:30:00.000Z',
        overdueMinutes: 30,
      },
    });
    await expect(currentSnapshotService.getForAdmin(exceptionCase.id)).resolves.not.toHaveProperty(
      'claimedByAdminUserId',
    );
  });

  it('does not reset the resolution SLA anchor when a processing case is transferred to another admin', async () => {
    let currentTime = new Date('2026-07-12T08:00:00.000Z');
    const repository = new InMemoryOrdersRepository(() => currentTime);
    const service = new OrderExceptionCasesService(repository);
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());

    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货物损坏',
      description: '装货时发现外包装已经破损。',
    });
    const exceptionCase = (await repository.listOrderExceptionCases(order.id)).items[0];

    currentTime = new Date('2026-07-12T08:30:00.000Z');
    const processing = await service.processCase('admin-1', exceptionCase.id, {
      baseUpdatedAtIso: exceptionCase.updatedAtIso,
      content: '客服已经联系司机核实异常情况。',
    });

    currentTime = new Date('2026-07-12T09:00:00.000Z');
    const claimed = await service.claimCase('admin-2', exceptionCase.id, {
      baseUpdatedAtIso: processing.updatedAtIso,
      content: '夜班客服接手继续跟进。',
    });

    currentTime = new Date('2026-07-12T09:10:00.000Z');
    await service.assignCase('admin-2', exceptionCase.id, {
      baseUpdatedAtIso: claimed.updatedAtIso,
      targetAdminUserId: 'admin-3',
      content: '白班客服接手继续跟进。',
    });

    const currentSnapshotService = new OrderExceptionCasesService(
      repository,
      undefined,
      () => new Date('2026-07-12T13:00:00.000Z'),
    );

    await expect(currentSnapshotService.getForAdmin(exceptionCase.id)).resolves.toMatchObject({
      claimedByAdminUserId: 'admin-3',
      claimNote: '白班客服接手继续跟进。',
      sla: {
        policyKey: 'exception_case_default_v1',
        stage: 'resolution',
        status: 'overdue',
        targetAtIso: '2026-07-12T12:30:00.000Z',
        overdueMinutes: 30,
      },
    });
  });

  it('does not reset the resolution SLA anchor when a processing case is force-taken over', async () => {
    let currentTime = new Date('2026-07-12T08:00:00.000Z');
    const repository = new InMemoryOrdersRepository(() => currentTime);
    const service = new OrderExceptionCasesService(repository);
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());

    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货物损坏',
      description: '装货时发现外包装已经破损。',
    });
    const exceptionCase = (await repository.listOrderExceptionCases(order.id)).items[0];

    currentTime = new Date('2026-07-12T08:30:00.000Z');
    const processing = await service.processCase('admin-1', exceptionCase.id, {
      baseUpdatedAtIso: exceptionCase.updatedAtIso,
      content: '客服已经联系司机核实异常情况。',
    });

    currentTime = new Date('2026-07-12T09:00:00.000Z');
    const claimed = await service.claimCase('admin-2', exceptionCase.id, {
      baseUpdatedAtIso: processing.updatedAtIso,
      content: '夜班客服接手继续跟进。',
    });

    currentTime = new Date('2026-07-12T09:10:00.000Z');
    await service.takeoverCase('admin-3', exceptionCase.id, {
      baseUpdatedAtIso: claimed.updatedAtIso,
      content: '主管要求白班客服直接继续跟进。',
    });

    const currentSnapshotService = new OrderExceptionCasesService(
      repository,
      undefined,
      () => new Date('2026-07-12T13:00:00.000Z'),
    );

    await expect(currentSnapshotService.getForAdmin(exceptionCase.id)).resolves.toMatchObject({
      claimedByAdminUserId: 'admin-3',
      claimNote: '主管要求白班客服直接继续跟进。',
      sla: {
        policyKey: 'exception_case_default_v1',
        stage: 'resolution',
        status: 'overdue',
        targetAtIso: '2026-07-12T12:30:00.000Z',
        overdueMinutes: 30,
      },
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

  it('requires an appeal decision when resolving an appealed case', async () => {
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

    await expect(
      service.resolveCase('admin-1', exceptionCase.id, {
        baseUpdatedAtIso: appealed.updatedAtIso,
        content: '客服完成二次复核，但漏填申诉裁定。',
        compensationStatus: 'pending',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 4200,
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前异常工单状态不允许执行该操作',
      ),
    );
  });

  it('records appeal adjudication when resolving an appealed case', async () => {
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

    await expect(
      service.resolveCase('admin-1', exceptionCase.id, {
        baseUpdatedAtIso: appealed.updatedAtIso,
        content: '客服复核后改为待赔付跟进。',
        compensationStatus: 'pending',
        appealDecision: 'accepted',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 4200,
      }),
    ).resolves.toMatchObject({
      status: 'resolved',
      appealStatus: 'accepted',
      compensationStatus: 'pending',
      compensationTargetRole: 'shipper',
      compensationAmountCents: 4200,
    });
  });

  it('notifies related users when an appealed case is accepted on re-review', async () => {
    const notificationsService = {
      notifyExceptionEvent: jest.fn().mockResolvedValue(undefined),
    };
    const { order, exceptionCase, service } = await createCase(
      notificationsService,
    );
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
    const appealed = await service.appealForShipper(
      'shipper-1',
      order.id,
      exceptionCase.id,
      {
        baseUpdatedAtIso: resolved.updatedAtIso,
        reason: '货主认为赔付金额过低，申请重新核定。',
      },
    );

    await service.resolveCase('admin-1', exceptionCase.id, {
      baseUpdatedAtIso: appealed.updatedAtIso,
      content: '客服复核后改为待赔付跟进。',
      compensationStatus: 'pending',
      appealDecision: 'accepted',
      compensationTargetRole: 'shipper',
      compensationAmountCents: 4200,
    });

    expect(notificationsService.notifyExceptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'exception_appeal_accepted',
        caseId: exceptionCase.id,
        orderId: order.id,
        orderNo: order.orderNo,
        shipperId: order.shipperId,
        driverId: order.assignedDriverId,
      }),
    );
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
