import { vehicleRequirementOptions } from '../../data/mockData';
import type {
  PlatformDriverAcceptanceSettings,
  PlatformDriverAdvanceOrderStatusRequest,
  PlatformCreateDriverWithdrawalRequest,
  PlatformDriverEvaluateShipperRequest,
  PlatformDriverExecutingOrderStatus,
  PlatformDriverQuoteOrderRequest,
  PlatformSaveDriverAcceptanceSettingsRequest,
  PlatformDriverWithdrawalRecord,
} from '../../services/platformDriverOrderApi';
import type { PlatformDriverCertificationSnapshot } from '../../services/platformDriverCertificationApi';
import { PlatformApiError } from '../../services/platformApiClient';
import type { PlatformShipperOrder } from '../../services/platformOrderApi';
import type { DriverEvaluationReplyQueue } from '../../utils/driverEvaluationReplyQueue';

/**
 * 司机首页的纯逻辑：表单请求构建、状态/按钮文案、金额与时间格式化、
 * 订单大厅筛选/提示、订单事件解析和失败提示映射。
 *
 * 从 DriverHomeScreen.tsx 下沉，便于单测；组件只保留 React 状态、平台调用
 * effect 和渲染。
 */

export type DriverOrderFormState = {
  quoteText: string;
  arrivalText: string;
  noteText: string;
};

export type DriverCertificationFormState = {
  realName: string;
  identityNumber: string;
  identityFrontFileId: string;
  identityBackFileId: string;
  plateNumber: string;
  vehicleType: string;
  vehicleLengthText: string;
  loadCapacityText: string;
  hasTailboard: boolean;
  drivingLicenseFileId: string;
  driverLicenseFileId: string;
  transportQualificationFileId: string;
  operationPermitFileId: string;
  vehiclePhotoFileId: string;
};

export type DriverAcceptanceSettingsFormState = {
  isOnline: boolean;
  maxDistanceKmText: string;
  vehicleTypePreferences: string[];
};

export type DriverWithdrawalFormState = {
  amountText: string;
  bankAccountName: string;
  bankName: string;
  bankAccountNo: string;
};

export type DriverShipperEvaluationFormState = {
  ratingText: string;
  tagsText: string;
  content: string;
  anonymous: boolean;
};

export type DriverExecutionProofState = Record<
  string,
  {
    transportingReceiptFileIds: string[];
    confirmingReceiptFileIds: string[];
  }
>;

export const emptyForm: DriverOrderFormState = {
  quoteText: '',
  arrivalText: '',
  noteText: '',
};

export const emptyCertificationForm: DriverCertificationFormState = {
  realName: '',
  identityNumber: '',
  identityFrontFileId: '',
  identityBackFileId: '',
  plateNumber: '',
  vehicleType: '',
  vehicleLengthText: '',
  loadCapacityText: '',
  hasTailboard: false,
  drivingLicenseFileId: '',
  driverLicenseFileId: '',
  transportQualificationFileId: '',
  operationPermitFileId: '',
  vehiclePhotoFileId: '',
};

export const emptyAcceptanceSettingsForm: DriverAcceptanceSettingsFormState = {
  isOnline: true,
  maxDistanceKmText: '50',
  vehicleTypePreferences: [],
};

export const emptyWithdrawalForm: DriverWithdrawalFormState = {
  amountText: '',
  bankAccountName: '',
  bankName: '',
  bankAccountNo: '',
};

export const emptyShipperEvaluationForm: DriverShipperEvaluationFormState = {
  ratingText: '',
  tagsText: '',
  content: '',
  anonymous: false,
};

export type DriverCertificationFileFieldName =
  | 'identityFrontFileId'
  | 'identityBackFileId'
  | 'drivingLicenseFileId'
  | 'driverLicenseFileId'
  | 'transportQualificationFileId'
  | 'operationPermitFileId'
  | 'vehiclePhotoFileId';

export type DriverCertificationFileUploadConfig = {
  fileName: string;
  successNotice: string;
  failureNotice: string;
};

export const driverCertificationFileUploadConfigs: Record<
  DriverCertificationFileFieldName,
  DriverCertificationFileUploadConfig
> = {
  identityFrontFileId: {
    fileName: '身份证人像面.png',
    successNotice: '身份证人像面已关联平台文件。',
    failureNotice: '身份证人像面上传失败，请稍后重试。',
  },
  identityBackFileId: {
    fileName: '身份证国徽面.png',
    successNotice: '身份证国徽面已关联平台文件。',
    failureNotice: '身份证国徽面上传失败，请稍后重试。',
  },
  drivingLicenseFileId: {
    fileName: '行驶证.png',
    successNotice: '行驶证已关联平台文件。',
    failureNotice: '行驶证上传失败，请稍后重试。',
  },
  driverLicenseFileId: {
    fileName: '驾驶证.png',
    successNotice: '驾驶证已关联平台文件。',
    failureNotice: '驾驶证上传失败，请稍后重试。',
  },
  transportQualificationFileId: {
    fileName: '从业资格证.png',
    successNotice: '从业资格证已关联平台文件。',
    failureNotice: '从业资格证上传失败，请稍后重试。',
  },
  operationPermitFileId: {
    fileName: '营运证.png',
    successNotice: '营运证已关联平台文件。',
    failureNotice: '营运证上传失败，请稍后重试。',
  },
  vehiclePhotoFileId: {
    fileName: '车辆照片.png',
    successNotice: '车辆照片已关联平台文件。',
    failureNotice: '车辆照片上传失败，请稍后重试。',
  },
};

