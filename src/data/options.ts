import type {
  CargoTypeOption,
  PaymentMethod,
  PricingMode,
  RecentOrderStatus,
  ShipperSummary,
  ValueAddedServiceOption,
  VehicleLengthRequirementOption,
  VehicleRequirementOption,
  VerificationStatus,
} from '../types';

/**
 * 业务字典常量。
 *
 * 这些是平台级静态枚举/文案映射（车型、货物类型、增值服务、定价模式、
 * 支付方式、异常类型、评价标签、状态文案等），与"本地演示假数据"不同：
 * 它们不是用来模拟平台返回的订单/消息/消费记录，而是表单选项和状态文案，
 * 平台模式下同样会使用。保持独立文件，避免和 demoSeed 混在一起。
 */

export const verificationCopy: Record<
  VerificationStatus,
  { label: string; description: string }
> = {
  unverified: {
    label: '未认证',
    description: '完成实名认证后可发布订单',
  },
  reviewing: {
    label: '审核中',
    description: '认证审核中，预计 1 个工作日内完成',
  },
  verified: {
    label: '已认证',
    description: '可发布货运订单',
  },
  rejected: {
    label: '认证失败',
    description: '认证失败，请重新提交资料',
  },
};

export const recentOrderStatusCopy: Record<
  RecentOrderStatus,
  { label: string; action: string }
> = {
  waiting: {
    label: '待接单',
    action: '查看报价',
  },
  loading: {
    label: '待装货',
    action: '联系司机',
  },
  transporting: {
    label: '运输中',
    action: '查看位置',
  },
  confirming: {
    label: '待确认',
    action: '确认送达',
  },
  completed: {
    label: '已完成',
    action: '再来一单',
  },
  cancelled: {
    label: '已取消',
    action: '重新下单',
  },
};

export const accountTypeCopy: Record<ShipperSummary['accountType'], string> = {
  personal: '个人货主',
  enterprise: '企业货主',
};

export const cargoTypeOptions: CargoTypeOption[] = [
  { id: 'build', label: '建材' },
  { id: 'food', label: '食品' },
  { id: 'home', label: '家电' },
  { id: 'chemistry', label: '化工' },
  { id: 'digital', label: '数码' },
  { id: 'daily', label: '日用品' },
  { id: 'other', label: '其他' },
];

export const vehicleRequirementOptions: VehicleRequirementOption[] = [
  { id: 'small', label: '小货车' },
  { id: 'medium', label: '中型货车' },
  { id: 'large', label: '大货车' },
  { id: 'box', label: '厢式货车' },
  { id: 'flat', label: '平板车' },
];

export const vehicleLengthRequirementOptions: VehicleLengthRequirementOption[] =
  [
    { id: 'unlimited', label: '不限' },
    { id: '3m', label: '3米' },
    { id: '4m', label: '4米' },
    { id: '6m', label: '6米' },
    { id: '9m', label: '9米' },
  ];

export const valueAddedServiceOptions: ValueAddedServiceOption[] = [
  { id: 'loading', label: '装卸协助' },
  { id: 'insurance', label: '保价运输' },
  { id: 'protection', label: '防震包装' },
];

export const pricingModeOptions: Array<{ id: PricingMode; label: string }> = [
  { id: 'fixed', label: '一口价' },
  { id: 'negotiable', label: '议价' },
];

export const paymentMethodOptions: Array<{ id: PaymentMethod; label: string }> =
  [
    { id: 'cod', label: '货到付款' },
    { id: 'online', label: '在线支付' },
  ];

export const exceptionTypeOptions = [
  { id: 'damage', label: '货物损坏' },
  { id: 'delay', label: '司机延误' },
  { id: 'address', label: '地址错误' },
  { id: 'other', label: '其他' },
];

export const evaluationTagOptions = [
  { id: 'punctual', label: '准时' },
  { id: 'service', label: '服务好' },
  { id: 'protect', label: '货物保护好' },
  { id: 'communicate', label: '沟通及时' },
];
