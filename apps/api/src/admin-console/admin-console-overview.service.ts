import type {
  AdminConsoleOverviewRepository,
  AdminConsoleOverviewStats,
} from './admin-console-overview.repository';
import { getAdminPermissionMatrixSummary } from './admin-permission-matrix';

export type AdminConsoleOverviewMetricTone =
  | 'neutral'
  | 'warning'
  | 'positive';

export type AdminConsoleOverviewMetric = {
  label: string;
  value: number;
  tone: AdminConsoleOverviewMetricTone;
  route?: string;
};

export type AdminConsoleOverviewModule = {
  key: string;
  title: string;
  route: string;
  stage: 'first_slice';
  summary: string;
  metrics: AdminConsoleOverviewMetric[];
  pendingGaps: string[];
};

export type AdminConsoleOverview = {
  generatedAtIso: string;
  implementedConsoleCount: number;
  liveMetricModuleCount: number;
  remainingCapabilityCount: number;
  modules: AdminConsoleOverviewModule[];
  remainingPlatformGaps: string[];
};

const remainingPlatformGaps = [
  '地图 / 定位 / 轨迹 / ETA',
  'IM / WebSocket / 推送 / 在线客服会话',
  '正式微信 / 支付宝 / 银行卡 / 真实打款 / 税务回调 / 对账报表',
  '多角色工作台 / 行级权限 / 报表 / 批量操作',
  '真实对象存储 / 短信 / 监控告警 / 备份恢复 / 发布体系',
];

export class AdminConsoleOverviewService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: AdminConsoleOverviewRepository,
    now: () => Date = () => new Date(),
  ) {
    this.now = now;
  }

  async getOverview(): Promise<AdminConsoleOverview> {
    const stats = await this.repository.getStats();
    const modules = createModules(stats, getAdminPermissionMatrixSummary());

    return {
      generatedAtIso: this.now().toISOString(),
      implementedConsoleCount: modules.length,
      liveMetricModuleCount: modules.filter(module => module.metrics.length > 0)
        .length,
      remainingCapabilityCount: remainingPlatformGaps.length,
      modules,
      remainingPlatformGaps: [...remainingPlatformGaps],
    };
  }
}