export function createQuoteRequest(
  form: DriverOrderFormState,
): PlatformDriverQuoteOrderRequest | undefined {
  const quoteYuan = Number(form.quoteText.trim());
  const arrivalText = form.arrivalText.trim();

  if (!Number.isFinite(quoteYuan) || quoteYuan <= 0 || !arrivalText) {
    return undefined;
  }

  const noteText = form.noteText.trim();

  return {
    quoteCents: Math.round(quoteYuan * 100),
    arrivalText,
    ...(noteText ? { noteText } : {}),
  };
}

export function createAcceptanceSettingsForm(
  settings: PlatformDriverAcceptanceSettings,
): DriverAcceptanceSettingsFormState {
  return {
    isOnline: settings.isOnline,
    maxDistanceKmText: String(settings.maxDistanceKm),
    vehicleTypePreferences: [...settings.vehicleTypePreferences],
  };
}

export function createAcceptanceSettingsRequest(
  form: DriverAcceptanceSettingsFormState,
): PlatformSaveDriverAcceptanceSettingsRequest | undefined {
  const maxDistanceKm = Number(form.maxDistanceKmText.trim());

  if (
    !Number.isInteger(maxDistanceKm) ||
    maxDistanceKm < 1 ||
    maxDistanceKm > 500
  ) {
    return undefined;
  }

  if (
    form.vehicleTypePreferences.length > 10 ||
    new Set(form.vehicleTypePreferences).size !==
      form.vehicleTypePreferences.length
  ) {
    return undefined;
  }

  return {
    isOnline: form.isOnline,
    maxDistanceKm,
    vehicleTypePreferences: [...form.vehicleTypePreferences],
  };
}

export function createDriverWithdrawalRequest(
  form: DriverWithdrawalFormState,
): PlatformCreateDriverWithdrawalRequest | undefined {
  const amountYuan = Number(form.amountText.trim());
  const bankAccountName = form.bankAccountName.trim();
  const bankName = form.bankName.trim();
  const bankAccountNo = form.bankAccountNo.replace(/\s+/g, '');

  if (
    !Number.isFinite(amountYuan) ||
    amountYuan < 1 ||
    bankAccountName.length < 2 ||
    bankName.length < 2 ||
    !/^\d{10,30}$/.test(bankAccountNo)
  ) {
    return undefined;
  }

  return {
    amountCents: Math.round(amountYuan * 100),
    bankAccountName,
    bankName,
    bankAccountNo,
  };
}

export function createShipperEvaluationRequest(
  form: DriverShipperEvaluationFormState,
): PlatformDriverEvaluateShipperRequest | undefined {
  const rating = Number(form.ratingText.trim());
  const tags = form.tagsText
    .split(/[、,，]/)
    .map(tag => tag.trim())
    .filter(Boolean)
    .filter((tag, index, allTags) => allTags.indexOf(tag) === index);
  const content = form.content.trim();

  if (
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    tags.length === 0 ||
    tags.length > 6 ||
    content.length < 6 ||
    content.length > 200
  ) {
    return undefined;
  }

  return {
    rating,
    tags,
    content,
    ...(form.anonymous ? { anonymous: true } : {}),
  };
}

export function upsertOrder(
  orders: PlatformShipperOrder[],
  updatedOrder: PlatformShipperOrder,
) {
  const hasOrder = orders.some(order => order.id === updatedOrder.id);

  if (!hasOrder) {
    return [updatedOrder, ...orders];
  }

  return orders.map(order =>
    order.id === updatedOrder.id ? updatedOrder : order,
  );
}

export function getNextDriverStatus(
  status: PlatformShipperOrder['status'],
): PlatformDriverAdvanceOrderStatusRequest['nextStatus'] | undefined {
  if (status === 'loading') {
    return 'transporting';
  }

  if (status === 'transporting') {
    return 'confirming';
  }

  return undefined;
}

export function getDriverStatusText(status: PlatformShipperOrder['status']) {
  const textByStatus: Record<PlatformShipperOrder['status'], string> = {
    waiting: '待接单',
    loading: '待装货',
    transporting: '运输中',
    confirming: '待货主确认',
    completed: '已完成',
    cancelled: '已取消',
  };

  return textByStatus[status];
}

export function getDriverAdvanceButtonText(
  status: PlatformShipperOrder['status'],
) {
  const nextStatus = getNextDriverStatus(status);

  if (nextStatus === 'transporting') {
    return '确认发车';
  }

  if (nextStatus === 'confirming') {
    return '确认到达';
  }

  return '暂无可推进状态';
}

