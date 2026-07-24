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
        '货主实名/企业认证后台列表与通过驳回第一片已接上，还没做人脸核验、证照 OCR 和审核事件审计。',
      metrics: [],
      pendingGaps: ['审核事件审计', '附件预览', 'OCR / 人脸核验'],
    },
    {
      key: 'shipper-invoice',
      title: '发票申请审核台',
      route: '/api/admin/shipper-invoice-console',
      stage: 'first_slice',
      summary:
        '发票申请后台列表与通过驳回第一片已接上，还没做发票文件下载、税局回调和审核事件审计。',
      metrics: [],
      pendingGaps: ['发票文件下载', '税局回调', '审核事件审计'],
    },
    {
      key: 'order-management',
      title: '订单管理台',
      route: '/api/admin/order-management-console',
      stage: 'first_slice',
      summary:
        '后台订单列表、详情、按单资金视图、筛选报表、CSV 导出、原子批量取消 waiting 订单，以及和财务台双向跳转的资金联动第一片已经能跑；异常快照里也会展示最新赔付决议摘要并可跳异常工单台，但真实赔付执行 / 退款联动还没补齐。',
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
      pendingGaps: ['真实赔付执行 / 退款联动'],
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
        '帮助中心工单后台列表、详情和 pending -> processing -> resolved 状态流转已经能跑，但还没 SLA、坐席分配、在线会话和通知联动。',
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
        },
        {
          label: '处理中',
          value: stats.supportTickets.processingCount,
          tone: queueTone(stats.supportTickets.processingCount),
        },
      ],
      pendingGaps: ['SLA / 超时升级', '坐席分配', '在线客服会话', '通知联动'],
    },
    {
      key: 'order-exception-case',
      title: '异常客服工单台',
      route: '/api/admin/order-exception-case-console',
      stage: 'first_slice',
      summary:
        '工单能推进状态、留痕并记录赔付决议快照，但还没 SLA、分配、会话和真实赔付 / 退款联动。',
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
        },
        {
          label: '处理中',
          value: stats.orderExceptions.processingCount,
          tone: queueTone(stats.orderExceptions.processingCount),
        },
      ],
      pendingGaps: ['SLA / 超时升级', '坐席分配', '会话联动', '真实赔付执行 / 退款联动'],
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
        '已经能只读审计货主/司机评价，但还没申诉、审核处置和信用分联动。',
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
          label: '司机已回复',
          value: stats.evaluations.repliedOrderCount,
          tone: 'positive',
        },
      ],
      pendingGaps: ['申诉处理', '审核处置', '信用分联动'],
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
