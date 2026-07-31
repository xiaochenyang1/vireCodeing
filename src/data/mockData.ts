import type {
  FrequentRoute,
  HelpTopic,
  MessageCenterItem,
  OrderStatusSummary,
  RecentOrder,
  ServiceChannel,
  ShipperSummary,
} from '../types';

export const shipperSummary: ShipperSummary = {
  displayName: '张先生',
  accountType: 'personal',
  verificationStatus: 'verified',
  enterpriseVerificationStatus: 'unverified',
  phoneNumber: '13800138000',
  city: '深圳',
  unreadMessageCount: 3,
};

export const orderStatusSummaries: OrderStatusSummary[] = [
  {
    status: 'waiting',
    label: '待接单',
    count: 2,
    description: '等待司机报价',
  },
  {
    status: 'transporting',
    label: '运输中',
    count: 1,
    description: '货物正在路上',
  },
  {
    status: 'confirming',
    label: '待确认',
    count: 1,
    description: '等待确认送达',
  },
  {
    status: 'completed',
    label: '已完成',
    count: 18,
    description: '历史完成订单',
  },
];

export const frequentRoutes: FrequentRoute[] = [
  {
    id: 'route-1',
    name: '宝安仓库 → 南山门店',
    from: '宝安区福永物流园',
    to: '南山区科技园门店',
    lastUsedText: '3 天前使用',
  },
  {
    id: 'route-2',
    name: '龙岗工厂 → 福田展厅',
    from: '龙岗区坂田工厂',
    to: '福田区车公庙展厅',
    lastUsedText: '上周使用',
  },
];

export const messageCenterItems: MessageCenterItem[] = [
  {
    id: 'message-finance-1',
    category: 'finance',
    title: '财务到账提醒',
    content: '异常赔付已打入司机钱包，可在收支明细中查看。',
    timeText: '昨天 10:15',
    unread: false,
    createdAtIso: '2026-06-21T10:15:00+08:00',
    updatedAtIso: '2026-06-21T10:15:00+08:00',
  },
  {
    id: 'message-service-1',
    category: 'service',
    title: '客服处理进度',
    content: '运输异常提交后，客服将在 24 小时内跟进处理。',
    timeText: '昨天 18:00',
    unread: false,
    createdAtIso: '2026-06-21T18:00:00+08:00',
    updatedAtIso: '2026-06-21T18:00:00+08:00',
  },
  {
    id: 'message-quote-1',
    category: 'order',
    title: '司机报价提醒',
    content: '订单 HY20260622001 收到 2 个司机报价，请尽快选择合适司机。',
    timeText: '10 分钟前',
    unread: true,
    createdAtIso: '2026-06-22T09:50:00+08:00',
    updatedAtIso: '2026-06-22T09:50:00+08:00',
  },
  {
    id: 'message-system-1',
    category: 'system',
    title: '系统通知',
    content: '平台已为已认证货主开放本地发单演示能力。',
    timeText: '今天 09:30',
    unread: true,
    createdAtIso: '2026-06-22T09:30:00+08:00',
    updatedAtIso: '2026-06-22T09:30:00+08:00',
  },
];

export const helpTopics: HelpTopic[] = [
  {
    id: 'help-before-order',
    phase: '发单前',
    title: '发布订单前需要准备什么？',
    answer: '确认货物重量、数量、装卸地址、联系人电话和装货时间，方便司机准确报价。',
  },
  {
    id: 'help-edit-order',
    phase: '待接单',
    title: '修改订单',
    answer: '待接单订单可修改货物、地址、车辆要求和价格；司机接单后涉及通知和违约规则，暂不开放直接修改。',
  },
  {
    id: 'help-exception',
    phase: '运输中',
    title: '遇到延误或货损怎么办？',
    answer: '可在订单详情上报异常，填写类型和说明后由客服介入处理。',
  },
];

export const serviceChannels: ServiceChannel[] = [
  {
    id: 'service-online',
    name: '在线客服',
    description: '订单异常、取消争议、司机沟通问题优先从这里进入。',
    availabilityText: '服务时间 09:00-21:00',
    phoneNumber: '4001001000',
  },
  {
    id: 'service-complaint',
    name: '投诉建议',
    description: '适合反馈司机服务、平台体验和费用争议。',
    availabilityText: '预计 24 小时内响应',
  },
];

export const commonAddressItems = [
  {
    id: 'address-warehouse',
    name: '宝安仓库',
    address: '宝安区福永物流园',
    contactText: '赵经理 13800138001',
    tagText: '默认装货地',
  },
  {
    id: 'address-store',
    name: '南山门店',
    address: '南山区科技园门店',
    contactText: '钱店长 13800138002',
    tagText: '高频卸货地',
  },
];

export const commonContactItems = [
  {
    id: 'contact-pickup',
    name: '赵经理',
    roleText: '装货负责人',
    phoneText: '13800138001',
    noteText: '宝安仓库 3 号门',
  },
  {
    id: 'contact-delivery',
    name: '钱店长',
    roleText: '卸货联系人',
    phoneText: '13800138002',
    noteText: '南山门店收货',
  },
];