export function getDriverReceiptUploadButtonText(
  status: PlatformShipperOrder['status'],
) {
  if (status === 'loading') {
    return '上传装货凭证';
  }

  if (status === 'transporting') {
    return '上传到达凭证';
  }

  return '上传执行凭证';
}

export function createDriverAdvanceSuccessNotice(
  nextStatus: PlatformDriverExecutingOrderStatus,
) {
  if (nextStatus === 'transporting') {
    return '司机已确认发车。';
  }

  return '司机已确认到达，等待货主确认。';
}

export function getCertificationStatusText(
  status: PlatformDriverCertificationSnapshot['identity']['status'] | undefined,
) {
  const textByStatus: Record<
    PlatformDriverCertificationSnapshot['identity']['status'],
    string
  > = {
    unsubmitted: '未提交',
    reviewing: '审核中',
    approved: '已通过',
    rejected: '已驳回',
  };

  return status ? textByStatus[status] : '未加载';
}

export function createDriverOrderHallNotice(
  orders: PlatformShipperOrder[],
  acceptanceSettings: PlatformDriverAcceptanceSettings | undefined,
) {
  const filteredOrders = filterDriverOrderHallOrders(orders, acceptanceSettings);

  if (acceptanceSettings?.isOnline === false) {
    return '当前处于离线接单，可查看订单但无法报价或接单。';
  }

  if (filteredOrders.length > 0) {
    return '';
  }

  if (orders.length > 0 && acceptanceSettings?.vehicleTypePreferences.length) {
    return '当前接单车型下暂无匹配订单。';
  }

  return '暂无可接订单。';
}

export function filterDriverOrderHallOrders(
  orders: PlatformShipperOrder[],
  acceptanceSettings: PlatformDriverAcceptanceSettings | undefined,
) {
  const vehicleTypePreferences =
    acceptanceSettings?.vehicleTypePreferences ?? [];

  if (!vehicleTypePreferences.length) {
    return orders;
  }

  return orders.filter(order =>
    vehicleTypePreferences.includes(order.vehicleRequirement),
  );
}

export function getDriverAcceptanceVehicleTypesText(
  vehicleTypePreferences: string[],
) {
  if (vehicleTypePreferences.length === 0) {
    return '不限';
  }

  return vehicleTypePreferences
    .map(
      vehicleType =>
        vehicleRequirementOptions.find(option => option.id === vehicleType)
          ?.label ?? vehicleType,
    )
    .join('、');
}

export function formatDriverCurrency(valueCents: number) {
  return `￥${(valueCents / 100).toFixed(2)}`;
}

export function formatDriverIncomeTime(value: string) {
  return value.replace('T', ' ').slice(0, 16);
}

export function getDriverWithdrawalStatusText(
  status: PlatformDriverWithdrawalRecord['status'],
) {
  const textByStatus: Record<PlatformDriverWithdrawalRecord['status'], string> =
    {
      reviewing: '审核中',
      paid: '已打款',
      rejected: '已驳回',
    };

  return textByStatus[status];
}

export function hasDriverEvaluationSubmitted(order: PlatformShipperOrder) {
  return (
    order.events?.some(event => event.eventType === 'evaluation_submitted') ??
    false
  );
}

export function getLatestDriverEvaluationReply(order: PlatformShipperOrder) {
  return (order.events ?? [])
    .filter(event => event.eventType === 'evaluation_replied')
    .sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso))[0];
}

export function getLatestDriverShipperEvaluation(order: PlatformShipperOrder) {
  return (order.events ?? [])
    .filter(event => event.eventType === 'shipper_evaluation_submitted')
    .sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso))[0];
}

export function omitDriverEvaluationReplyQueueItem(
  queue: DriverEvaluationReplyQueue,
  orderId: string,
) {
  const nextQueue = { ...queue };
  delete nextQueue[orderId];
  return nextQueue;
}

export function isDriverEvaluationReplyMissingAccessToken(error: unknown) {
  return (
    error instanceof PlatformApiError &&
    error.code === 'AUTH_ACCESS_TOKEN_MISSING'
  );
}

export function getDriverOrderActionFailureNotice(
  error: unknown,
  fallbackNotice: string,
) {
  if (
    error instanceof PlatformApiError &&
    error.code === 'DRIVER_ACCEPTANCE_OFFLINE'
  ) {
    return '当前处于离线接单，请先打开接单开关。';
  }

  if (
    error instanceof PlatformApiError &&
    error.code === 'DRIVER_CERTIFICATION_REQUIRED'
  ) {
    return '司机实名和车辆认证通过后才能接单。';
  }

  return fallbackNotice;
}

export function getDriverExecutionReceiptFileIds(
  executionProofs: DriverExecutionProofState,
  orderId: string,
  status: PlatformShipperOrder['status'],
) {
  const proofs = executionProofs[orderId];

  if (!proofs) {
    return [];
  }

  if (status === 'loading') {
    return proofs.transportingReceiptFileIds;
  }

  if (status === 'transporting') {
    return proofs.confirmingReceiptFileIds;
  }

  return [];
}