function createModules(
  stats: AdminConsoleOverviewStats,
  permissionMatrixSummary = getAdminPermissionMatrixSummary(),
): AdminConsoleOverviewModule[] {
  return [
    {
      key: 'driver-certification',
      title: '司机认证审核台',
      route: '/api/admin/driver-certification-console',
      stage: 'first_slice',
      summary:
        '实名/车辆审核、按当前筛选结果勾选后的批量审核、附件预览和审核事件已经能跑，但还没 OCR 和风控联动。',
      metrics: [
        {
          label: '待审司机',
          value: stats.driverCertification.reviewingDriverCount,
          tone: queueTone(stats.driverCertification.reviewingDriverCount),
        },
        {
          label: '待审实名',
          value: stats.driverCertification.identityReviewingCount,
          tone: queueTone(stats.driverCertification.identityReviewingCount),
        },
        {
          label: '待审车辆',
          value: stats.driverCertification.vehicleReviewingCount,
          tone: queueTone(stats.driverCertification.vehicleReviewingCount),
        },
      ],
      pendingGaps: ['OCR / 人脸核验', '风控联动'],
    },
    {
      key: 'shipper-verification',
      title: '货主认证审核台',
      route: '/api/admin/shipper-verification-console',
      stage: 'first_slice',
      summary:
        '货主实名/企业认证后台列表、附件预览、通过驳回和审核事件审计第一片已接上，还没做证照 OCR 和人脸核验。',
      metrics: [],
      pendingGaps: ['OCR / 人脸核验'],
    },
    {
      key: 'shipper-invoice',
      title: '发票申请审核台',
      route: '/api/admin/shipper-invoice-console',
      stage: 'first_slice',
      summary:
        '发票申请后台列表、通过驳回、审核事件审计和文本发票下载第一片已接上，还没做税局回调。',
      metrics: [],
      pendingGaps: ['税局回调'],
    },
    {
      key: 'order-change-request',
      title: '订单修改申请审核台',
      route: '/api/admin/order-change-request-console',
      stage: 'first_slice',
      summary:
        '货主修改申请后台列表、通过驳回、费用/退款/司机通知快照、审核事件审计和按订单深链的司机通知第一片已接上；留空的审核快照也会按订单金额、支付状态和司机分配自动补全；通过审核时可选填写调整后应付金额并同步改写订单 price/payable 快照，同时会写入资金处置结论与财务审计留痕；在线托管降价且存在可部分退的 escrow 支付单时，会创建部分退款与 outbox（主单保持 escrowed），补差支付单仍未自动创建。',
      metrics: [],
      pendingGaps: [
        '托管补差支付单自动创建',
        '部分退款成功后支付单净额快照',
      ],
    },
    {
      key: 'order-management',
      title: '订单管理台',
      route: '/api/admin/order-management-console',
      stage: 'first_slice',
      summary:
        '后台订单列表、详情、按单资金视图、筛选报表、CSV 导出、原子批量取消 waiting 订单，以及和财务台双向跳转的资金联动第一片已经能跑；异常快照里也会展示最新赔付决议摘要并可跳异常工单台，赔付执行也已能在异常工单台完成，但订单侧退款联动和更深资金处置还没补齐。',
      metrics: [
        {
          label: '订单总数',
          value: stats.orderManagement.totalCount,
          tone: 'neutral',
        },
        {
          label: '待接单',
          value: stats.orderManagement.waitingCount,
          tone: queueTone(stats.orderManagement.waitingCount),
        },
        {
          label: '执行中',
          value: stats.orderManagement.activeCount,
          tone: 'neutral',
        },
      ],
      pendingGaps: ['订单侧退款联动 / 更深资金处置'],
    },
    {
      key: 'session-governance',
      title: '后台会话治理台',
      route: '/api/admin/session-governance-console',
      stage: 'first_slice',
      summary:
        '当前 admin 自查、按角色/关键字检索全平台活跃会话、设备风险摘要、按会话跨账号强退和细粒度审计第一片都已经能跑；但数据域权限和更策略化的风控规则还没彻底补完。',
      metrics: [
        {
          label: '风险会话',
          value: stats.sessionGovernance.riskySessionCount,
          tone: queueTone(stats.sessionGovernance.riskySessionCount),
        },
        {
          label: '共享设备',
          value: stats.sessionGovernance.sharedDeviceCount,
          tone: queueTone(stats.sessionGovernance.sharedDeviceCount),
        },
        {
          label: '多设备 admin',
          value: stats.sessionGovernance.adminMultiDeviceUserCount,
          tone: queueTone(stats.sessionGovernance.adminMultiDeviceUserCount),
        },
      ],
      pendingGaps: ['数据域 / 行级权限', '策略化风控规则'],
    },
    {
      key: 'account-management',
      title: '账号管理台',
      route: '/api/admin/account-management-console',
      stage: 'first_slice',
      summary:
        '平台账号目录、详情、单账号治理、后端原子批量冻结解冻/撤销会话、筛选报表和 CSV 导出已经能跑，admin-facing 手机号和设备标识也补了第一片脱敏；但还没实名解绑/注销和更严格的角色审批。',
      metrics: [
        {
          label: '平台账号',
          value: stats.accountManagement.totalUserCount,
          tone: 'neutral',
        },
        {
          label: '已禁用',
          value: stats.accountManagement.disabledUserCount,
          tone:
            stats.accountManagement.disabledUserCount > 0
              ? 'warning'
              : 'positive',
        },
        {
          label: '风险账号',
          value: stats.accountManagement.riskyUserCount,
          tone:
            stats.accountManagement.riskyUserCount > 0
              ? 'warning'
              : 'positive',
        },
      ],
      pendingGaps: ['实名解绑 / 注销流程', '定时报表', '更细粒度脱敏', '角色审批 / 双人复核'],
    },
    {
      key: 'permission-matrix',
      title: '权限矩阵台',
      route: '/api/admin/permission-matrix-console',
      stage: 'first_slice',
      summary:
        '当前所有 admin 会话仍共享同一档位，但现有后台台子、读写能力和高风险操作已经被统一拉成权限矩阵第一片，后面才能继续拆多角色和审批流。',
      metrics: [
        {
          label: '角色档位',
          value: permissionMatrixSummary.profileCount,
          tone:
            permissionMatrixSummary.profileCount > 0 ? 'positive' : 'warning',
        },
        {
          label: '能力项',
          value: permissionMatrixSummary.capabilityCount,
          tone: 'neutral',
        },
        {
          label: '高风险能力',
          value: permissionMatrixSummary.highRiskCapabilityCount,
          tone:
            permissionMatrixSummary.highRiskCapabilityCount > 0
              ? 'warning'
              : 'positive',
        },
      ],
      pendingGaps: ['多角色拆分', '行级 / 数据域权限', '审批流 / 双人复核'],
    },
    {
      key: 'order-attachment',
      title: '订单附件审计台',
      route: '/api/admin/order-attachment-console',
      stage: 'first_slice',
      summary:
        '订单附件摘要、详情和本地预览已经落地，但还没 missing 文件批修、对象存储对账和批量处理。',
      metrics: [
        {
          label: '可审附件订单',
          value: stats.orderAttachments.auditableOrderCount,
          tone: 'neutral',
        },
        {
          label: '含货物图订单',
          value: stats.orderAttachments.cargoPhotoOrderCount,
          tone: 'neutral',
        },
      ],
      pendingGaps: ['missing 引用批修', '对象存储对账', '批量处理'],
    },
    {
      key: 'file-maintenance',
      title: '文件维护台',
      route: '/api/admin/file-maintenance-console',
      stage: 'first_slice',
      summary:
        '文件维护摘要、审计报表、分页筛选和选中批量治理已经能跑，但还没真实对象存储联调、病毒扫描和深度对账。',
      metrics: [
        {
          label: '过期 pending',
          value: stats.fileMaintenance.expiredPendingCount,
          tone: queueTone(stats.fileMaintenance.expiredPendingCount),
        },
        {
          label: 'rejected 文件',
          value: stats.fileMaintenance.rejectedCount,
          tone: errorTone(stats.fileMaintenance.rejectedCount),
        },
        {
          label: '文件总数',
          value: stats.fileMaintenance.totalCount,
          tone: 'neutral',
        },
      ],
      pendingGaps: ['真实对象存储联调', '病毒扫描 / 缩略图', '深度对账 / 生命周期治理'],
    },
    {
      key: 'support-ticket',
      title: '帮助中心工单台',
      route: '/api/admin/support-ticket-console',
      stage: 'first_slice',
      summary:
        '帮助中心工单后台列表、详情、认领、强制接管、指派 / 转派、释放认领、pending -> processing -> resolved 状态流转、货主通知、SLA 提醒，以及按 SLA / 认领状态筛队列已经能跑，也支持手动/定时超时升级扫描并向货主回流超时升级消息；更完整的坐席分配和在线会话还没补上。',
      metrics: [
        {
          label: '待处理工单',
          value: stats.supportTickets.openCount,
          tone: queueTone(stats.supportTickets.openCount),
        },
        {
          label: '待受理',
          value: stats.supportTickets.pendingCount,
          tone: queueTone(stats.supportTickets.pendingCount),
          route: buildOverviewConsoleRoute('/api/admin/support-ticket-console', {
            status: 'pending',
          }),
        },
        {
          label: '处理中',
          value: stats.supportTickets.processingCount,
          tone: queueTone(stats.supportTickets.processingCount),
          route: buildOverviewConsoleRoute('/api/admin/support-ticket-console', {
            status: 'processing',
          }),
        },
        {
          label: '已认领',
          value: stats.supportTickets.claimedCount,
          tone: queueTone(stats.supportTickets.claimedCount),
          route: buildOverviewConsoleRoute('/api/admin/support-ticket-console', {
            claimStatus: 'claimed',
          }),
        },
        {
          label: '未认领',
          value: stats.supportTickets.unclaimedCount,
          tone: queueTone(stats.supportTickets.unclaimedCount),
          route: buildOverviewConsoleRoute('/api/admin/support-ticket-console', {
            claimStatus: 'unclaimed',
          }),
        },
        {
          label: '已超时',
          value: stats.supportTickets.overdueCount,
          tone: queueTone(stats.supportTickets.overdueCount),
          route: buildOverviewConsoleRoute('/api/admin/support-ticket-console', {
            slaStatus: 'overdue',
          }),
        },
      ],
      pendingGaps: ['更完整的坐席分配 / 主管权限治理', '在线客服会话'],
    },
    {
      key: 'order-exception-case',
      title: '异常客服工单台',
      route: '/api/admin/order-exception-case-console',
      stage: 'first_slice',
      summary:
        '工单能推进状态、留痕、记录赔付决议、响应申诉回退，并在二次复核时补录 accepted / rejected 申诉裁定；后台现在也能查看受理 / 解决 SLA 提醒，按赔付状态、申诉状态、SLA 状态、认领状态和认领客服筛队列后执行平台赔付，也支持认领未认领工单、转派 / 释放自己名下工单、强制接管他人已认领工单，再手动/定时执行超时升级扫描并向相关方回流超时升级消息，但更完整的坐席分配、会话和退款联动还没补上。',
      metrics: [
        {
          label: '待处理工单',
          value: stats.orderExceptions.openCount,
          tone: queueTone(stats.orderExceptions.openCount),
        },
        {
          label: '待受理',
          value: stats.orderExceptions.pendingCount,
          tone: queueTone(stats.orderExceptions.pendingCount),
          route: buildOverviewConsoleRoute(
            '/api/admin/order-exception-case-console',
            {
              status: 'pending',
            },
          ),
        },
        {
          label: '处理中',
          value: stats.orderExceptions.processingCount,
          tone: queueTone(stats.orderExceptions.processingCount),
          route: buildOverviewConsoleRoute(
            '/api/admin/order-exception-case-console',
            {
              status: 'processing',
            },
          ),
        },
        {
          label: '已认领',
          value: stats.orderExceptions.claimedCount,
          tone: queueTone(stats.orderExceptions.claimedCount),
          route: buildOverviewConsoleRoute(
            '/api/admin/order-exception-case-console',
            {
              claimStatus: 'claimed',
            },
          ),
        },
        {
          label: '未认领',
          value: stats.orderExceptions.unclaimedCount,
          tone: queueTone(stats.orderExceptions.unclaimedCount),
          route: buildOverviewConsoleRoute(
            '/api/admin/order-exception-case-console',
            {
              claimStatus: 'unclaimed',
            },
          ),
        },
        {
          label: '已超时',
          value: stats.orderExceptions.overdueCount,
          tone: queueTone(stats.orderExceptions.overdueCount),
          route: buildOverviewConsoleRoute(
            '/api/admin/order-exception-case-console',
            {
              slaStatus: 'overdue',
            },
          ),
        },
      ],
      pendingGaps: ['更完整的坐席分配 / 主管权限治理', '会话联动', '退款联动'],
    },
    {
      key: 'shipper-coupon',
      title: '货主优惠券发放台',
      route: '/api/admin/shipper-coupon-console',
      stage: 'first_slice',
      summary:
        '能给单个货主手工发券、按同模板批量投放，也能看核销报表；支付退款成功回调命中已核销原券时会自动返一张新券，但还没活动编排、营销审批流和退款返券策略后台。',
      metrics: [
        {
          label: '可用券',
          value: stats.shipperCoupons.usableCount,
          tone: 'neutral',
        },
        {
          label: '锁定券',
          value: stats.shipperCoupons.lockedCount,
          tone: stats.shipperCoupons.lockedCount > 0 ? 'warning' : 'positive',
        },
        {
          label: '已过期',
          value: stats.shipperCoupons.expiredCount,
          tone: 'neutral',
        },
      ],
      pendingGaps: ['活动策略编排', '营销规则审批流', '退款返券策略后台'],
    },
    {
      key: 'evaluation-audit',
      title: '评价审计台',
      route: '/api/admin/evaluation-audit-console',
      stage: 'first_slice',
      summary:
        '已经能审计货主/司机评价、查看图片附件，并以版本冲突保护执行单条隐藏 / 恢复、用户申诉和管理员裁定，也能追溯处置与申诉历史，但还没批量处置和信用分联动。',
      metrics: [
        {
          label: '货主评司机',
          value: stats.evaluations.shipperToDriverOrderCount,
          tone: 'neutral',
        },
        {
          label: '司机评货主',
          value: stats.evaluations.driverToShipperOrderCount,
          tone: 'neutral',
        },
        {
          label: '已隐藏',
          value: stats.evaluations.hiddenCount,
          tone: queueTone(stats.evaluations.hiddenCount),
          route:
            '/api/admin/evaluation-audit-console?moderationStatus=hidden',
        },
      ],
      pendingGaps: ['批量处置', '信用分联动'],
    },
    {
      key: 'finance',
      title: '财务操作台',
      route: '/api/admin/finance-console',
      stage: 'first_slice',
      summary:
        '支付/退款/结算/提现第一片已经能查能操作，财务报表和原子批量提现审核第一片也能跑，但还没正式支付 / 打款和生产对账。',
      metrics: [
        {
          label: '支付处理中',
          value: stats.finance.paymentPendingCount,
          tone: queueTone(stats.finance.paymentPendingCount),
        },
        {
          label: '退款失败',
          value: stats.finance.refundFailedCount,
          tone: errorTone(stats.finance.refundFailedCount),
        },
        {
          label: '死信退款 outbox',
          value: stats.finance.deadOutboxCount,
          tone: errorTone(stats.finance.deadOutboxCount),
        },
        {
          label: '待审提现',
          value: stats.finance.reviewingWithdrawalCount,
          tone: queueTone(stats.finance.reviewingWithdrawalCount),
        },
        {
          label: '已结算单',
          value: stats.finance.settlementCount,
          tone: 'positive',
        },
      ],
      pendingGaps: ['正式支付 / 打款', '生产对账'],
    },
  ];
}

function queueTone(value: number): AdminConsoleOverviewMetricTone {
  return value > 0 ? 'warning' : 'positive';
}

function errorTone(value: number): AdminConsoleOverviewMetricTone {
  return value > 0 ? 'warning' : 'positive';
}

function buildOverviewConsoleRoute(
  baseRoute: string,
  query: Record<string, string>,
) {
  const search = new URLSearchParams(query).toString();

  return search ? `${baseRoute}?${search}` : baseRoute;
}