export const evaluationRecordItems = [
  {
    id: 'evaluation-1',
    orderId: 'HY20260620003',
    driverName: '李师傅',
    ratingText: '5 星',
    content: '师傅准时，货物保护不错。',
    photoText: '',
    timeText: '昨天 18:30',
    driverReplyText: '感谢认可，后续继续保持准时装卸。',
    driverReplyTimeText: '昨天 19:10',
    direction: 'shipper_to_driver' as const,
  },
];

export const spendingRecordItems = [
  {
    id: 'spending-1',
    orderId: 'HY20260620003',
    amountValue: 310,
    amountText: '￥310',
    methodText: '货到付款',
    statusText: '已完成',
    timeText: '昨天 18:28',
    paymentTimeText: '支付时间：昨天 18:28',
    paymentStatusText: '支付状态：支付成功',
    settlementText: '司机收入：￥294.50',
    flowText: '平台服务费：￥15.50',
    timeBucket: 'recent',
  },
  {
    id: 'spending-2',
    orderId: 'HY20260621008',
    amountValue: 520,
    amountText: '￥520',
    methodText: '在线支付',
    statusText: '运输中',
    timeText: '今天 13:00',
    paymentTimeText: '支付时间：今天 13:00',
    paymentStatusText: '支付状态：托管中',
    settlementText: '冻结资金：￥520',
    flowText: '司机送达确认后自动扣款',
    timeBucket: 'recent',
  },
  {
    id: 'spending-3',
    orderId: 'HY20260619005',
    amountValue: 260,
    amountText: '￥260',
    methodText: '取消退款',
    statusText: '退款中',
    timeText: '2 天前申请',
    paymentTimeText: '退款申请：2 天前',
    paymentStatusText: '退款进度：原路退回处理中',
    settlementText: '退款金额：￥260',
    flowText: '预计 1-3 个工作日到账',
    timeBucket: 'history',
  },
];

export const invoiceRecordItems = [
  {
    id: 'invoice-1',
    title: shipperSummary.displayName,
    typeText: '电子普通发票',
    amountText: '可开票 ￥310',
    statusText: '待提交',
  },
];

export const invoiceableOrderItems = [
  {
    id: 'invoice-order-1',
    orderId: 'HY20260620003',
    amountValue: 310,
    amountText: '可开票 ￥310',
    routeText: '宝安仓库 → 南山门店',
    completedTimeText: '昨天完成',
  },
  {
    id: 'invoice-order-2',
    orderId: 'HY20260618002',
    amountValue: 260,
    amountText: '可开票 ￥260',
    routeText: '龙岗工厂 → 福田展厅',
    completedTimeText: '3 天前完成',
  },
];

export const couponItems = [
  {
    id: 'coupon-1',
    title: '满 300 减 30',
    statusText: '可使用',
    conditionText: '发单满 300 元可用',
    validUntilText: '有效期至 2026-07-31',
    sourceText: '活动发放',
  },
  {
    id: 'coupon-2',
    title: '新客立减 20',
    statusText: '已使用',
    conditionText: '首单发单可用',
    validUntilText: '已用于订单 HY20260620003',
    sourceText: '新客礼包',
  },
  {
    id: 'coupon-3',
    title: '夜间运输券',
    statusText: '已过期',
    conditionText: '20:00-06:00 发单可用',
    validUntilText: '有效期至 2026-05-31',
    sourceText: '夜间专享',
  },
];

export const profileSettingItems = [
  {
    id: 'setting-phone',
    title: '手机号保护',
    description: '向司机展示脱敏号码，平台会同步保护开关快照；真实拨号后续接入系统能力。',
    statusText: '已开启',
  },
  {
    id: 'setting-login-protection',
    title: '异地登录保护',
    description: '平台会同步登录保护开关快照，真实异地登录风控和多设备管理尚未接入。',
    statusText: '已开启',
  },
  {
    id: 'setting-notification',
    title: '订单通知',
    description: '接单、运输和送达提醒后续接入推送服务。',
    statusText: '本地展示',
  },
  {
    id: 'setting-promotion',
    title: '促销通知',
    description: '优惠券和活动提醒，真实推送后续接入。',
    statusText: '已关闭',
  },
  {
    id: 'setting-user-agreement',
    title: '用户协议',
    description: '查看平台服务、订单履约和账户使用规则。',
    statusText: '本地摘要',
  },
  {
    id: 'setting-privacy',
    title: '隐私政策',
    description: '查看平台数据使用、位置权限和订单信息说明，并同步确认时间与版本快照。',
    statusText: '本地摘要',
  },
  {
    id: 'setting-permissions',
    title: '权限说明',
    description: '查看定位、相机、相册和通知权限用途。',
    statusText: '本地说明',
  },
  {
    id: 'setting-version-update',
    title: '版本更新',
    description: '检查当前版本和本地更新状态。',
    statusText: '可检查',
  },
  {
    id: 'setting-about',
    title: '关于我们',
    description: '查看版本、服务范围和本地 MVP 说明。',
    statusText: '本地版',
  },
];

