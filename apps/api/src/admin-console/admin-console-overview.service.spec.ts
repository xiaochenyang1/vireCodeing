import { AdminConsoleOverviewService } from './admin-console-overview.service';
import type { AdminConsoleOverviewRepository } from './admin-console-overview.repository';

const NOW = new Date('2026-07-18T03:00:00.000Z');

describe('AdminConsoleOverviewService', () => {
  it('maps repository stats into eleven admin console modules and a platform backlog', async () => {
    const repository = {
      getStats: jest.fn().mockResolvedValue({
        driverCertification: {
          reviewingDriverCount: 2,
          identityReviewingCount: 3,
          vehicleReviewingCount: 1,
        },
        orderManagement: {
          totalCount: 28,
          waitingCount: 6,
          activeCount: 11,
        },
        sessionGovernance: {
          riskySessionCount: 6,
          sharedDeviceCount: 2,
          adminMultiDeviceUserCount: 1,
        },
        accountManagement: {
          totalUserCount: 42,
          disabledUserCount: 3,
          riskyUserCount: 5,
        },
        orderAttachments: {
          auditableOrderCount: 12,
          cargoPhotoOrderCount: 9,
        },
        fileMaintenance: {
          totalCount: 31,
          rejectedCount: 2,
          expiredPendingCount: 1,
        },
        supportTickets: {
          pendingCount: 3,
          processingCount: 2,
          openCount: 5,
        },
        orderExceptions: {
          pendingCount: 4,
          processingCount: 2,
          openCount: 6,
        },
        shipperCoupons: {
          usableCount: 15,
          lockedCount: 5,
          expiredCount: 1,
        },
        evaluations: {
          shipperToDriverOrderCount: 7,
          driverToShipperOrderCount: 3,
          repliedOrderCount: 2,
        },
        finance: {
          paymentPendingCount: 4,
          refundFailedCount: 1,
          deadOutboxCount: 2,
          reviewingWithdrawalCount: 3,
          settlementCount: 22,
        },
      }),
    } as unknown as jest.Mocked<AdminConsoleOverviewRepository>;
    const service = new AdminConsoleOverviewService(repository, () => NOW);
    const overview = await service.getOverview();

    expect(overview).toEqual(
      expect.objectContaining({
        generatedAtIso: NOW.toISOString(),
        implementedConsoleCount: 12,
        liveMetricModuleCount: 12,
        remainingCapabilityCount: 5,
        modules: expect.arrayContaining([
          expect.objectContaining({
            key: 'driver-certification',
            route: '/api/admin/driver-certification-console',
            summary:
              '实名/车辆审核、按当前筛选结果勾选后的批量审核、附件预览和审核事件已经能跑，但还没 OCR 和风控联动。',
            metrics: expect.arrayContaining([
              expect.objectContaining({
                label: '待审司机',
                value: 2,
                tone: 'warning',
              }),
            ]),
            pendingGaps: ['OCR / 人脸核验', '风控联动'],
          }),
          expect.objectContaining({
            key: 'order-management',
            route: '/api/admin/order-management-console',
            summary:
              '后台订单列表、详情、按单资金视图、筛选报表、CSV 导出、原子批量取消 waiting 订单，以及和财务台双向跳转的资金联动第一片已经能跑；异常快照里也会展示最新赔付决议摘要并可跳异常工单台，但真实赔付执行 / 退款联动还没补齐。',
            metrics: expect.arrayContaining([
              expect.objectContaining({
                label: '待接单',
                value: 6,
                tone: 'warning',
              }),
            ]),
            pendingGaps: ['真实赔付执行 / 退款联动'],
          }),
          expect.objectContaining({
            key: 'file-maintenance',
            route: '/api/admin/file-maintenance-console',
            metrics: expect.arrayContaining([
              expect.objectContaining({
                label: '过期 pending',
                value: 1,
                tone: 'warning',
              }),
            ]),
            pendingGaps: ['真实对象存储联调', '病毒扫描 / 缩略图', '深度对账 / 生命周期治理'],
          }),
          expect.objectContaining({
            key: 'support-ticket',
            route: '/api/admin/support-ticket-console',
            summary:
              '帮助中心工单后台列表、详情和 pending -> processing -> resolved 状态流转已经能跑，但还没 SLA、坐席分配、在线会话和通知联动。',
            metrics: expect.arrayContaining([
              expect.objectContaining({
                label: '待处理工单',
                value: 5,
                tone: 'warning',
              }),
            ]),
            pendingGaps: ['SLA / 超时升级', '坐席分配', '在线客服会话', '通知联动'],
          }),
          expect.objectContaining({
            key: 'session-governance',
            route: '/api/admin/session-governance-console',
            metrics: expect.arrayContaining([
              expect.objectContaining({
                label: '风险会话',
                value: 6,
                tone: 'warning',
              }),
              expect.objectContaining({
                label: '共享设备',
                value: 2,
                tone: 'warning',
              }),
              expect.objectContaining({
                label: '多设备 admin',
                value: 1,
                tone: 'warning',
              }),
            ]),
            pendingGaps: ['数据域 / 行级权限', '策略化风控规则'],
          }),
          expect.objectContaining({
            key: 'account-management',
            route: '/api/admin/account-management-console',
            summary:
              '平台账号目录、详情、单账号治理、后端原子批量冻结解冻/撤销会话、筛选报表和 CSV 导出已经能跑，admin-facing 手机号和设备标识也补了第一片脱敏；但还没实名解绑/注销和更严格的角色审批。',
            metrics: expect.arrayContaining([
              expect.objectContaining({
                label: '平台账号',
                value: 42,
                tone: 'neutral',
              }),
              expect.objectContaining({
                label: '已禁用',
                value: 3,
                tone: 'warning',
              }),
              expect.objectContaining({
                label: '风险账号',
                value: 5,
                tone: 'warning',
              }),
            ]),
            pendingGaps: ['实名解绑 / 注销流程', '定时报表', '更细粒度脱敏', '角色审批 / 双人复核'],
          }),
          expect.objectContaining({
            key: 'permission-matrix',
            route: '/api/admin/permission-matrix-console',
            metrics: expect.arrayContaining([
              expect.objectContaining({
                label: '角色档位',
                value: 1,
                tone: 'positive',
              }),
              expect.objectContaining({
                label: '能力项',
                value: 12,
                tone: 'neutral',
              }),
              expect.objectContaining({
                label: '高风险能力',
                value: 9,
                tone: 'warning',
              }),
            ]),
            pendingGaps: ['多角色拆分', '行级 / 数据域权限', '审批流 / 双人复核'],
          }),
          expect.objectContaining({
            key: 'shipper-coupon',
            route: '/api/admin/shipper-coupon-console',
            pendingGaps: ['活动策略编排', '营销规则审批流', '退款返券策略后台'],
          }),
          expect.objectContaining({
            key: 'finance',
            route: '/api/admin/finance-console',
            summary:
              '支付/退款/结算/提现第一片已经能查能操作，财务报表和原子批量提现审核第一片也能跑，但还没正式支付 / 打款和生产对账。',
            metrics: expect.arrayContaining([
              expect.objectContaining({
                label: '死信退款 outbox',
                value: 2,
                tone: 'warning',
              }),
            ]),
            pendingGaps: ['正式支付 / 打款', '生产对账'],
          }),
        ]),
        remainingPlatformGaps: expect.arrayContaining([
          '地图 / 定位 / 轨迹 / ETA',
          'IM / WebSocket / 推送 / 在线客服会话',
          '多角色工作台 / 行级权限 / 报表 / 批量操作',
        ]),
      }),
    );
    expect(overview.modules.find(module => module.key === 'shipper-coupon')).toMatchObject({
      summary:
        '能给单个货主手工发券、按同模板批量投放，也能看核销报表；支付退款成功回调命中已核销原券时会自动返一张新券，但还没活动编排、营销审批流和退款返券策略后台。',
    });
    expect(overview.modules.find(module => module.key === 'order-management')).toMatchObject({
      summary:
        '后台订单列表、详情、按单资金视图、筛选报表、CSV 导出、原子批量取消 waiting 订单，以及和财务台双向跳转的资金联动第一片已经能跑；异常快照里也会展示最新赔付决议摘要并可跳异常工单台，但真实赔付执行 / 退款联动还没补齐。',
      pendingGaps: ['真实赔付执行 / 退款联动'],
    });
    expect(overview.remainingPlatformGaps).not.toContain(
      '权限矩阵 / 多角色工作台 / 后台会话治理 / 报表 / 批量操作',
    );
    expect(overview.remainingPlatformGaps).not.toContain(
      '权限矩阵 / 多角色工作台 / 报表 / 批量操作',
    );
    expect(repository.getStats).toHaveBeenCalledTimes(1);
  });
});