export const appVersionInfo = {
  currentVersion: '0.0.1',
  latestVersion: '0.0.1',
  channelText: '本地 MVP',
};

const initialOrders: RecentOrder[] = [
  {
    id: 'HY20260622001',
    status: 'waiting',
    from: '宝安区福永物流园',
    to: '南山区科技园门店',
    cargoType: '建材',
    weightText: '2.5 吨',
    quantityText: '16 件',
    vehicleRequirement: '中型货车',
    priceText: '￥680',
    createdAtIso: '2026-06-26T15:20:00+08:00',
    updatedAtIso: '2026-06-26T15:50:00+08:00',
    updatedAtText: '10 分钟前发布',
    pickupContact: '赵经理',
    pickupPhone: '13800138001',
    deliveryContact: '钱店长',
    deliveryPhone: '13800138002',
    pickupTimeIso: '2026-06-26T16:30:00+08:00',
    pickupTimeText: '今天 16:30',
    driverQuotes: [
      {
        driverId: 'D1001',
        driverName: '王师傅',
        driverPhone: '13900139000',
        ratingText: '4.9 分',
        vehicleText: '中型货车',
        plateNumber: '粤B·A12345',
        completedOrdersText: '326 单',
        quoteText: '￥680',
        arrivalText: '预计 28 分钟到达',
        noteText: '熟悉宝安到南山线路，可帮忙核对货物数量。',
        quotedAtText: '今天 15:20',
        quotedAtIso: '2026-07-15T07:20:00.000Z',
      },
      {
        driverId: 'D1002',
        driverName: '刘师傅',
        driverPhone: '13700137000',
        ratingText: '4.8 分',
        vehicleText: '厢式货车',
        plateNumber: '粤B·C6789',
        completedOrdersText: '214 单',
        quoteText: '￥720',
        arrivalText: '预计 35 分钟到达',
        noteText: '车辆带篷布，适合怕雨货物。',
        quotedAtText: '今天 15:40',
        quotedAtIso: '2026-07-15T07:40:00.000Z',
      },
    ],
  },
  {
    id: 'HY20260621008',
    status: 'transporting',
    from: '龙岗区坂田工厂',
    to: '福田区车公庙展厅',
    cargoType: '家电',
    weightText: '36 件',
    vehicleRequirement: '厢式货车',
    priceText: '￥520',
    createdAtIso: '2026-06-26T12:40:00+08:00',
    updatedAtIso: '2026-06-26T13:20:00+08:00',
    updatedAtText: '预计 18:20 到达',
    pickupContact: '黄主管',
    pickupPhone: '13600136000',
    deliveryContact: '陈经理',
    deliveryPhone: '13500135000',
    pickupTimeIso: '2026-06-26T13:00:00+08:00',
    pickupTimeText: '今天 13:00',
    driverInfo: {
      driverId: 'D1003',
      driverName: '陈师傅',
      driverPhone: '136****8821',
      ratingText: '4.9 分',
      vehicleText: '厢式货车',
      plateNumber: '粤B·K9286',
      completedOrdersText: '418 单',
    },
  },
  {
    id: 'HY20260620003',
    status: 'confirming',
    from: '盐田港仓储中心',
    to: '罗湖区翠竹门店',
    cargoType: '食品',
    weightText: '1.2 吨',
    vehicleRequirement: '小货车',
    priceText: '￥310',
    createdAtIso: '2026-06-25T09:20:00+08:00',
    updatedAtIso: '2026-06-25T10:40:00+08:00',
    updatedAtText: '等待确认送达',
    pickupContact: '林店长',
    pickupPhone: '13400134000',
    deliveryContact: '周主管',
    deliveryPhone: '13300133000',
    pickupTimeIso: '2026-06-25T10:00:00+08:00',
    pickupTimeText: '昨天 10:00',
    driverInfo: {
      driverId: 'D1004',
      driverName: '李师傅',
      driverPhone: '135****7612',
      ratingText: '4.7 分',
      vehicleText: '小货车',
      plateNumber: '粤B·M3021',
      completedOrdersText: '189 单',
    },
  },
];

export const orderListOrders: RecentOrder[] = [
  ...initialOrders,
  {
    id: 'HY20260619005',
    status: 'cancelled',
    from: '光明区公明仓库',
    to: '龙华区民治门店',
    cargoType: '日用品',
    weightText: '800 kg',
    vehicleRequirement: '小货车',
    priceText: '￥260',
    createdAtIso: '2026-06-24T08:30:00+08:00',
    updatedAtIso: '2026-06-24T09:10:00+08:00',
    updatedAtText: '已取消 · 2 天前',
  },
];

export const fallbackSafeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
};
