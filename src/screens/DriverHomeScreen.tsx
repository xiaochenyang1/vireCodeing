import { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ImageCredentialCard } from '../components/ImageCredentialCard';
import { IncomeChart } from '../components/IncomeChart';
import { DriverOrderExecution } from '../components/DriverOrderExecution';
import { vehicleRequirementOptions } from '../data/options';
import { useImageUpload } from '../hooks/useImageUpload';
import { colors, styles } from '../styles';
import type {
  PlatformDriverAcceptanceSettings,
  PlatformDriverAcceptOrderRequest,
  PlatformDriverAdvanceOrderStatusRequest,
  PlatformDriverBankCardRecord,
  PlatformDriverIncomeOverview,
  PlatformDriverReplyEvaluationRequest,
  PlatformDriverWithdrawalRecord,
  createPlatformDriverOrderApi,
} from '../services/platformDriverOrderApi';
import type {
  PlatformDriverLocationSnapshot,
  PlatformNavigationTarget,
  createPlatformMapsApi,
} from '../services/platformMapsApi';
import {
  buildExternalNavigationUrls,
  formatCoordinateText,
  formatTrackingEstimateText,
} from '../utils/mapsNavigation';
import { formatPlatformIsoMinute } from '../utils/dateTime';
import type {
  PlatformDriverCertificationSnapshot,
  createPlatformDriverCertificationApi,
} from '../services/platformDriverCertificationApi';
import { PlatformApiError } from '../services/platformApiClient';
import {
  type PlatformFileUploadRecord,
  createPlatformFileApi,
} from '../services/platformFileApi';
import type {
  PlatformOrderExceptionCase,
  PlatformShipperOrder,
} from '../services/platformOrderApi';
import { ExceptionCaseProgressPanel } from './order-detail/ExceptionCaseProgressPanel';
import {
  hydrateDriverEvaluationReplyQueue,
  saveDriverEvaluationReplyQueue,
  type DriverEvaluationReplyQueue,
  type DriverEvaluationReplyQueueItem,
} from '../utils/driverEvaluationReplyQueue';
import {
  createDriverOrderMutationQueueKey,
  hydrateDriverOrderMutationQueue,
  saveDriverOrderMutationQueue,
  type DriverOrderMutationQueue,
  type DriverOrderMutationQueueItem,
} from '../utils/driverOrderMutationQueue';
import {
  createOrderMutationContext,
  getOrderMutationFailureAction,
} from '../utils/orderMutationSync';
import {
  getOrderExceptionCaseSummaryHeadline,
  getOrderExceptionCaseSummaryText,
  sortOrderExceptionCases,
} from '../utils/orderExceptionCases';
import {
  createAcceptanceSettingsForm,
  createAcceptanceSettingsRequest,
  createDriverBankCardForm,
  createDriverBankCardRequest,
  createDriverBankCardUpdateRequest,
  createDriverAdvanceSuccessNotice,
  createDriverExceptionRequest,
  createDriverOrderHallNotice,
  createDriverWithdrawalRequest,
  createQuoteRequest,
  createShipperEvaluationRequest,
  canDriverReportException,
  createDriverCertificationForm,
  driverCertificationFileUploadConfigs,
  driverExceptionTypeOptions,
  emptyAcceptanceSettingsForm,
  emptyCertificationForm,
  emptyExceptionForm,
  emptyForm,
  emptyShipperEvaluationForm,
  emptyWithdrawalForm,
  aggregateIncomeRecordsByDay,
  filterDriverOrderHallOrders,
  filterDriverOrderHallOrdersByLocalFilter,
  formatDriverBankCardNumberInput,
  formatDriverCurrency,
  formatDriverIncomeTime,
  getCertificationStatusText,
  getDriverAcceptanceVehicleTypesText,
  getDriverAdvanceButtonText,
  getDriverBankCardLastUsedText,
  getDriverIncomeRecordBreakdownText,
  getDriverIncomeRecordSummaryText,
  getDriverIncomeSummaryText,
  getDriverExecutionReceiptFileIds,
  getDriverOrderHallBonusText,
  getDriverOrderActionFailureNotice,
  getDriverOrderHallPricingText,
  getDriverReceiptUploadButtonText,
  getDriverOrderPickupDistanceText,
  sortDriverOrderHallOrders,
  sortDriverMyOrders,
  isDriverAcceptanceSettingsFormDirty,
  isDriverCertificationFormDirty,
  getDriverStatusText,
  sortDriverWithdrawals,
  getDriverWithdrawalStatusDetailText,
  getDriverWithdrawalStatusText,
  getLatestDriverEvaluationReply,
  getLatestDriverException,
  getLatestDriverShipperEvaluation,
  getNextDriverStatus,
  hasDriverEvaluationSubmitted,
  isDriverBankCardNumberValid,
  isDriverEvaluationReplyMissingAccessToken,
  isDriverWithdrawalFormPristine,
  omitDriverEvaluationReplyQueueItem,
  sortDriverBankCards,
  sortDriverIncomeRecords,
  upsertOrder,
  type DriverAcceptanceSettingsFormState,
  type DriverBankCardFormState,
  type DriverCertificationFileFieldName,
  type DriverCertificationFormState,
  type DriverExceptionFormState,
  type DriverExecutionProofState,
  type DriverOrderHallLocalFilter,
  type DriverOrderFormState,
  type DriverShipperEvaluationFormState,
  type DriverWithdrawalFormState,
} from './driver-home/driverHomeUtils';

type PlatformDriverOrderApi = ReturnType<typeof createPlatformDriverOrderApi>;
type PlatformDriverCertificationApi = ReturnType<
  typeof createPlatformDriverCertificationApi
>;
type DriverPlatformFileApi = Pick<
  ReturnType<typeof createPlatformFileApi>,
  'createUploadIntent' | 'confirmUploaded'
> &
  Partial<
    Pick<
      ReturnType<typeof createPlatformFileApi>,
      'confirmLocalUploadTarget' | 'getFileMetadata'
    >
  >;
type PlatformMapsApi = Pick<
  ReturnType<typeof createPlatformMapsApi>,
  'getDriverLocation' | 'getDriverNavigationTargets' | 'reportDriverLocation'
>;
type DriverUploadedFileRef = {
  file: PlatformFileUploadRecord;
  fileName: string;
};
type DriverCertificationAttachmentMap = Partial<
  Record<DriverCertificationFileFieldName, DriverUploadedFileRef>
>;
type DriverCertificationAttachmentSource =
  | 'file-object'
  | 'snapshot'
  | 'manual'
  | 'empty';
type DriverExceptionAttachmentState = Record<string, DriverUploadedFileRef[]>;
type DriverReportedExceptionAttachmentState = Record<
  string,
  DriverUploadedFileRef[]
>;
type DriverShipperEvaluationAttachmentState = Record<
  string,
  DriverUploadedFileRef[]
>;
type DriverExecutionReceiptAttachmentState = Record<
  string,
  {
    transportingReceiptFiles: DriverUploadedFileRef[];
    confirmingReceiptFiles: DriverUploadedFileRef[];
  }
>;
const sandboxDriverLocation = {
  latitude: 22.6,
  longitude: 113.9,
  accuracyMeters: 25,
};

const driverOrderHallFilterOptions: Array<{
  id: DriverOrderHallLocalFilter;
  label: string;
  testID: string;
}> = [
  { id: 'all', label: '全部', testID: 'driver-order-hall-filter-all' },
  {
    id: 'nearby',
    label: '10 公里内',
    testID: 'driver-order-hall-filter-nearby',
  },
  { id: 'bonus', label: '有赏金', testID: 'driver-order-hall-filter-bonus' },
  {
    id: 'negotiable',
    label: '议价单',
    testID: 'driver-order-hall-filter-negotiable',
  },
];

function getDriverLocationSourceText(
  source: PlatformDriverLocationSnapshot['source'],
) {
  if (source === 'sandbox') {
    return 'sandbox 上报';
  }

  if (source === 'device') {
    return '设备定位';
  }

  return '手动上报';
}

function getDriverLocationMetaText(
  snapshot: Pick<PlatformDriverLocationSnapshot, 'source'> &
    Partial<Pick<PlatformDriverLocationSnapshot, 'recordedAtIso'>>,
) {
  const sourceText = `来源：${getDriverLocationSourceText(snapshot.source)}`;

  if (!snapshot.recordedAtIso) {
    return sourceText;
  }

  return `${sourceText} · 上报时间：${formatDriverIncomeTime(
    snapshot.recordedAtIso,
  )}`;
}

function useDriverPngUpload(
  platformFileApi: DriverPlatformFileApi | undefined,
  purpose: 'identity' | 'exception' | 'receipt' | 'evaluation',
  fileName: string,
) {
  return useImageUpload(platformFileApi, {
    purpose,
    fileName,
    contentType: 'image/png',
    byteSize: 2048,
  });
}

function getDriverCertificationFileStatusText(
  status: PlatformFileUploadRecord['status'],
) {
  switch (status) {
    case 'uploaded':
      return '已上传';
    case 'rejected':
      return '已驳回';
    default:
      return '待上传';
  }
}

function getDriverStatusBadgeColor(status: string): string {
  switch (status) {
    case 'loading':
      return colors.teal;
    case 'transporting':
      return '#007AFF';
    case 'confirming':
      return '#FF9500';
    case 'completed':
      return colors.textMuted;
    case 'waiting':
      return colors.textSecondary;
    case 'cancelled':
      return '#FF3B30';
    default:
      return colors.textSecondary;
  }
}

function getDriverCertificationSnapshotFileId(
  certification: PlatformDriverCertificationSnapshot | undefined,
  fieldName: DriverCertificationFileFieldName,
) {
  switch (fieldName) {
    case 'identityFrontFileId':
      return certification?.identity.identityFrontFileId;
    case 'identityBackFileId':
      return certification?.identity.identityBackFileId;
    case 'drivingLicenseFileId':
      return certification?.vehicle.drivingLicenseFileId;
    case 'driverLicenseFileId':
      return certification?.vehicle.driverLicenseFileId;
    case 'transportQualificationFileId':
      return certification?.vehicle.transportQualificationFileId;
    case 'operationPermitFileId':
      return certification?.vehicle.operationPermitFileId;
    case 'vehiclePhotoFileId':
      return certification?.vehicle.vehiclePhotoFileId;
    default:
      return undefined;
  }
}

const driverCertificationAttachmentFieldNames: DriverCertificationFileFieldName[] =
  [
    'identityFrontFileId',
    'identityBackFileId',
    'drivingLicenseFileId',
    'driverLicenseFileId',
    'transportQualificationFileId',
    'operationPermitFileId',
    'vehiclePhotoFileId',
  ];

function createDriverUploadedFileRef(
  file: PlatformFileUploadRecord,
  fileName: string,
): DriverUploadedFileRef {
  return {
    file,
    fileName,
  };
}

function mergeDriverUploadedFileRef(
  primary: DriverUploadedFileRef | undefined,
  fallback: DriverUploadedFileRef | undefined,
) {
  if (!primary) {
    return fallback;
  }

  if (!fallback || primary.file.id !== fallback.file.id) {
    return primary;
  }

  return {
    fileName: primary.fileName || fallback.fileName,
    file: {
      ...fallback.file,
      ...primary.file,
      objectKey: primary.file.objectKey || fallback.file.objectKey,
      publicUrl: primary.file.publicUrl || fallback.file.publicUrl,
    },
  };
}

function mergeDriverUploadedFileRefs(
  primary: DriverUploadedFileRef[] | undefined,
  fallback: DriverUploadedFileRef[] | undefined,
) {
  if (!primary?.length) {
    return fallback ? [...fallback] : [];
  }

  if (!fallback?.length) {
    return [...primary];
  }

  const fallbackByFileId = new Map(
    fallback.map(attachment => [attachment.file.id, attachment]),
  );
  const usedFallbackFileIds = new Set<string>();
  const mergedAttachments = primary.map(attachment => {
    const fallbackAttachment = fallbackByFileId.get(attachment.file.id);

    if (fallbackAttachment) {
      usedFallbackFileIds.add(attachment.file.id);
    }

    return (
      mergeDriverUploadedFileRef(attachment, fallbackAttachment) ?? attachment
    );
  });

  fallback.forEach(attachment => {
    if (usedFallbackFileIds.has(attachment.file.id)) {
      return;
    }

    mergedAttachments.push(attachment);
  });

  return mergedAttachments;
}

function createFallbackDriverUploadedFileRef(
  fileId: string,
  purpose: PlatformFileUploadRecord['purpose'],
  fileName: string,
  createdAtIso: string,
) {
  return createDriverUploadedFileRef(
    {
      id: fileId,
      ownerUserId: '',
      purpose,
      objectKey: '',
      status: 'uploaded',
      createdAtIso,
    },
    fileName,
  );
}

async function hydrateDriverUploadedFileRefs(
  fileIds: string[] | undefined,
  options: {
    purpose: PlatformFileUploadRecord['purpose'];
    fileName: string | ((index: number) => string);
    createdAtIso: string;
  },
  platformFileApi?: DriverPlatformFileApi,
  metadataCache = new Map<string, Promise<PlatformFileUploadRecord>>(),
) {
  const normalizedFileIds = (fileIds ?? [])
    .map(fileId => fileId.trim())
    .filter(Boolean);

  return Promise.all(
    normalizedFileIds.map(async (fileId, index) => {
      const fileName =
        typeof options.fileName === 'function'
          ? options.fileName(index)
          : options.fileName;

      if (!platformFileApi?.getFileMetadata) {
        return createFallbackDriverUploadedFileRef(
          fileId,
          options.purpose,
          fileName,
          options.createdAtIso,
        );
      }

      let metadataPromise = metadataCache.get(fileId);

      if (!metadataPromise) {
        metadataPromise = platformFileApi.getFileMetadata(fileId);
        metadataCache.set(fileId, metadataPromise);
      }

      try {
        const file = await metadataPromise;

        if (!file?.id) {
          throw new Error('Driver uploaded file metadata is invalid');
        }

        return createDriverUploadedFileRef(file, fileName);
      } catch {
        return createFallbackDriverUploadedFileRef(
          fileId,
          options.purpose,
          fileName,
          options.createdAtIso,
        );
      }
    }),
  );
}

async function buildDriverCertificationAttachments(
  certification: PlatformDriverCertificationSnapshot,
  platformFileApi?: DriverPlatformFileApi,
) {
  if (!platformFileApi?.getFileMetadata) {
    return {};
  }

  const { getFileMetadata } = platformFileApi;
  const entries = await Promise.all(
    driverCertificationAttachmentFieldNames.map(async fieldName => {
      const fileId =
        getDriverCertificationSnapshotFileId(
          certification,
          fieldName,
        )?.trim() ?? '';

      if (!fileId) {
        return undefined;
      }

      try {
        const file = await getFileMetadata(fileId);

        return [
          fieldName,
          createDriverUploadedFileRef(
            file,
            driverCertificationFileUploadConfigs[fieldName].fileName,
          ),
        ] as const;
      } catch {
        return undefined;
      }
    }),
  );

  return entries.reduce<DriverCertificationAttachmentMap>((result, entry) => {
    if (entry) {
      result[entry[0]] = entry[1];
    }

    return result;
  }, {});
}

async function buildDriverExecutionReceiptAttachments(
  order: PlatformShipperOrder,
  platformFileApi?: DriverPlatformFileApi,
) {
  const driverStatusEvents = (order.events ?? [])
    .filter(event => event.eventType === 'driver_status_changed')
    .sort((left, right) => left.createdAtIso.localeCompare(right.createdAtIso));
  const loadingReceiptEvent = driverStatusEvents[0];
  const arrivalReceiptEvent = driverStatusEvents[1];
  const metadataCache = new Map<string, Promise<PlatformFileUploadRecord>>();
  const [transportingReceiptFiles, confirmingReceiptFiles] = await Promise.all([
    hydrateDriverUploadedFileRefs(
      loadingReceiptEvent?.attachmentFileIds,
      {
        purpose: 'receipt',
        fileName: '装货凭证.png',
        createdAtIso: loadingReceiptEvent?.createdAtIso ?? '',
      },
      platformFileApi,
      metadataCache,
    ),
    hydrateDriverUploadedFileRefs(
      arrivalReceiptEvent?.attachmentFileIds,
      {
        purpose: 'receipt',
        fileName: '到达凭证.png',
        createdAtIso: arrivalReceiptEvent?.createdAtIso ?? '',
      },
      platformFileApi,
      metadataCache,
    ),
  ]);

  return {
    transportingReceiptFiles,
    confirmingReceiptFiles,
  };
}

function mergeDriverExecutionReceiptAttachments(
  hydrated: {
    transportingReceiptFiles: DriverUploadedFileRef[];
    confirmingReceiptFiles: DriverUploadedFileRef[];
  },
  current:
    | {
        transportingReceiptFiles: DriverUploadedFileRef[];
        confirmingReceiptFiles: DriverUploadedFileRef[];
      }
    | undefined,
) {
  return {
    transportingReceiptFiles: mergeDriverUploadedFileRefs(
      hydrated.transportingReceiptFiles,
      current?.transportingReceiptFiles,
    ),
    confirmingReceiptFiles: mergeDriverUploadedFileRefs(
      hydrated.confirmingReceiptFiles,
      current?.confirmingReceiptFiles,
    ),
  };
}

async function buildDriverLatestExceptionAttachments(
  order: PlatformShipperOrder,
  exceptionCases: PlatformOrderExceptionCase[],
  platformFileApi?: DriverPlatformFileApi,
) {
  const latestExceptionEvent = (order.events ?? [])
    .filter(event => event.eventType === 'driver_exception_reported')
    .sort((left, right) =>
      right.createdAtIso.localeCompare(left.createdAtIso),
    )[0];
  const normalizedEventAttachmentFileIds = (
    latestExceptionEvent?.attachmentFileIds ?? []
  )
    .map(fileId => fileId.trim())
    .filter(Boolean);
  const matchingExceptionCase =
    normalizedEventAttachmentFileIds.length > 0 || !latestExceptionEvent?.id
      ? undefined
      : sortOrderExceptionCases(exceptionCases).find(
          exceptionCase =>
            exceptionCase.sourceEventId === latestExceptionEvent.id &&
            exceptionCase.attachmentFileIds.some(fileId => fileId.trim()),
        );
  const fallbackAttachmentFileIds =
    normalizedEventAttachmentFileIds.length > 0
      ? latestExceptionEvent?.attachmentFileIds
      : matchingExceptionCase?.attachmentFileIds;
  const createdAtIso =
    normalizedEventAttachmentFileIds.length > 0
      ? latestExceptionEvent?.createdAtIso ?? ''
      : matchingExceptionCase?.updatedAtIso ??
        matchingExceptionCase?.createdAtIso ??
        latestExceptionEvent?.createdAtIso ??
        '';

  return hydrateDriverUploadedFileRefs(
    fallbackAttachmentFileIds,
    {
      purpose: 'exception',
      fileName: index => `异常凭证-${index + 1}.png`,
      createdAtIso,
    },
    platformFileApi,
  );
}

async function buildDriverLatestShipperEvaluationAttachments(
  order: PlatformShipperOrder,
  platformFileApi?: DriverPlatformFileApi,
) {
  const latestShipperEvaluationEvent = (order.events ?? [])
    .filter(event => event.eventType === 'shipper_evaluation_submitted')
    .sort((left, right) =>
      right.createdAtIso.localeCompare(left.createdAtIso),
    )[0];

  return hydrateDriverUploadedFileRefs(
    latestShipperEvaluationEvent?.attachmentFileIds,
    {
      purpose: 'evaluation',
      fileName: index => `评价货主凭证-${index + 1}.png`,
      createdAtIso: latestShipperEvaluationEvent?.createdAtIso ?? '',
    },
    platformFileApi,
  );
}

function mergeDriverCertificationAttachments(
  current: DriverCertificationAttachmentMap,
  certification: PlatformDriverCertificationSnapshot,
  hydrated: DriverCertificationAttachmentMap,
) {
  return driverCertificationAttachmentFieldNames.reduce<DriverCertificationAttachmentMap>(
    (result, fieldName) => {
      const fileId =
        getDriverCertificationSnapshotFileId(
          certification,
          fieldName,
        )?.trim() ?? '';

      if (!fileId) {
        return result;
      }

      const currentAttachment =
        current[fieldName]?.file.id === fileId ? current[fieldName] : undefined;
      const mergedAttachment = mergeDriverUploadedFileRef(
        hydrated[fieldName],
        currentAttachment,
      );

      if (mergedAttachment) {
        result[fieldName] = mergedAttachment;
      }

      return result;
    },
    {},
  );
}

export function DriverHomeScreen({
  platformDriverOrderApi,
  platformDriverCertificationApi,
  platformFileApi,
  platformMapsApi,
  driverAccountId = 'local-driver',
  onLogout,
}: {
  platformDriverOrderApi?: PlatformDriverOrderApi;
  platformDriverCertificationApi?: PlatformDriverCertificationApi;
  platformFileApi?: DriverPlatformFileApi;
  platformMapsApi?: PlatformMapsApi;
  driverAccountId?: string;
  onLogout: () => void;
}) {
  const resolvedDriverAccountId = driverAccountId.trim() || 'local-driver';
  const [orderHallOrders, setOrderHallOrders] = useState<
    PlatformShipperOrder[]
  >([]);
  const [orderHallSearchKeyword, setOrderHallSearchKeyword] = useState('');
  const [activeOrderHallFilter, setActiveOrderHallFilter] =
    useState<DriverOrderHallLocalFilter>('all');
  const [myOrders, setMyOrders] = useState<PlatformShipperOrder[]>([]);
  const [myOrdersSearchKeyword, setMyOrdersSearchKeyword] = useState('');
  const [activeMyOrdersFilter, setActiveMyOrdersFilter] =
    useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<PlatformShipperOrder>();
  const [exceptionCases, setExceptionCases] = useState<
    PlatformOrderExceptionCase[]
  >([]);
  const [isLoadingExceptionCases, setIsLoadingExceptionCases] = useState(false);
  const [exceptionCaseNotice, setExceptionCaseNotice] = useState<string>();
  const [appealDrafts, setAppealDrafts] = useState<Record<string, string>>({});
  const [appealingCaseId, setAppealingCaseId] = useState<string>();
  const [navigationTargets, setNavigationTargets] = useState<
    PlatformNavigationTarget[]
  >([]);
  const [latestReportedHallLocation, setLatestReportedHallLocation] =
    useState<PlatformDriverLocationSnapshot>();
  const [latestReportedDriverLocation, setLatestReportedDriverLocation] =
    useState<PlatformDriverLocationSnapshot>();
  const [certification, setCertification] =
    useState<PlatformDriverCertificationSnapshot>();
  const [incomeOverview, setIncomeOverview] =
    useState<PlatformDriverIncomeOverview>();
  const [withdrawals, setWithdrawals] = useState<
    PlatformDriverWithdrawalRecord[]
  >([]);
  const [acceptanceSettings, setAcceptanceSettings] =
    useState<PlatformDriverAcceptanceSettings>();
  const [acceptanceSettingsForm, setAcceptanceSettingsForm] =
    useState<DriverAcceptanceSettingsFormState>(emptyAcceptanceSettingsForm);
  const [withdrawalForm, setWithdrawalForm] =
    useState<DriverWithdrawalFormState>(emptyWithdrawalForm);
  const withdrawalIdempotencyKeyRef = useRef<string | undefined>(undefined);
  const [bankCards, setBankCards] = useState<PlatformDriverBankCardRecord[]>(
    [],
  );
  const [bankCardForm, setBankCardForm] = useState<DriverBankCardFormState>({
    bankAccountName: '',
    bankName: '',
    bankAccountNo: '',
    isDefault: false,
  });
  const [editingBankCardId, setEditingBankCardId] = useState<
    string | undefined
  >();
  const [showBankCardForm, setShowBankCardForm] = useState(false);
  const [certificationForm, setCertificationForm] =
    useState<DriverCertificationFormState>(emptyCertificationForm);
  const [certificationAttachments, setCertificationAttachments] =
    useState<DriverCertificationAttachmentMap>({});
  const [exceptionAttachments, setExceptionAttachments] =
    useState<DriverExceptionAttachmentState>({});
  const [reportedExceptionAttachments, setReportedExceptionAttachments] =
    useState<DriverReportedExceptionAttachmentState>({});
  const [shipperEvaluationAttachments, setShipperEvaluationAttachments] =
    useState<DriverShipperEvaluationAttachmentState>({});
  const [
    reportedShipperEvaluationAttachments,
    setReportedShipperEvaluationAttachments,
  ] = useState<DriverShipperEvaluationAttachmentState>({});
  const [executionReceiptAttachments, setExecutionReceiptAttachments] =
    useState<DriverExecutionReceiptAttachmentState>({});
  const [executionProofs, setExecutionProofs] =
    useState<DriverExecutionProofState>({});
  const [forms, setForms] = useState<Record<string, DriverOrderFormState>>({});
  const [evaluationReplyForms, setEvaluationReplyForms] = useState<
    Record<string, string>
  >({});
  const [shipperEvaluationForms, setShipperEvaluationForms] = useState<
    Record<string, DriverShipperEvaluationFormState>
  >({});
  const [exceptionForms, setExceptionForms] = useState<
    Record<string, DriverExceptionFormState>
  >({});
  const [evaluationReplyQueue, setEvaluationReplyQueue] =
    useState<DriverEvaluationReplyQueue>({});
  const [orderMutationQueue, setOrderMutationQueue] =
    useState<DriverOrderMutationQueue>({});
  const [notice, setNotice] = useState('');
  const [isRefreshingHomeSnapshot, setIsRefreshingHomeSnapshot] =
    useState(false);
  const selectedExceptionProofUploadCount = selectedOrder
    ? (exceptionForms[selectedOrder.orderNo] ?? emptyExceptionForm).photoFileIds
        .length
    : 0;
  const selectedExceptionProofFileName = `异常凭证-${
    selectedExceptionProofUploadCount + 1
  }.png`;
  const selectedShipperEvaluationProofUploadCount = selectedOrder
    ? (
        shipperEvaluationForms[selectedOrder.orderNo] ??
        emptyShipperEvaluationForm
      ).photoFileIds.length
    : 0;
  const selectedShipperEvaluationProofFileName = `评价货主凭证-${
    selectedShipperEvaluationProofUploadCount + 1
  }.png`;
  const identityFrontUpload = useDriverPngUpload(
    platformFileApi,
    'identity',
    driverCertificationFileUploadConfigs.identityFrontFileId.fileName,
  );
  const identityBackUpload = useDriverPngUpload(
    platformFileApi,
    'identity',
    driverCertificationFileUploadConfigs.identityBackFileId.fileName,
  );
  const drivingLicenseUpload = useDriverPngUpload(
    platformFileApi,
    'identity',
    driverCertificationFileUploadConfigs.drivingLicenseFileId.fileName,
  );
  const driverLicenseUpload = useDriverPngUpload(
    platformFileApi,
    'identity',
    driverCertificationFileUploadConfigs.driverLicenseFileId.fileName,
  );
  const transportQualificationUpload = useDriverPngUpload(
    platformFileApi,
    'identity',
    driverCertificationFileUploadConfigs.transportQualificationFileId.fileName,
  );
  const operationPermitUpload = useDriverPngUpload(
    platformFileApi,
    'identity',
    driverCertificationFileUploadConfigs.operationPermitFileId.fileName,
  );
  const vehiclePhotoUpload = useDriverPngUpload(
    platformFileApi,
    'identity',
    driverCertificationFileUploadConfigs.vehiclePhotoFileId.fileName,
  );
  const loadingReceiptUpload = useDriverPngUpload(
    platformFileApi,
    'receipt',
    '装货凭证.png',
  );
  const arrivalReceiptUpload = useDriverPngUpload(
    platformFileApi,
    'receipt',
    '到达凭证.png',
  );
  const exceptionProofUpload = useDriverPngUpload(
    platformFileApi,
    'exception',
    selectedExceptionProofFileName,
  );
  const shipperEvaluationProofUpload = useDriverPngUpload(
    platformFileApi,
    'evaluation',
    selectedShipperEvaluationProofFileName,
  );
  const certificationUploaders = {
    identityFrontFileId: identityFrontUpload,
    identityBackFileId: identityBackUpload,
    drivingLicenseFileId: drivingLicenseUpload,
    driverLicenseFileId: driverLicenseUpload,
    transportQualificationFileId: transportQualificationUpload,
    operationPermitFileId: operationPermitUpload,
    vehiclePhotoFileId: vehiclePhotoUpload,
  };
  const hasDirtyCertificationDraft = isDriverCertificationFormDirty(
    certificationForm,
    certification,
  );
  const hasDirtyAcceptanceSettingsDraft = isDriverAcceptanceSettingsFormDirty(
    acceptanceSettingsForm,
    acceptanceSettings,
  );

  const applyCertificationSnapshot = (
    snapshot: PlatformDriverCertificationSnapshot,
  ) => {
    setCertification(snapshot);
    setCertificationForm(createDriverCertificationForm(snapshot));

    buildDriverCertificationAttachments(snapshot, platformFileApi)
      .then(hydratedAttachments => {
        setCertificationAttachments(current =>
          mergeDriverCertificationAttachments(
            current,
            snapshot,
            hydratedAttachments,
          ),
        );
      })
      .catch(() => undefined);
  };

  const refreshOrderHall = (
    settingsOverride:
      | PlatformDriverAcceptanceSettings
      | undefined = acceptanceSettings,
  ) => {
    if (!platformDriverOrderApi) {
      setOrderHallOrders([]);
      setNotice('司机订单大厅等待平台 API 配置。');
      return Promise.resolve(false);
    }

    return platformDriverOrderApi
      .listOrderHall({ page: 1, pageSize: 20 })
      .then(result => {
        setOrderHallOrders(result.items);
        setNotice(createDriverOrderHallNotice(result.items, settingsOverride));
        return true;
      })
      .catch(() => {
        setNotice('司机订单大厅刷新失败，请稍后重试。');
        return false;
      });
  };

  const refreshMyOrders = () => {
    if (!platformDriverOrderApi) {
      setMyOrders([]);
      return Promise.resolve(false);
    }

    return platformDriverOrderApi
      .listMyOrders({
        statuses: ['loading', 'transporting', 'confirming', 'completed'],
        page: 1,
        pageSize: 40,
      })
      .then(result => {
        setMyOrders(
          sortDriverMyOrders(Array.isArray(result?.items) ? result.items : []),
        );
        return true;
      })
      .catch(() => {
        setNotice('司机执行订单刷新失败，请稍后重试。');
        return false;
      });
  };

  const refreshCertification = () => {
    if (!platformDriverCertificationApi) {
      return Promise.resolve(false);
    }

    return platformDriverCertificationApi
      .getCertification()
      .then(snapshot => {
        applyCertificationSnapshot(snapshot);
        return true;
      })
      .catch(() => {
        setNotice('司机认证状态加载失败，请稍后重试。');
        return false;
      });
  };

  const refreshAcceptanceSettings = () => {
    if (!platformDriverOrderApi) {
      return Promise.resolve(false);
    }

    return platformDriverOrderApi
      .getAcceptanceSettings()
      .then(settings => {
        setAcceptanceSettings(settings);
        setAcceptanceSettingsForm(createAcceptanceSettingsForm(settings));
        return true;
      })
      .catch(() => {
        setNotice('接单设置加载失败，请稍后重试。');
        return false;
      });
  };

  const refreshLatestHallLocation = (
    options: { silentError?: boolean; silentNotFound?: boolean } = {},
  ) => {
    if (!platformMapsApi) {
      setLatestReportedHallLocation(undefined);
      return Promise.resolve(true);
    }

    return platformMapsApi
      .getDriverLocation()
      .then(snapshot => {
        setLatestReportedHallLocation(snapshot.orderId ? undefined : snapshot);
        return true;
      })
      .catch(error => {
        if (
          error instanceof PlatformApiError &&
          error.code === 'DRIVER_LOCATION_NOT_FOUND'
        ) {
          setLatestReportedHallLocation(undefined);
          return options.silentNotFound === false ? false : true;
        }

        if (!options.silentError) {
          setNotice('最新大厅位置加载失败，请稍后重试。');
        }
        return false;
      });
  };

  const refreshLatestReportedDriverLocation = (
    orderId: string | undefined,
    options: { silentError?: boolean } = {},
  ) => {
    if (!orderId || !platformMapsApi) {
      setLatestReportedDriverLocation(undefined);
      return Promise.resolve(true);
    }

    return platformMapsApi
      .getDriverLocation()
      .then(snapshot => {
        setLatestReportedDriverLocation(
          snapshot.orderId === orderId ? snapshot : undefined,
        );
        return true;
      })
      .catch(error => {
        if (
          error instanceof PlatformApiError &&
          error.code === 'DRIVER_LOCATION_NOT_FOUND'
        ) {
          setLatestReportedDriverLocation(undefined);
          return true;
        }

        if (!options.silentError) {
          setNotice('最新司机位置加载失败，请稍后重试。');
        }
        return false;
      });
  };

  const refreshIncome = () => {
    if (!platformDriverOrderApi) {
      setIncomeOverview(undefined);
      setWithdrawals([]);
      return Promise.resolve(false);
    }

    const incomePromise = platformDriverOrderApi
      .getIncomeOverview()
      .then(result => {
        setIncomeOverview({
          ...result,
          records: sortDriverIncomeRecords(
            Array.isArray(result.records) ? result.records : [],
          ),
        });
        return true;
      })
      .catch(() => {
        setNotice('司机收入加载失败，请稍后重试。');
        return false;
      });

    const withdrawalsPromise = platformDriverOrderApi
      .listWithdrawals({ page: 1, pageSize: 5 })
      .then(result => {
        setWithdrawals(
          sortDriverWithdrawals(
            Array.isArray(result.items) ? result.items : [],
          ),
        );
        return true;
      })
      .catch(() => {
        setNotice('提现记录加载失败，请稍后重试。');
        return false;
      });

    return Promise.all([incomePromise, withdrawalsPromise]).then(results =>
      results.every(Boolean),
    );
  };

  const refreshBankCards = (options: { silentError?: boolean } = {}) => {
    if (!platformDriverOrderApi) {
      setBankCards([]);
      return Promise.resolve(false);
    }

    return platformDriverOrderApi
      .listBankCards()
      .then(result => {
        const items = sortDriverBankCards(
          Array.isArray(result.items) ? result.items : [],
        );
        const defaultCard = items.find(item => item.isDefault);
        setBankCards(items);
        setWithdrawalForm(current => {
          const selectedCard = current.selectedBankCardId
            ? items.find(item => item.id === current.selectedBankCardId)
            : undefined;
          const hasWithdrawalBankCardSnapshot =
            Boolean(current.selectedBankCardId) ||
            current.bankAccountName.trim().length > 0 ||
            current.bankName.trim().length > 0 ||
            current.bankAccountNo.replace(/\s+/g, '').length > 0;
          if (selectedCard) {
            if (
              current.selectedBankCardSource === 'default' &&
              defaultCard &&
              defaultCard.id !== selectedCard.id
            ) {
              withdrawalIdempotencyKeyRef.current = undefined;
              return {
                ...current,
                bankAccountName: defaultCard.bankAccountName,
                bankName: defaultCard.bankName,
                bankAccountNo: '',
                selectedBankCardId: defaultCard.id,
                selectedBankCardSource: 'default',
              };
            }

            if (current.selectedBankCardSource === 'default' && !defaultCard) {
              withdrawalIdempotencyKeyRef.current = undefined;
              return {
                ...current,
                bankAccountName: '',
                bankName: '',
                bankAccountNo: '',
                selectedBankCardId: undefined,
                selectedBankCardSource: 'default',
              };
            }

            if (
              current.bankAccountName === selectedCard.bankAccountName &&
              current.bankName === selectedCard.bankName
            ) {
              return current;
            }

            withdrawalIdempotencyKeyRef.current = undefined;
            return {
              ...current,
              bankAccountName: selectedCard.bankAccountName,
              bankName: selectedCard.bankName,
            };
          }

          if (current.selectedBankCardSource === 'default' && defaultCard) {
            withdrawalIdempotencyKeyRef.current = undefined;
            return {
              ...current,
              bankAccountName: defaultCard.bankAccountName,
              bankName: defaultCard.bankName,
              bankAccountNo: '',
              selectedBankCardId: defaultCard.id,
              selectedBankCardSource: 'default',
            };
          }

          if (current.selectedBankCardSource === 'default') {
            if (!hasWithdrawalBankCardSnapshot) {
              return current;
            }

            withdrawalIdempotencyKeyRef.current = undefined;
            return {
              ...current,
              bankAccountName: '',
              bankName: '',
              bankAccountNo: '',
              selectedBankCardId: undefined,
              selectedBankCardSource: 'default',
            };
          }

          if (current.selectedBankCardSource === 'cleared') {
            return current;
          }

          const nextForm =
            current.selectedBankCardId || current.selectedBankCardSource
              ? {
                  ...current,
                  bankAccountName: '',
                  bankName: '',
                  bankAccountNo: '',
                  selectedBankCardId: undefined,
                  selectedBankCardSource: undefined,
                }
              : current;

          if (defaultCard && isDriverWithdrawalFormPristine(nextForm)) {
            withdrawalIdempotencyKeyRef.current = undefined;
            return {
              ...nextForm,
              bankAccountName: defaultCard.bankAccountName,
              bankName: defaultCard.bankName,
              bankAccountNo: '',
              selectedBankCardId: defaultCard.id,
              selectedBankCardSource: 'default',
            };
          }

          if (nextForm !== current) {
            withdrawalIdempotencyKeyRef.current = undefined;
          }

          return nextForm;
        });
        return true;
      })
      .catch(() => {
        if (!options.silentError) {
          setNotice('银行卡列表加载失败，请稍后重试。');
        }
        return false;
      });
  };

  const refreshSelectedOrderDetail = () => {
    if (!selectedOrder || !platformDriverOrderApi) {
      return Promise.resolve(true);
    }

    const fallbackNavigationTargets = [
      {
        type: 'pickup' as const,
        address: selectedOrder.pickupAddress,
        contactName: selectedOrder.pickupContact,
        contactPhone: selectedOrder.pickupPhone,
      },
      {
        type: 'delivery' as const,
        address: selectedOrder.deliveryAddress,
        contactName: selectedOrder.deliveryContact,
        contactPhone: selectedOrder.deliveryPhone,
      },
    ];

    const orderPromise = platformDriverOrderApi
      .getOrder(selectedOrder.id)
      .then(orderDetail => {
        setSelectedOrder(orderDetail);
        setMyOrders(currentOrders => upsertOrder(currentOrders, orderDetail));
        return true;
      })
      .catch(() => {
        setNotice('司机订单详情刷新失败，请稍后重试。');
        return false;
      });

    const exceptionCasesPromise = platformDriverOrderApi
      .listExceptionCases(selectedOrder.id)
      .then(result => {
        setExceptionCases(
          sortOrderExceptionCases(
            Array.isArray(result?.items) ? result.items : [],
          ),
        );
        setExceptionCaseNotice(undefined);
        return true;
      })
      .catch(error => {
        setExceptionCaseNotice(
          error instanceof PlatformApiError &&
            error.code === 'AUTH_ACCESS_TOKEN_MISSING'
            ? '登录状态已失效，请重新登录后查看异常处理进度。'
            : '异常处理进度加载失败，请稍后重试。',
        );
        return false;
      });

    const navigationTargetsPromise = platformMapsApi
      ? platformMapsApi
          .getDriverNavigationTargets(selectedOrder.id)
          .then(result => {
            setNavigationTargets(
              Array.isArray(result?.targets) ? result.targets : [],
            );
            return true;
          })
          .catch(() => {
            setNavigationTargets(fallbackNavigationTargets);
            return true;
          })
      : (() => {
          setNavigationTargets(fallbackNavigationTargets);
          return Promise.resolve(true);
        })();

    return Promise.all([
      orderPromise,
      exceptionCasesPromise,
      navigationTargetsPromise,
    ]).then(results => results.every(Boolean));
  };

  const refreshDriverHomeSnapshot = async () => {
    if (isRefreshingHomeSnapshot) {
      return;
    }

    setIsRefreshingHomeSnapshot(true);
    setNotice('');

    const skippedDrafts: string[] = [];
    if (hasDirtyAcceptanceSettingsDraft) {
      skippedDrafts.push('接单设置');
    }
    if (hasDirtyCertificationDraft) {
      skippedDrafts.push('司机认证');
    }

    try {
      const results = await Promise.all([
        refreshOrderHall(),
        refreshMyOrders(),
        hasDirtyAcceptanceSettingsDraft
          ? Promise.resolve(true)
          : refreshAcceptanceSettings(),
        refreshLatestHallLocation({ silentNotFound: true }),
        refreshSelectedOrderDetail(),
        selectedOrder
          ? refreshLatestReportedDriverLocation(selectedOrder.id)
          : Promise.resolve(true),
        refreshIncome(),
        refreshBankCards(),
        hasDirtyCertificationDraft
          ? Promise.resolve(true)
          : refreshCertification(),
      ]);

      if (results.every(Boolean)) {
        setNotice(
          skippedDrafts.length > 0
            ? `司机主页已手动刷新；已保留未保存的${skippedDrafts.join(
                '、',
              )}草稿。`
            : '司机主页已手动刷新到最新平台快照。',
        );
      }
    } finally {
      setIsRefreshingHomeSnapshot(false);
    }
  };

  useEffect(() => {
    refreshOrderHall();
    refreshMyOrders();
    refreshCertification();
    refreshAcceptanceSettings();
    refreshLatestHallLocation({ silentError: true, silentNotFound: true });
    refreshIncome();
    refreshBankCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    platformDriverOrderApi,
    platformDriverCertificationApi,
    platformFileApi,
    platformMapsApi,
  ]);

  useEffect(() => {
    let isMounted = true;

    hydrateDriverEvaluationReplyQueue()
      .then(queue => {
        if (isMounted) {
          setEvaluationReplyQueue(queue);
        }
      })
      .catch(() => undefined);
    setOrderMutationQueue({});
    hydrateDriverOrderMutationQueue(resolvedDriverAccountId)
      .then(queue => {
        if (isMounted) {
          setOrderMutationQueue(queue);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [resolvedDriverAccountId]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedOrder) {
      return () => {
        cancelled = true;
      };
    }

    buildDriverExecutionReceiptAttachments(selectedOrder, platformFileApi)
      .then(hydratedAttachments => {
        if (cancelled) {
          return;
        }

        setExecutionReceiptAttachments(current => ({
          ...current,
          [selectedOrder.id]: mergeDriverExecutionReceiptAttachments(
            hydratedAttachments,
            current[selectedOrder.id],
          ),
        }));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [selectedOrder, platformFileApi]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedOrder) {
      return () => {
        cancelled = true;
      };
    }

    buildDriverLatestExceptionAttachments(
      selectedOrder,
      exceptionCases,
      platformFileApi,
    )
      .then(hydratedAttachments => {
        if (cancelled) {
          return;
        }

        setReportedExceptionAttachments(current => ({
          ...current,
          [selectedOrder.orderNo]: mergeDriverUploadedFileRefs(
            hydratedAttachments,
            current[selectedOrder.orderNo],
          ),
        }));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [selectedOrder, exceptionCases, platformFileApi]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedOrder) {
      return () => {
        cancelled = true;
      };
    }

    buildDriverLatestShipperEvaluationAttachments(
      selectedOrder,
      platformFileApi,
    )
      .then(hydratedAttachments => {
        if (cancelled) {
          return;
        }

        setReportedShipperEvaluationAttachments(current => ({
          ...current,
          [selectedOrder.orderNo]: mergeDriverUploadedFileRefs(
            hydratedAttachments,
            current[selectedOrder.orderNo],
          ),
        }));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [selectedOrder, platformFileApi]);

  const getForm = (orderNo: string): DriverOrderFormState =>
    forms[orderNo] ?? emptyForm;

  const updateForm = (
    orderNo: string,
    changes: Partial<DriverOrderFormState>,
  ) => {
    setForms(currentForms => ({
      ...currentForms,
      [orderNo]: {
        ...(currentForms[orderNo] ?? emptyForm),
        ...changes,
      },
    }));
  };

  const updateEvaluationReplyForm = (orderNo: string, content: string) => {
    setEvaluationReplyForms(currentForms => ({
      ...currentForms,
      [orderNo]: content,
    }));
  };

  const updateShipperEvaluationForm = (
    orderNo: string,
    changes: Partial<DriverShipperEvaluationFormState>,
  ) => {
    setShipperEvaluationForms(currentForms => ({
      ...currentForms,
      [orderNo]: {
        ...(currentForms[orderNo] ?? emptyShipperEvaluationForm),
        ...changes,
      },
    }));
  };

  const updateExceptionForm = (
    orderNo: string,
    changes: Partial<DriverExceptionFormState>,
  ) => {
    setExceptionForms(currentForms => ({
      ...currentForms,
      [orderNo]: {
        ...(currentForms[orderNo] ?? emptyExceptionForm),
        ...changes,
      },
    }));
  };

  const toggleAcceptanceVehicleType = (vehicleType: string) => {
    setAcceptanceSettingsForm(current => ({
      ...current,
      vehicleTypePreferences: current.vehicleTypePreferences.includes(
        vehicleType,
      )
        ? current.vehicleTypePreferences.filter(item => item !== vehicleType)
        : [...current.vehicleTypePreferences, vehicleType],
    }));
  };

  const upsertOrderMutationQueueItem = (item: DriverOrderMutationQueueItem) => {
    setOrderMutationQueue(currentQueue => {
      const nextQueue = {
        ...currentQueue,
        [createDriverOrderMutationQueueKey(item.operation, item.orderId)]: item,
      };
      saveDriverOrderMutationQueue(resolvedDriverAccountId, nextQueue);
      return nextQueue;
    });
  };

  const removeOrderMutationQueueItem = (item: DriverOrderMutationQueueItem) => {
    setOrderMutationQueue(currentQueue => {
      const queueKey = createDriverOrderMutationQueueKey(
        item.operation,
        item.orderId,
      );

      if (!currentQueue[queueKey]) {
        return currentQueue;
      }

      const nextQueue = { ...currentQueue };
      delete nextQueue[queueKey];
      saveDriverOrderMutationQueue(resolvedDriverAccountId, nextQueue);
      return nextQueue;
    });
  };

  const submitQuote = (order: PlatformShipperOrder) => {
    if (!platformDriverOrderApi) {
      setNotice('司机报价需要平台 API 配置。');
      return;
    }

    if (acceptanceSettings?.isOnline === false) {
      setNotice('当前处于离线接单，请先打开接单开关。');
      return;
    }

    const quoteRequest = createQuoteRequest(getForm(order.orderNo));

    if (!quoteRequest) {
      setNotice('请填写有效报价和预计到达时间。');
      return;
    }

    platformDriverOrderApi
      .quoteOrder(order.id, quoteRequest)
      .then(updatedOrder => {
        setOrderHallOrders(currentOrders =>
          currentOrders.map(currentOrder =>
            currentOrder.id === order.id ? updatedOrder : currentOrder,
          ),
        );
        setNotice('司机报价已提交。');
      })
      .catch(error => {
        setNotice(
          getDriverOrderActionFailureNotice(
            error,
            '司机报价提交失败，请稍后重试。',
          ),
        );
      });
  };

  const refreshDriverOrderMutationTarget = (
    item: DriverOrderMutationQueueItem,
    noticeText: string,
  ) => {
    if (!platformDriverOrderApi) {
      setNotice(noticeText);
      return;
    }

    const refreshTask =
      item.operation === 'accept'
        ? platformDriverOrderApi
            .listOrderHall({ page: 1, pageSize: 20 })
            .then(result => {
              setOrderHallOrders(result.items);
            })
        : platformDriverOrderApi.getOrder(item.orderId).then(updatedOrder => {
            setSelectedOrder(updatedOrder);
            setMyOrders(currentOrders =>
              upsertOrder(currentOrders, updatedOrder),
            );
          });

    refreshTask
      .catch(() => undefined)
      .finally(() => {
        setNotice(noticeText);
      });
  };

  const handleDriverOrderMutationFailure = (
    error: unknown,
    item: DriverOrderMutationQueueItem,
  ) => {
    const failureAction = getOrderMutationFailureAction(error);

    if (failureAction === 'retry') {
      upsertOrderMutationQueueItem(item);
      setNotice(
        item.operation === 'accept'
          ? '司机接单失败，已加入本地重试队列。'
          : item.operation === 'cancel'
          ? '司机取消订单失败，已加入本地重试队列。'
          : '司机状态更新失败，已加入本地重试队列。',
      );
      return;
    }

    removeOrderMutationQueueItem(item);
    refreshDriverOrderMutationTarget(
      item,
      failureAction === 'refresh'
        ? '订单已被其他操作更新，请确认最新状态。'
        : '订单操作凭证已失效，请确认最新状态后重新发起。',
    );
  };

  const executeDriverOrderMutation = (item: DriverOrderMutationQueueItem) => {
    if (!platformDriverOrderApi) {
      setNotice('司机订单操作需要平台 API 配置。');
      return;
    }

    if (item.operation === 'accept') {
      platformDriverOrderApi
        .acceptOrder(
          item.orderId,
          item.request,
          item.mutationContext.idempotencyKey,
        )
        .then(updatedOrder => {
          removeOrderMutationQueueItem(item);
          setOrderHallOrders(currentOrders =>
            currentOrders.filter(
              currentOrder => currentOrder.id !== item.orderId,
            ),
          );
          setMyOrders(currentOrders =>
            upsertOrder(currentOrders, updatedOrder),
          );
          setSelectedOrder(updatedOrder);
          refreshIncome();
          setNotice('接单成功，订单已进入待装货。');
        })
        .catch(error => {
          handleDriverOrderMutationFailure(error, item);
        });
      return;
    }

    if (item.operation === 'cancel') {
      platformDriverOrderApi
        .cancelOrder(
          item.orderId,
          item.request,
          item.mutationContext.idempotencyKey,
        )
        .then(updatedOrder => {
          removeOrderMutationQueueItem(item);
          setSelectedOrder(updatedOrder);
          setMyOrders(currentOrders =>
            currentOrders.filter(
              currentOrder => currentOrder.id !== item.orderId,
            ),
          );
          refreshIncome();
          setNotice('订单已取消，货主将收到取消通知。');
        })
        .catch(error => {
          handleDriverOrderMutationFailure(error, item);
        });
      return;
    }

    platformDriverOrderApi
      .advanceOrderStatus(
        item.orderId,
        item.request,
        item.mutationContext.idempotencyKey,
      )
      .then(updatedOrder => {
        removeOrderMutationQueueItem(item);
        setSelectedOrder(updatedOrder);
        setMyOrders(currentOrders => upsertOrder(currentOrders, updatedOrder));
        refreshIncome();
        setNotice(createDriverAdvanceSuccessNotice(item.request.nextStatus));
      })
      .catch(error => {
        handleDriverOrderMutationFailure(error, item);
      });
  };

  const acceptOrder = (order: PlatformShipperOrder) => {
    if (!platformDriverOrderApi) {
      setNotice('司机接单需要平台 API 配置。');
      return;
    }

    if (acceptanceSettings?.isOnline === false) {
      setNotice('当前处于离线接单，请先打开接单开关。');
      return;
    }

    const queuedMutation =
      orderMutationQueue[createDriverOrderMutationQueueKey('accept', order.id)];

    if (queuedMutation?.operation === 'accept') {
      executeDriverOrderMutation(queuedMutation);
      return;
    }

    const form = forms[order.orderNo];
    const mutationContext = createOrderMutationContext(
      order.updatedAtIso ?? order.createdAtIso,
    );
    const request: PlatformDriverAcceptOrderRequest = form?.noteText.trim()
      ? {
          noteText: form.noteText.trim(),
          baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
        }
      : { baseUpdatedAtIso: mutationContext.baseUpdatedAtIso };

    executeDriverOrderMutation({
      operation: 'accept',
      driverAccountId: resolvedDriverAccountId,
      orderId: order.id,
      orderNo: order.orderNo,
      request,
      mutationContext,
    });
  };

  const openOrderDetail = (order: PlatformShipperOrder) => {
    if (!platformDriverOrderApi) {
      setNotice('司机订单详情需要平台 API 配置。');
      return;
    }

    setExceptionCases([]);
    setExceptionCaseNotice(undefined);
    setAppealDrafts({});
    setAppealingCaseId(undefined);
    setNavigationTargets([]);
    setSelectedOrder(order);
    setMyOrders(currentOrders => upsertOrder(currentOrders, order));
    setLatestReportedDriverLocation(undefined);
    setIsLoadingExceptionCases(true);
    refreshLatestReportedDriverLocation(order.id, { silentError: true }).catch(
      () => undefined,
    );
    platformDriverOrderApi
      .getOrder(order.id)
      .then(orderDetail => {
        setSelectedOrder(orderDetail);
        setMyOrders(currentOrders => upsertOrder(currentOrders, orderDetail));
      })
      .catch(() => {
        setNotice('司机订单详情加载失败，请稍后重试。');
      });
    platformDriverOrderApi
      .listExceptionCases(order.id)
      .then(result => {
        setExceptionCases(
          sortOrderExceptionCases(
            Array.isArray(result?.items) ? result.items : [],
          ),
        );
      })
      .catch(error => {
        setExceptionCaseNotice(
          error instanceof PlatformApiError &&
            error.code === 'AUTH_ACCESS_TOKEN_MISSING'
            ? '登录状态已失效，请重新登录后查看异常处理进度。'
            : '异常处理进度加载失败，请稍后重试。',
        );
      })
      .finally(() => {
        setIsLoadingExceptionCases(false);
      });
    if (platformMapsApi) {
      platformMapsApi
        .getDriverNavigationTargets(order.id)
        .then(result => {
          setNavigationTargets(
            Array.isArray(result?.targets) ? result.targets : [],
          );
        })
        .catch(() => {
          setNavigationTargets([
            {
              type: 'pickup',
              address: order.pickupAddress,
              contactName: order.pickupContact,
              contactPhone: order.pickupPhone,
            },
            {
              type: 'delivery',
              address: order.deliveryAddress,
              contactName: order.deliveryContact,
              contactPhone: order.deliveryPhone,
            },
          ]);
        });
    } else {
      setNavigationTargets([
        {
          type: 'pickup',
          address: order.pickupAddress,
          contactName: order.pickupContact,
          contactPhone: order.pickupPhone,
        },
        {
          type: 'delivery',
          address: order.deliveryAddress,
          contactName: order.deliveryContact,
          contactPhone: order.deliveryPhone,
        },
      ]);
    }
  };

  const openDriverNavigation = async (target: PlatformNavigationTarget) => {
    const urls = buildExternalNavigationUrls({
      label: target.type === 'pickup' ? '装货点' : '卸货点',
      address: target.address,
      latitude: target.latitude,
      longitude: target.longitude,
    });

    const preferredUrl =
      Platform.OS === 'ios' ? urls.amapIos : urls.amapAndroid;

    try {
      const canOpenAmap = await Linking.canOpenURL(preferredUrl);
      if (canOpenAmap) {
        await Linking.openURL(preferredUrl);
        return;
      }
    } catch {
      // Amap not available, fall through to geo
    }

    try {
      await Linking.openURL(urls.geo);
    } catch {
      setNotice('无法打开导航应用，请检查本机是否安装地图 App。');
    }
  };

  const reportDriverHallSandboxLocation = () => {
    if (!platformMapsApi) {
      setNotice('上报大厅位置需要平台 API 配置。');
      return;
    }

    platformMapsApi
      .reportDriverLocation({
        ...sandboxDriverLocation,
        source: 'sandbox',
      })
      .then(async snapshot => {
        setLatestReportedHallLocation(snapshot);
        const refreshed = await refreshOrderHall(acceptanceSettings);

        setNotice(
          refreshed
            ? '已上报 sandbox 大厅位置，接单范围已按最新位置刷新。'
            : '已上报 sandbox 大厅位置，但订单大厅刷新失败，请手动刷新。',
        );
      })
      .catch(error => {
        setNotice(
          error instanceof PlatformApiError
            ? error.message || '大厅位置上报失败。'
            : '大厅位置上报失败。',
        );
      });
  };

  const reportSandboxDriverLocation = () => {
    if (!platformMapsApi || !selectedOrder) {
      setNotice('上报位置需要平台 API 配置。');
      return;
    }

    const pickup = navigationTargets.find(item => item.type === 'pickup');
    const latitude = pickup?.latitude ?? sandboxDriverLocation.latitude;
    const longitude = pickup?.longitude ?? sandboxDriverLocation.longitude;
    platformMapsApi
      .reportDriverLocation({
        latitude,
        longitude,
        orderId: selectedOrder.id,
        source: 'sandbox',
        accuracyMeters: sandboxDriverLocation.accuracyMeters,
      })
      .then(snapshot => {
        setLatestReportedDriverLocation(snapshot);
        setNotice('已上报 sandbox 司机位置。');
      })
      .catch(error => {
        setNotice(
          error instanceof PlatformApiError
            ? error.message || '司机位置上报失败。'
            : '司机位置上报失败。',
        );
      });
  };

  const submitExceptionCaseAppeal = (
    exceptionCase: PlatformOrderExceptionCase,
  ) => {
    if (!platformDriverOrderApi || !selectedOrder) {
      setExceptionCaseNotice('异常工单申诉需要平台登录后才能提交。');
      return;
    }

    const reason = (appealDrafts[exceptionCase.id] ?? '').trim();
    if (reason.length < 6 || reason.length > 500) {
      setExceptionCaseNotice('请填写 6-500 字申诉理由。');
      return;
    }

    setAppealingCaseId(exceptionCase.id);
    setExceptionCaseNotice(undefined);
    platformDriverOrderApi
      .appealExceptionCase(selectedOrder.id, exceptionCase.id, {
        baseUpdatedAtIso: exceptionCase.updatedAtIso,
        reason,
      })
      .then(updatedCase => {
        setExceptionCases(currentCases =>
          sortOrderExceptionCases(
            currentCases.map(item =>
              item.id === updatedCase.id ? updatedCase : item,
            ),
          ),
        );
        setAppealDrafts(currentDrafts => {
          const nextDrafts = { ...currentDrafts };
          delete nextDrafts[exceptionCase.id];
          return nextDrafts;
        });
        setExceptionCaseNotice('申诉已提交，客服将重新处理该工单。');
      })
      .catch(error => {
        setExceptionCaseNotice(
          error instanceof PlatformApiError
            ? error.code === 'AUTH_ACCESS_TOKEN_MISSING'
              ? '登录状态已失效，请重新登录后再提交申诉。'
              : error.code === 'EXCEPTION_CASE_CONFLICT'
              ? '异常工单已被更新，请刷新后重试申诉。'
              : error.code === 'EXCEPTION_CASE_APPEAL_NOT_ALLOWED'
              ? '当前工单状态不允许申诉。'
              : error.message || '申诉提交失败，请稍后重试。'
            : '申诉提交失败，请稍后重试。',
        );
      })
      .finally(() => {
        setAppealingCaseId(undefined);
      });
  };

  const advanceSelectedOrderStatus = () => {
    if (!platformDriverOrderApi || !selectedOrder) {
      setNotice('司机状态更新需要先选择订单。');
      return;
    }

    const queuedMutation =
      orderMutationQueue[
        createDriverOrderMutationQueueKey('status', selectedOrder.id)
      ];

    if (queuedMutation?.operation === 'status') {
      executeDriverOrderMutation(queuedMutation);
      return;
    }

    const nextStatus = getNextDriverStatus(selectedOrder.status);

    if (!nextStatus) {
      setNotice('当前订单暂无司机可推进状态。');
      return;
    }

    const receiptPhotoFileIds = getDriverExecutionReceiptFileIds(
      executionProofs,
      selectedOrder.id,
      selectedOrder.status,
    );
    const mutationContext = createOrderMutationContext(
      selectedOrder.updatedAtIso ?? selectedOrder.createdAtIso,
    );

    const request: PlatformDriverAdvanceOrderStatusRequest = {
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      nextStatus,
      ...(receiptPhotoFileIds.length ? { receiptPhotoFileIds } : {}),
    };

    executeDriverOrderMutation({
      operation: 'status',
      driverAccountId: resolvedDriverAccountId,
      orderId: selectedOrder.id,
      orderNo: selectedOrder.orderNo,
      request,
      mutationContext,
    });
  };

  const submitEvaluationReply = (order: PlatformShipperOrder) => {
    if (!platformDriverOrderApi) {
      setNotice('评价回复需要平台 API 配置。');
      return;
    }

    const content = (evaluationReplyForms[order.orderNo] ?? '').trim();

    if (!content) {
      setNotice('请填写评价回复内容。');
      return;
    }

    const request: PlatformDriverReplyEvaluationRequest = { content };

    platformDriverOrderApi
      .replyToEvaluation(order.id, request)
      .then(updatedOrder => {
        setSelectedOrder(updatedOrder);
        setMyOrders(currentOrders => upsertOrder(currentOrders, updatedOrder));
        setEvaluationReplyForms(currentForms => ({
          ...currentForms,
          [order.orderNo]: '',
        }));
        setEvaluationReplyQueue(currentQueue => {
          const nextQueue = omitDriverEvaluationReplyQueueItem(
            currentQueue,
            order.id,
          );
          saveDriverEvaluationReplyQueue(nextQueue);
          return nextQueue;
        });
        setNotice('评价回复已提交。');
      })
      .catch(error => {
        const isMissingAccessToken =
          isDriverEvaluationReplyMissingAccessToken(error);

        if (
          error instanceof PlatformApiError &&
          error.code === 'ORDER_STATE_INVALID'
        ) {
          setNotice('订单尚未收到货主评价，暂不能回复。');
          return;
        }

        setEvaluationReplyQueue(currentQueue => {
          const nextQueue = {
            ...currentQueue,
            [order.id]: {
              orderId: order.id,
              orderNo: order.orderNo,
              content,
            },
          };
          saveDriverEvaluationReplyQueue(nextQueue);
          return nextQueue;
        });
        setNotice(
          isMissingAccessToken
            ? '评价回复需要重新登录后再同步。'
            : '评价回复提交失败，已加入本地重试队列。',
        );
      });
  };

  const retryEvaluationReply = (queueItem: DriverEvaluationReplyQueueItem) => {
    if (!platformDriverOrderApi) {
      setNotice('评价回复重试需要平台 API 配置。');
      return;
    }

    platformDriverOrderApi
      .replyToEvaluation(queueItem.orderId, { content: queueItem.content })
      .then(updatedOrder => {
        setSelectedOrder(updatedOrder);
        setMyOrders(currentOrders => upsertOrder(currentOrders, updatedOrder));
        setEvaluationReplyQueue(currentQueue => {
          const nextQueue = omitDriverEvaluationReplyQueueItem(
            currentQueue,
            queueItem.orderId,
          );
          saveDriverEvaluationReplyQueue(nextQueue);
          return nextQueue;
        });
        setNotice('评价回复已重新提交。');
      })
      .catch(error => {
        if (isDriverEvaluationReplyMissingAccessToken(error)) {
          setNotice('评价回复重试需要重新登录后再同步。');
          return;
        }

        if (
          error instanceof PlatformApiError &&
          error.code === 'ORDER_STATE_INVALID'
        ) {
          setNotice('订单尚未收到货主评价，暂不能回复。');
          return;
        }

        setNotice('评价回复重试失败，仍保留本地队列。');
      });
  };

  const submitShipperEvaluation = (order: PlatformShipperOrder) => {
    if (!platformDriverOrderApi) {
      setNotice('评价货主需要平台 API 配置。');
      return;
    }

    const request = createShipperEvaluationRequest(
      shipperEvaluationForms[order.orderNo] ?? emptyShipperEvaluationForm,
    );

    if (!request) {
      setNotice('请填写 1-5 星评分、评价标签和至少 6 个字的评价内容。');
      return;
    }

    platformDriverOrderApi
      .evaluateShipper(order.id, request)
      .then(updatedOrder => {
        const submittedAttachments =
          shipperEvaluationAttachments[order.orderNo] ?? [];
        setSelectedOrder(updatedOrder);
        setMyOrders(currentOrders => upsertOrder(currentOrders, updatedOrder));
        setShipperEvaluationForms(currentForms => ({
          ...currentForms,
          [order.orderNo]: emptyShipperEvaluationForm,
        }));
        if (submittedAttachments.length > 0) {
          setReportedShipperEvaluationAttachments(currentAttachments => ({
            ...currentAttachments,
            [order.orderNo]: submittedAttachments,
          }));
        }
        setShipperEvaluationAttachments(currentAttachments => {
          if (!currentAttachments[order.orderNo]) {
            return currentAttachments;
          }

          const nextAttachments = { ...currentAttachments };
          delete nextAttachments[order.orderNo];
          return nextAttachments;
        });
        setNotice('货主评价已提交。');
      })
      .catch(error => {
        if (error instanceof PlatformApiError) {
          const noticeByCode: Record<string, string> = {
            ORDER_STATE_INVALID: '订单完成后才能评价货主。',
            FILE_NOT_FOUND: '货主评价图片不存在，请重新上传。',
            FILE_STATE_INVALID: '货主评价图片尚未上传完成。',
            FILE_PURPOSE_INVALID: '货主评价图片用途不匹配，请重新上传。',
          };
          const mappedNotice = noticeByCode[error.code];

          if (mappedNotice) {
            setNotice(mappedNotice);
            return;
          }
        }

        setNotice('货主评价提交失败，请稍后重试。');
      });
  };

  const uploadShipperEvaluationProof = async (order: PlatformShipperOrder) => {
    if (!platformFileApi) {
      setNotice('货主评价图片上传需要平台文件 API 配置。');
      return;
    }

    const currentForm =
      shipperEvaluationForms[order.orderNo] ?? emptyShipperEvaluationForm;
    const fileName = `评价货主凭证-${currentForm.photoFileIds.length + 1}.png`;

    if (currentForm.photoFileIds.length >= 6) {
      setNotice('评价图片最多上传 6 张。');
      return;
    }

    const result = await shipperEvaluationProofUpload.pickAndUpload();

    if (result.status === 'uploaded') {
      updateShipperEvaluationForm(order.orderNo, {
        photoFileIds: [...currentForm.photoFileIds, result.file.id],
      });
      setShipperEvaluationAttachments(current => ({
        ...current,
        [order.orderNo]: [
          ...(current[order.orderNo] ?? []),
          {
            file: result.file,
            fileName,
          },
        ],
      }));
      setNotice('货主评价图片已关联平台文件。');
      return;
    }

    if (result.status === 'error') {
      setNotice(result.message);
    }
  };

  const submitException = (order: PlatformShipperOrder) => {
    if (!platformDriverOrderApi) {
      setNotice('异常上报需要平台 API 配置。');
      return;
    }

    const request = createDriverExceptionRequest(
      exceptionForms[order.orderNo] ?? emptyExceptionForm,
    );

    if (!request) {
      setNotice('请填写异常类型和至少 6 个字的异常说明。');
      return;
    }

    platformDriverOrderApi
      .reportException(order.id, request)
      .then(updatedOrder => {
        const submittedAttachments = exceptionAttachments[order.orderNo] ?? [];
        setSelectedOrder(updatedOrder);
        setMyOrders(currentOrders => upsertOrder(currentOrders, updatedOrder));
        setExceptionForms(currentForms => ({
          ...currentForms,
          [order.orderNo]: emptyExceptionForm,
        }));
        if (submittedAttachments.length > 0) {
          setReportedExceptionAttachments(currentAttachments => ({
            ...currentAttachments,
            [order.orderNo]: submittedAttachments,
          }));
        }
        setExceptionAttachments(currentAttachments => {
          if (!currentAttachments[order.orderNo]) {
            return currentAttachments;
          }

          const nextAttachments = { ...currentAttachments };
          delete nextAttachments[order.orderNo];
          return nextAttachments;
        });
        setNotice('异常已上报，等待客服跟进。');
      })
      .catch(error => {
        if (error instanceof PlatformApiError) {
          const noticeByCode: Record<string, string> = {
            AUTH_ACCESS_TOKEN_MISSING: '登录状态已失效，请重新登录后上报异常。',
            ORDER_STATE_INVALID: '当前订单状态不允许上报异常。',
            FILE_NOT_FOUND: '异常图片不存在，请重新上传。',
            FILE_STATE_INVALID: '异常图片尚未上传完成。',
            FILE_PURPOSE_INVALID: '异常图片用途不匹配，请重新上传。',
          };
          const mappedNotice = noticeByCode[error.code];

          if (mappedNotice) {
            setNotice(mappedNotice);
            return;
          }
        }

        setNotice('异常上报失败，请稍后重试。');
      });
  };

  const uploadExceptionProof = async (order: PlatformShipperOrder) => {
    if (!platformFileApi) {
      setNotice('异常凭证上传需要平台文件 API 配置。');
      return;
    }

    const currentForm = exceptionForms[order.orderNo] ?? emptyExceptionForm;
    const fileName = `异常凭证-${currentForm.photoFileIds.length + 1}.png`;

    if (currentForm.photoFileIds.length >= 6) {
      setNotice('异常图片最多上传 6 张。');
      return;
    }

    const result = await exceptionProofUpload.pickAndUpload();

    if (result.status === 'uploaded') {
      updateExceptionForm(order.orderNo, {
        photoFileIds: [...currentForm.photoFileIds, result.file.id],
      });
      setExceptionAttachments(current => ({
        ...current,
        [order.orderNo]: [
          ...(current[order.orderNo] ?? []),
          {
            file: result.file,
            fileName,
          },
        ],
      }));
      setNotice('异常凭证已关联平台文件。');
      return;
    }

    if (result.status === 'error') {
      setNotice(result.message);
    }
  };

  const uploadExecutionReceipt = async (order: PlatformShipperOrder) => {
    if (!platformFileApi) {
      setNotice('司机执行凭证上传需要平台文件 API 配置。');
      return;
    }

    const nextStatus = getNextDriverStatus(order.status);

    if (!nextStatus) {
      setNotice('当前订单暂无司机可推进状态。');
      return;
    }

    const isLoadingProof = order.status === 'loading';
    const fileName = isLoadingProof ? '装货凭证.png' : '到达凭证.png';
    const uploader = isLoadingProof
      ? loadingReceiptUpload
      : arrivalReceiptUpload;
    const result = await uploader.pickAndUpload();

    if (result.status === 'uploaded') {
      setExecutionProofs(current => ({
        ...current,
        [order.id]: isLoadingProof
          ? {
              transportingReceiptFileIds: [result.file.id],
              confirmingReceiptFileIds:
                current[order.id]?.confirmingReceiptFileIds ?? [],
            }
          : {
              transportingReceiptFileIds:
                current[order.id]?.transportingReceiptFileIds ?? [],
              confirmingReceiptFileIds: [result.file.id],
            },
      }));
      setExecutionReceiptAttachments(current => ({
        ...current,
        [order.id]: isLoadingProof
          ? {
              transportingReceiptFiles: [
                {
                  file: result.file,
                  fileName,
                },
              ],
              confirmingReceiptFiles:
                current[order.id]?.confirmingReceiptFiles ?? [],
            }
          : {
              transportingReceiptFiles:
                current[order.id]?.transportingReceiptFiles ?? [],
              confirmingReceiptFiles: [
                {
                  file: result.file,
                  fileName,
                },
              ],
            },
      }));
      setNotice(
        isLoadingProof
          ? '装货凭证已关联平台文件。'
          : '到达凭证已关联平台文件。',
      );
      return;
    }

    if (result.status === 'error') {
      setNotice(result.message);
    }
  };

  const submitIdentityCertification = () => {
    if (!platformDriverCertificationApi) {
      setNotice('司机实名认证需要平台 API 配置。');
      return;
    }

    platformDriverCertificationApi
      .submitIdentity({
        realName: certificationForm.realName,
        identityNumber: certificationForm.identityNumber,
        identityFrontFileId: certificationForm.identityFrontFileId,
        identityBackFileId: certificationForm.identityBackFileId,
      })
      .then(snapshot => {
        applyCertificationSnapshot(snapshot);
        setNotice('司机实名认证已提交审核。');
      })
      .catch(() => {
        setNotice('司机实名认证提交失败，请检查资料后重试。');
      });
  };

  const submitVehicleCertification = () => {
    if (!platformDriverCertificationApi) {
      setNotice('车辆认证需要平台 API 配置。');
      return;
    }

    platformDriverCertificationApi
      .submitVehicle({
        plateNumber: certificationForm.plateNumber,
        vehicleType: certificationForm.vehicleType,
        vehicleLengthText: certificationForm.vehicleLengthText,
        loadCapacityText: certificationForm.loadCapacityText,
        hasTailboard: certificationForm.hasTailboard,
        drivingLicenseFileId: certificationForm.drivingLicenseFileId,
        driverLicenseFileId: certificationForm.driverLicenseFileId,
        transportQualificationFileId:
          certificationForm.transportQualificationFileId,
        operationPermitFileId: certificationForm.operationPermitFileId,
        vehiclePhotoFileId: certificationForm.vehiclePhotoFileId,
      })
      .then(snapshot => {
        applyCertificationSnapshot(snapshot);
        setNotice('车辆认证已提交审核。');
      })
      .catch(() => {
        setNotice('车辆认证提交失败，请检查资料后重试。');
      });
  };

  const submitAcceptanceSettings = () => {
    if (!platformDriverOrderApi) {
      setNotice('接单设置需要平台 API 配置。');
      return;
    }

    const request = createAcceptanceSettingsRequest(acceptanceSettingsForm);

    if (!request) {
      setNotice('请填写有效接单范围，车型最多 10 个且不能重复。');
      return;
    }

    platformDriverOrderApi
      .saveAcceptanceSettings(request)
      .then(settings => {
        setAcceptanceSettings(settings);
        setAcceptanceSettingsForm(createAcceptanceSettingsForm(settings));
        setNotice(
          settings.isOnline
            ? '接单设置已保存，当前为在线接单。'
            : '接单设置已保存，当前为离线接单。',
        );
      })
      .catch(() => {
        setNotice('接单设置保存失败，请稍后重试。');
      });
  };

  const updateWithdrawalForm = (
    updater: (current: DriverWithdrawalFormState) => DriverWithdrawalFormState,
  ) => {
    withdrawalIdempotencyKeyRef.current = undefined;
    setWithdrawalForm(current => updater(current));
  };

  const clearSelectedWithdrawalBankCard = () => {
    updateWithdrawalForm(current => {
      if (!current.selectedBankCardId) {
        return current;
      }

      return {
        ...current,
        bankAccountName: '',
        bankName: '',
        bankAccountNo: '',
        selectedBankCardId: undefined,
        selectedBankCardSource: 'cleared',
      };
    });
  };

  const submitWithdrawal = () => {
    if (!platformDriverOrderApi) {
      setNotice('司机提现需要平台 API 配置。');
      return;
    }

    if (!incomeOverview) {
      setNotice('司机收入还在加载，请稍后再试。');
      return;
    }

    const amountYuan = Number(withdrawalForm.amountText.trim());
    const hasValidAmount = Number.isFinite(amountYuan) && amountYuan >= 1;
    const hasBankAccountName =
      withdrawalForm.bankAccountName.trim().length >= 2;
    const hasBankName = withdrawalForm.bankName.trim().length >= 2;
    const bankAccountNo = withdrawalForm.bankAccountNo.replace(/\D+/g, '');
    const hasBankAccountNo = bankAccountNo.length > 0;
    const request = createDriverWithdrawalRequest(withdrawalForm);

    if (!request) {
      setNotice(
        hasValidAmount &&
          hasBankAccountName &&
          hasBankName &&
          hasBankAccountNo &&
          !isDriverBankCardNumberValid(bankAccountNo)
          ? '请输入有效的银行卡号。'
          : '请填写有效提现金额、开户银行、收款人姓名和银行卡号。',
      );
      return;
    }

    if (
      request.amountCents >
      (incomeOverview.summary?.availableWithdrawalCents ?? 0)
    ) {
      setNotice('提现金额不能超过当前可提现余额。');
      return;
    }

    const idempotencyKey =
      withdrawalIdempotencyKeyRef.current ??
      createOrderMutationContext().idempotencyKey;
    withdrawalIdempotencyKeyRef.current = idempotencyKey;

    platformDriverOrderApi
      .createWithdrawal(request, idempotencyKey)
      .then(() => {
        const submittedBankCard = request.bankCardId
          ? bankCards.find(card => card.id === request.bankCardId)
          : undefined;
        const defaultCard = bankCards.find(card => card.isDefault);
        withdrawalIdempotencyKeyRef.current = undefined;
        setWithdrawalForm(
          submittedBankCard
            ? {
                ...emptyWithdrawalForm,
                bankAccountName: submittedBankCard.bankAccountName,
                bankName: submittedBankCard.bankName,
                bankAccountNo: '',
                selectedBankCardId: submittedBankCard.id,
                selectedBankCardSource:
                  withdrawalForm.selectedBankCardSource === 'manual'
                    ? 'manual'
                    : 'default',
              }
            : defaultCard
            ? {
                ...emptyWithdrawalForm,
                bankAccountName: defaultCard.bankAccountName,
                bankName: defaultCard.bankName,
                bankAccountNo: '',
                selectedBankCardId: defaultCard.id,
                selectedBankCardSource: 'default',
              }
            : emptyWithdrawalForm,
        );
        setNotice('提现申请已提交审核。');
        refreshIncome();
        refreshBankCards({ silentError: true });
      })
      .catch(error => {
        if (
          error instanceof PlatformApiError &&
          error.code === 'DRIVER_WITHDRAWAL_BALANCE_INSUFFICIENT'
        ) {
          setNotice('可提现余额不足，请调整提现金额。');
          return;
        }

        setNotice('提现申请提交失败，请稍后重试。');
      });
  };

  const openBankCardForm = (editId?: string) => {
    if (editId) {
      const card = bankCards.find(item => item.id === editId);
      if (card) {
        setBankCardForm(createDriverBankCardForm(card));
        setEditingBankCardId(editId);
      }
    } else {
      setBankCardForm({
        ...createDriverBankCardForm(),
        isDefault: bankCards.length === 0,
      });
      setEditingBankCardId(undefined);
    }
    setShowBankCardForm(true);
  };

  const closeBankCardForm = () => {
    setShowBankCardForm(false);
    setEditingBankCardId(undefined);
    setBankCardForm(createDriverBankCardForm());
  };

  const submitBankCard = () => {
    if (!platformDriverOrderApi) {
      setNotice('银行卡操作需要平台 API 配置。');
      return;
    }

    const hasBankAccountName = bankCardForm.bankAccountName.trim().length >= 2;
    const hasBankName = bankCardForm.bankName.trim().length >= 2;
    const hasBankAccountNo =
      bankCardForm.bankAccountNo.replace(/\D+/g, '').length > 0;

    const submitPromise = editingBankCardId
      ? (() => {
          if (!hasBankAccountName || !hasBankName) {
            setNotice('请填写完整的银行卡信息。');
            return undefined;
          }

          const request = createDriverBankCardUpdateRequest(bankCardForm);
          if (!request) {
            setNotice(
              hasBankAccountNo
                ? '请输入有效的银行卡号。'
                : '请填写完整的银行卡信息。',
            );
            return undefined;
          }

          return platformDriverOrderApi.updateBankCard(
            editingBankCardId,
            request,
          );
        })()
      : (() => {
          if (!hasBankAccountName || !hasBankName || !hasBankAccountNo) {
            setNotice('请填写完整的银行卡信息。');
            return undefined;
          }

          const request = createDriverBankCardRequest(bankCardForm);
          if (!request) {
            setNotice('请输入有效的银行卡号。');
            return undefined;
          }

          return platformDriverOrderApi.createBankCard(request);
        })();

    if (!submitPromise) {
      return;
    }

    submitPromise
      .then(() => {
        setNotice(editingBankCardId ? '银行卡已更新。' : '银行卡已添加。');
        closeBankCardForm();
        refreshBankCards();
      })
      .catch(() => {
        setNotice(
          editingBankCardId
            ? '银行卡更新失败，请稍后重试。'
            : '银行卡添加失败，请稍后重试。',
        );
      });
  };

  const deleteBankCardHandler = (cardId: string) => {
    if (!platformDriverOrderApi) {
      return;
    }

    const card = bankCards.find(item => item.id === cardId);
    if (!card) {
      return;
    }

    platformDriverOrderApi
      .deleteBankCard(cardId)
      .then(() => {
        setNotice(
          `银行卡 ${card.bankName}（${card.bankAccountMasked}）已删除。`,
        );
        refreshBankCards();
      })
      .catch(() => {
        setNotice('银行卡删除失败，请稍后重试。');
      });
  };

  const selectBankCard = (card: PlatformDriverBankCardRecord) => {
    updateWithdrawalForm(current => ({
      ...current,
      bankName: card.bankName,
      bankAccountName: card.bankAccountName,
      bankAccountNo: '',
      selectedBankCardId: card.id,
      selectedBankCardSource: 'manual',
    }));
    setNotice(`已选择银行卡：${card.bankName}（${card.bankAccountMasked}）`);
  };

  const setDefaultBankCard = (cardId: string) => {
    if (!platformDriverOrderApi) {
      setNotice('银行卡操作需要平台 API 配置。');
      return;
    }

    const card = bankCards.find(item => item.id === cardId);
    if (!card || card.isDefault) {
      return;
    }

    platformDriverOrderApi
      .updateBankCard(cardId, { isDefault: true })
      .then(() => {
        setNotice(
          `已将 ${card.bankName}（${card.bankAccountMasked}）设为默认银行卡。`,
        );
        refreshBankCards();
      })
      .catch(() => {
        setNotice('设为默认银行卡失败，请稍后重试。');
      });
  };

  const visibleOrders = sortDriverOrderHallOrders(
    filterDriverOrderHallOrders(orderHallOrders, acceptanceSettings),
  );
  const orderHallLocallyFilteredOrders =
    filterDriverOrderHallOrdersByLocalFilter(
      visibleOrders,
      activeOrderHallFilter,
    );
  const orderHallKeyword = orderHallSearchKeyword.trim().toLowerCase();
  const displayedOrderHallOrders = orderHallKeyword
    ? orderHallLocallyFilteredOrders.filter(
        order =>
          order.orderNo.toLowerCase().includes(orderHallKeyword) ||
          order.pickupAddress.toLowerCase().includes(orderHallKeyword) ||
          order.deliveryAddress.toLowerCase().includes(orderHallKeyword) ||
          order.cargoType.toLowerCase().includes(orderHallKeyword),
      )
    : orderHallLocallyFilteredOrders;
  const orderHallFilterSummaryText =
    activeOrderHallFilter !== 'all' && displayedOrderHallOrders.length > 0
      ? `当前筛选显示 ${displayedOrderHallOrders.length} 单`
      : undefined;
  const latestEvaluationReply = selectedOrder
    ? getLatestDriverEvaluationReply(selectedOrder)
    : undefined;
  const latestShipperEvaluation = selectedOrder
    ? getLatestDriverShipperEvaluation(selectedOrder)
    : undefined;
  const latestDriverException = selectedOrder
    ? getLatestDriverException(selectedOrder)
    : undefined;
  const selectedExceptionForm = selectedOrder
    ? exceptionForms[selectedOrder.orderNo] ?? emptyExceptionForm
    : emptyExceptionForm;
  const selectedShipperEvaluationForm = selectedOrder
    ? shipperEvaluationForms[selectedOrder.orderNo] ??
      emptyShipperEvaluationForm
    : emptyShipperEvaluationForm;
  const selectedShipperEvaluationAttachmentRefs = selectedOrder
    ? shipperEvaluationAttachments[selectedOrder.orderNo] ?? []
    : [];
  const selectedReportedShipperEvaluationAttachmentRefs = selectedOrder
    ? reportedShipperEvaluationAttachments[selectedOrder.orderNo] ?? []
    : [];
  const selectedEvaluationReplyQueueItem = selectedOrder
    ? evaluationReplyQueue[selectedOrder.id]
    : undefined;
  const incomeRecords = Array.isArray(incomeOverview?.records)
    ? incomeOverview.records
    : [];
  const incomeChartData = aggregateIncomeRecordsByDay(incomeRecords, 7);
  const sortedMyOrders = sortDriverMyOrders(
    Array.isArray(myOrders) ? myOrders : [],
  );
  const executingMyOrders = sortedMyOrders.filter(
    order => order.status !== 'completed',
  );
  const sortedExceptionCases = sortOrderExceptionCases(
    Array.isArray(exceptionCases) ? exceptionCases : [],
  );
  const completedMyOrders = sortedMyOrders.filter(
    order => order.status === 'completed',
  );
  const withdrawalRecords = sortDriverWithdrawals(
    Array.isArray(withdrawals) ? withdrawals : [],
  );
  const selectedWithdrawalBankCard = withdrawalForm.selectedBankCardId
    ? bankCards.find(card => card.id === withdrawalForm.selectedBankCardId)
    : undefined;

  const uploadCertificationFile = async (
    fieldName: DriverCertificationFileFieldName,
  ) => {
    if (!platformFileApi) {
      setNotice('认证附件上传需要平台文件 API 配置。');
      return;
    }

    const uploadConfig = driverCertificationFileUploadConfigs[fieldName];
    const result = await certificationUploaders[fieldName].pickAndUpload();

    if (result.status === 'uploaded') {
      setCertificationForm(current => ({
        ...current,
        [fieldName]: result.file.id,
      }));
      setCertificationAttachments(current => ({
        ...current,
        [fieldName]: {
          ...createDriverUploadedFileRef(result.file, uploadConfig.fileName),
        },
      }));
      setNotice(uploadConfig.successNotice);
      return;
    }

    if (result.status === 'error') {
      setNotice(result.message);
    }
  };
  const createCertificationAttachmentEntry = (
    fieldName: DriverCertificationFileFieldName,
  ) => {
    const fileId = certificationForm[fieldName].trim();
    const attachmentRef = certificationAttachments[fieldName];
    const snapshotFileId =
      getDriverCertificationSnapshotFileId(certification, fieldName)?.trim() ??
      '';
    const source: DriverCertificationAttachmentSource = !fileId
      ? 'empty'
      : attachmentRef?.file.id === fileId
      ? 'file-object'
      : snapshotFileId === fileId
      ? 'snapshot'
      : 'manual';

    return {
      fieldName,
      label: driverCertificationFileUploadConfigs[fieldName].label,
      fileId,
      source,
      attachmentRef: source === 'file-object' ? attachmentRef : undefined,
    };
  };
  const identityAttachmentEntries = [
    createCertificationAttachmentEntry('identityFrontFileId'),
    createCertificationAttachmentEntry('identityBackFileId'),
  ];
  const vehicleAttachmentEntries = [
    createCertificationAttachmentEntry('drivingLicenseFileId'),
    createCertificationAttachmentEntry('driverLicenseFileId'),
    createCertificationAttachmentEntry('transportQualificationFileId'),
    createCertificationAttachmentEntry('operationPermitFileId'),
    createCertificationAttachmentEntry('vehiclePhotoFileId'),
  ];
  const selectedExceptionAttachmentRefs = selectedOrder
    ? exceptionAttachments[selectedOrder.orderNo] ?? []
    : [];
  const selectedReportedExceptionAttachmentRefs = selectedOrder
    ? reportedExceptionAttachments[selectedOrder.orderNo] ?? []
    : [];
  const latestReportedHallLocationCoordinateText = latestReportedHallLocation
    ? formatCoordinateText(
        latestReportedHallLocation.latitude,
        latestReportedHallLocation.longitude,
      )
    : undefined;
  const latestReportedHallLocationEstimateText = latestReportedHallLocation
    ? formatTrackingEstimateText({
        distanceToTargetMeters:
          latestReportedHallLocation.distanceToTargetMeters,
        etaMinutes: latestReportedHallLocation.etaMinutes,
        targetType: latestReportedHallLocation.targetType,
        targetAddress: latestReportedHallLocation.targetAddress,
      })
    : undefined;
  const latestReportedHallLocationMetaText = latestReportedHallLocation
    ? getDriverLocationMetaText(latestReportedHallLocation)
    : undefined;
  const latestReportedDriverLocationCoordinateText =
    latestReportedDriverLocation
      ? formatCoordinateText(
          latestReportedDriverLocation.latitude,
          latestReportedDriverLocation.longitude,
        )
      : undefined;
  const latestReportedDriverLocationEstimateText = latestReportedDriverLocation
    ? formatTrackingEstimateText({
        distanceToTargetMeters:
          latestReportedDriverLocation.distanceToTargetMeters,
        etaMinutes: latestReportedDriverLocation.etaMinutes,
        targetType: latestReportedDriverLocation.targetType,
        targetAddress: latestReportedDriverLocation.targetAddress,
      })
    : undefined;
  const latestReportedDriverLocationMetaText = latestReportedDriverLocation
    ? getDriverLocationMetaText(latestReportedDriverLocation)
    : undefined;
  const createUploadedAttachmentMetaLines = (
    attachmentRef: DriverUploadedFileRef,
  ) => [
    `来源：平台文件对象（${getDriverCertificationFileStatusText(
      attachmentRef.file.status,
    )}）`,
    `文件 ID：${attachmentRef.file.id}`,
    ...(attachmentRef.file.publicUrl
      ? ['已生成预览地址。']
      : attachmentRef.file.objectKey
      ? ['已写入平台对象存储。']
      : []),
  ];
  const createCertificationAttachmentMetaLines = (
    entry: ReturnType<typeof createCertificationAttachmentEntry>,
  ) => {
    if (!entry.fileId) {
      return ['尚未关联平台认证附件，当前仍为待上传占位。'];
    }

    return [
      entry.source === 'file-object'
        ? `来源：平台文件对象（${getDriverCertificationFileStatusText(
            entry.attachmentRef?.file.status ?? 'pending',
          )}）`
        : entry.source === 'snapshot'
        ? '来源：平台认证快照'
        : '来源：手动填写文件 ID',
      `文件 ID：${entry.fileId}`,
      ...(entry.attachmentRef?.file.publicUrl
        ? ['已生成预览地址。']
        : entry.attachmentRef?.file.objectKey
        ? ['已写入平台对象存储。']
        : []),
    ];
  };
  const createCertificationAttachmentTitle = (
    entry: ReturnType<typeof createCertificationAttachmentEntry>,
  ) =>
    entry.fileId
      ? `${entry.label}：${
          entry.source === 'file-object'
            ? entry.attachmentRef?.fileName ?? '已关联平台文件对象'
            : entry.source === 'snapshot'
            ? '平台已同步文件 ID'
            : '本地已填写文件 ID'
        }`
      : `${entry.label}：待上传占位`;

  const selectedExecutionReceipts = selectedOrder
    ? (() => {
        const state =
          executionReceiptAttachments[selectedOrder.id] ??
          ({
            transportingReceiptFiles: [],
            confirmingReceiptFiles: [],
          } as const);
        return {
          loading: state.transportingReceiptFiles.map(ref => ref.file),
          confirming: state.confirmingReceiptFiles.map(ref => ref.file),
        };
      })()
    : { loading: [], confirming: [] };
  const selectedExecutionReceiptSections = selectedOrder
    ? [
        {
          key: 'loading',
          label: '装货凭证',
          refs:
            executionReceiptAttachments[selectedOrder.id]
              ?.transportingReceiptFiles ?? [],
        },
        {
          key: 'confirming',
          label: '到达凭证',
          refs:
            executionReceiptAttachments[selectedOrder.id]
              ?.confirmingReceiptFiles ?? [],
        },
      ].filter(section => section.refs.length > 0)
    : [];
  const selectedExecutionReceiptCount = selectedExecutionReceiptSections.reduce(
    (count, section) => count + section.refs.length,
    0,
  );

  const isSelectedOrderAdvancing =
    selectedOrder != null &&
    orderMutationQueue[
      createDriverOrderMutationQueueKey('status', selectedOrder.id)
    ]?.operation === 'status';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.detailContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.detailTopBar}>
        <View style={styles.detailTitleGroup}>
          <Text testID="driver-home-title" style={styles.detailTitle}>
            司机接单大厅
          </Text>
          <Text style={styles.detailMeta}>只展示待接单货主订单</Text>
        </View>
        <Pressable
          testID="driver-logout"
          style={styles.detailSecondaryButton}
          onPress={onLogout}
        >
          <Text style={styles.detailSecondaryButtonText}>退出</Text>
        </Pressable>
      </View>

      <View style={styles.detailCard} testID="driver-profile-overview">
        <Text style={styles.detailRoute}>司机概览</Text>
        <View style={styles.detailInlineGroup}>
          <Text style={styles.detailRoute}>
            {certification?.identity?.realName
              ? `司机：${certification.identity.realName}`
              : '司机：未实名认证'}
          </Text>
          {certification?.vehicle?.plateNumber ? (
            <Text style={styles.detailMeta}>
              车牌：{certification.vehicle.plateNumber}
            </Text>
          ) : null}
          {certification?.vehicle?.vehicleType ? (
            <Text style={styles.detailMeta}>
              车型：{certification.vehicle.vehicleType}
            </Text>
          ) : null}
          <Text style={styles.detailMeta}>
            实名认证：
            {certification?.identity?.status === 'approved'
              ? '已通过'
              : certification?.identity?.status === 'reviewing'
              ? '审核中'
              : certification?.identity?.status === 'rejected'
              ? '已驳回'
              : '未提交'}
          </Text>
          <Text style={styles.detailMeta}>
            车辆认证：
            {certification?.vehicle?.status === 'approved'
              ? '已通过'
              : certification?.vehicle?.status === 'reviewing'
              ? '审核中'
              : certification?.vehicle?.status === 'rejected'
              ? '已驳回'
              : '未提交'}
          </Text>
        </View>
        <View style={styles.detailInlineGroup}>
          <Text style={styles.detailMeta}>
            已完成订单：{incomeOverview?.summary?.completedOrderCount ?? 0} 单
          </Text>
          <Text style={styles.detailMeta}>
            可提现余额：
            {incomeOverview?.summary?.availableWithdrawalCents
              ? `${(
                  incomeOverview.summary.availableWithdrawalCents / 100
                ).toFixed(2)} 元`
              : '0.00 元'}
          </Text>
          <Text style={styles.detailMeta}>
            审核中提现：
            {incomeOverview?.summary?.reviewingWithdrawalCents
              ? `${(
                  incomeOverview.summary.reviewingWithdrawalCents / 100
                ).toFixed(2)} 元`
              : '0.00 元'}
          </Text>
        </View>
      </View>

      <Pressable
        testID="driver-refresh-home"
        style={styles.detailPrimaryButton}
        disabled={isRefreshingHomeSnapshot}
        onPress={() => {
          refreshDriverHomeSnapshot().catch(() => undefined);
        }}
      >
        <Text style={styles.detailPrimaryButtonText}>
          {isRefreshingHomeSnapshot ? '刷新中...' : '刷新司机主页'}
        </Text>
      </Pressable>

      {notice ? (
        <View style={styles.detailNoticeCard}>
          <Text testID="driver-notice" style={styles.detailNoticeText}>
            {notice}
          </Text>
        </View>
      ) : null}

      {Object.values(orderMutationQueue).length ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailRoute}>司机订单同步队列</Text>
          {Object.values(orderMutationQueue).map(item => (
            <View
              key={createDriverOrderMutationQueueKey(
                item.operation,
                item.orderId,
              )}
              style={styles.detailNoticeCard}
            >
              <Text style={styles.detailMeta}>
                {`${item.orderNo} · ${
                  item.operation === 'accept' ? '接单' : '状态推进'
                }待重试`}
              </Text>
              <Text style={styles.detailMeta}>
                {`原始版本：${formatPlatformIsoMinute(
                  item.mutationContext.baseUpdatedAtIso,
                )}`}
              </Text>
              <Pressable
                testID={`driver-order-mutation-retry-${item.operation}-${item.orderId}`}
                style={styles.detailPrimaryButton}
                onPress={() => executeDriverOrderMutation(item)}
              >
                <Text style={styles.detailPrimaryButtonText}>重试订单操作</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.detailCard}>
        <Text testID="driver-settings-title" style={styles.detailRoute}>
          接单设置
        </Text>
        <Text testID="driver-settings-status" style={styles.detailMeta}>
          {`接单状态：${acceptanceSettingsForm.isOnline ? '在线' : '离线'}`}
        </Text>
        <Text style={styles.detailMeta}>
          {`接单范围：${acceptanceSettingsForm.maxDistanceKmText || '50'} 公里`}
        </Text>
        <Text
          testID="driver-settings-vehicle-types-summary"
          style={styles.detailMeta}
        >
          {`车型匹配：${getDriverAcceptanceVehicleTypesText(
            acceptanceSettingsForm.vehicleTypePreferences,
          )}`}
        </Text>
        <TextInput
          testID="driver-settings-max-distance-km"
          style={styles.ordersSearchInput}
          placeholder="接单范围（公里）"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          value={acceptanceSettingsForm.maxDistanceKmText}
          onChangeText={maxDistanceKmText =>
            setAcceptanceSettingsForm(current => ({
              ...current,
              maxDistanceKmText,
            }))
          }
        />
        <Text style={styles.detailMeta}>
          当前接单范围已接入最近上报位置和订单装货点坐标；未上报位置时先按车型过滤。
        </Text>
        {platformMapsApi ? (
          <Pressable
            testID="driver-report-hall-location"
            style={styles.detailSecondaryButton}
            onPress={reportDriverHallSandboxLocation}
          >
            <Text style={styles.detailSecondaryButtonText}>
              上报 sandbox 大厅位置
            </Text>
          </Pressable>
        ) : null}
        {latestReportedHallLocation ? (
          <View style={styles.detailInfoCard}>
            <Text style={styles.detailInfoLabel}>最新大厅位置</Text>
            {latestReportedHallLocationCoordinateText ? (
              <Text
                testID="driver-hall-location-coordinate"
                style={styles.detailInfoValue}
              >
                {latestReportedHallLocationCoordinateText}
              </Text>
            ) : null}
            <Text testID="driver-hall-location-meta" style={styles.detailMeta}>
              {latestReportedHallLocationMetaText}
            </Text>
            {latestReportedHallLocationEstimateText ? (
              <Text
                testID="driver-hall-location-estimate"
                style={styles.detailMeta}
              >
                {latestReportedHallLocationEstimateText}
              </Text>
            ) : null}
            {latestReportedHallLocation.targetAddress ? (
              <Text
                testID="driver-hall-location-target"
                style={styles.detailMeta}
              >
                {`当前目标：${latestReportedHallLocation.targetAddress}`}
              </Text>
            ) : null}
          </View>
        ) : null}
        {vehicleRequirementOptions.map(option => {
          const selected =
            acceptanceSettingsForm.vehicleTypePreferences.includes(option.id);

          return (
            <Pressable
              key={option.id}
              testID={`driver-settings-vehicle-type-${option.id}`}
              style={styles.detailSecondaryButton}
              onPress={() => toggleAcceptanceVehicleType(option.id)}
            >
              <Text style={styles.detailSecondaryButtonText}>
                {selected
                  ? `已选车型：${option.label}`
                  : `车型：${option.label}`}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          testID="driver-settings-toggle-online"
          style={styles.detailSecondaryButton}
          onPress={() =>
            setAcceptanceSettingsForm(current => ({
              ...current,
              isOnline: !current.isOnline,
            }))
          }
        >
          <Text style={styles.detailSecondaryButtonText}>
            {`接单开关：${acceptanceSettingsForm.isOnline ? '在线' : '离线'}`}
          </Text>
        </Pressable>
        <Pressable
          testID="driver-settings-submit"
          style={styles.detailPrimaryButton}
          onPress={submitAcceptanceSettings}
        >
          <Text style={styles.detailPrimaryButtonText}>保存接单设置</Text>
        </Pressable>
      </View>

      <View style={styles.detailCard}>
        <Text testID="driver-income-title" style={styles.detailRoute}>
          司机收入
        </Text>
        <Text testID="driver-income-today" style={styles.detailMeta}>
          {`今日收入：${formatDriverCurrency(
            incomeOverview?.summary?.todayIncomeCents ?? 0,
          )}`}
        </Text>
        <Text style={styles.detailMeta}>
          {`本周收入：${formatDriverCurrency(
            incomeOverview?.summary?.weekIncomeCents ?? 0,
          )} · 本月收入：${formatDriverCurrency(
            incomeOverview?.summary?.monthIncomeCents ?? 0,
          )}`}
        </Text>
        <Text testID="driver-income-available" style={styles.detailMeta}>
          {`可提现：${formatDriverCurrency(
            incomeOverview?.summary?.availableWithdrawalCents ?? 0,
          )} · 提现审核中：${formatDriverCurrency(
            incomeOverview?.summary?.reviewingWithdrawalCents ?? 0,
          )}`}
        </Text>
        <Text style={styles.detailMeta}>
          {`待结算：${formatDriverCurrency(
            incomeOverview?.summary?.pendingSettlementCents ?? 0,
          )} · 已提现：${formatDriverCurrency(
            incomeOverview?.summary?.withdrawnCents ?? 0,
          )}`}
        </Text>
        <Text testID="driver-income-history" style={styles.detailMeta}>
          {getDriverIncomeSummaryText(incomeOverview?.summary)}
        </Text>
        {incomeRecords.length ? (
          incomeRecords.slice(0, 3).map(record => (
            <View
              key={record.orderId}
              testID={`driver-income-record-card-${record.orderNo}`}
              style={styles.detailInlineGroup}
            >
              <Text style={styles.detailRoute}>{record.routeText}</Text>
              <Text style={styles.detailMeta}>
                {`${record.orderNo} · ${formatDriverIncomeTime(
                  record.completedAtIso,
                )}`}
              </Text>
              <Text
                testID={`driver-income-record-summary-${record.orderNo}`}
                style={styles.detailMeta}
              >
                {getDriverIncomeRecordSummaryText(record)}
              </Text>
              <Text
                testID={`driver-income-record-breakdown-${record.orderNo}`}
                style={styles.detailMeta}
              >
                {getDriverIncomeRecordBreakdownText(record)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.detailMeta}>暂无已完成收入记录。</Text>
        )}
        <IncomeChart
          data={incomeChartData}
          daysToShow={7}
          testID="driver-income-chart"
        />
        <TextInput
          testID="driver-withdrawal-amount"
          style={styles.ordersSearchInput}
          placeholder="提现金额，例如 120"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          value={withdrawalForm.amountText}
          onChangeText={amountText =>
            updateWithdrawalForm(current => ({ ...current, amountText }))
          }
        />
        <TextInput
          testID="driver-withdrawal-bank-name"
          style={styles.ordersSearchInput}
          placeholder="开户银行"
          placeholderTextColor={colors.textMuted}
          value={withdrawalForm.bankName}
          onChangeText={bankName =>
            updateWithdrawalForm(current => ({
              ...current,
              bankName,
              selectedBankCardId: undefined,
              selectedBankCardSource: undefined,
            }))
          }
        />
        <TextInput
          testID="driver-withdrawal-bank-account-name"
          style={styles.ordersSearchInput}
          placeholder="收款人姓名"
          placeholderTextColor={colors.textMuted}
          value={withdrawalForm.bankAccountName}
          onChangeText={bankAccountName =>
            updateWithdrawalForm(current => ({
              ...current,
              bankAccountName,
              selectedBankCardId: undefined,
              selectedBankCardSource: undefined,
            }))
          }
        />
        <TextInput
          testID="driver-withdrawal-bank-account-no"
          style={styles.ordersSearchInput}
          placeholder="银行卡号"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          value={withdrawalForm.bankAccountNo}
          onChangeText={bankAccountNo =>
            updateWithdrawalForm(current => ({
              ...current,
              bankAccountNo: formatDriverBankCardNumberInput(bankAccountNo),
            }))
          }
        />
        {selectedWithdrawalBankCard ? (
          <View style={styles.detailInlineGroup}>
            <Text
              testID="driver-withdrawal-selected-bank-card"
              style={styles.detailMeta}
            >
              {`当前提现银行卡：${selectedWithdrawalBankCard.bankName} · ${selectedWithdrawalBankCard.bankAccountMasked}`}
            </Text>
            <Pressable
              testID="driver-withdrawal-clear-bank-card"
              style={styles.detailSecondaryButton}
              onPress={clearSelectedWithdrawalBankCard}
            >
              <Text style={styles.detailSecondaryButtonText}>取消选卡</Text>
            </Pressable>
          </View>
        ) : null}
        <Pressable
          testID="driver-withdrawal-submit"
          style={styles.detailPrimaryButton}
          onPress={submitWithdrawal}
        >
          <Text style={styles.detailPrimaryButtonText}>提交提现申请</Text>
        </Pressable>
        <Text style={styles.detailMeta}>最近提现记录</Text>
        {withdrawalRecords.length ? (
          withdrawalRecords.map(withdrawal => {
            const withdrawalDetailText =
              getDriverWithdrawalStatusDetailText(withdrawal);

            return (
              <View
                key={withdrawal.id}
                testID={`driver-withdrawal-record-card-${withdrawal.id}`}
                style={styles.detailInlineGroup}
              >
                <Text style={styles.detailRoute}>
                  {`${withdrawal.bankName} · ${withdrawal.bankAccountMasked}`}
                </Text>
                <Text style={styles.detailMeta}>
                  {`${formatDriverCurrency(
                    withdrawal.amountCents,
                  )} · ${getDriverWithdrawalStatusText(withdrawal.status)}`}
                </Text>
                <Text
                  testID={`driver-withdrawal-record-created-at-${withdrawal.id}`}
                  style={styles.detailMeta}
                >
                  {`申请时间：${formatDriverIncomeTime(
                    withdrawal.createdAtIso,
                  )}`}
                </Text>
                {withdrawalDetailText ? (
                  <Text
                    testID={`driver-withdrawal-record-detail-${withdrawal.id}`}
                    style={styles.detailMeta}
                  >
                    {withdrawalDetailText}
                  </Text>
                ) : null}
              </View>
            );
          })
        ) : (
          <Text style={styles.detailMeta}>暂无提现记录。</Text>
        )}
      </View>

      <View style={styles.detailCard}>
        <Text testID="driver-bank-cards-title" style={styles.detailRoute}>
          我的银行卡
        </Text>
        {bankCards.length ? (
          bankCards.map(card => (
            <View
              key={card.id}
              style={
                editingBankCardId === card.id
                  ? styles.detailNoticeCard
                  : styles.detailInlineGroup
              }
            >
              {editingBankCardId === card.id ? (
                <>
                  <TextInput
                    testID={`driver-bank-card-edit-name-${card.id}`}
                    style={styles.ordersSearchInput}
                    placeholder="开户银行"
                    placeholderTextColor={colors.textMuted}
                    value={bankCardForm.bankName}
                    onChangeText={bankName =>
                      setBankCardForm(current => ({
                        ...current,
                        bankName: bankName,
                      }))
                    }
                  />
                  <TextInput
                    testID={`driver-bank-card-edit-account-name-${card.id}`}
                    style={styles.ordersSearchInput}
                    placeholder="收款人姓名"
                    placeholderTextColor={colors.textMuted}
                    value={bankCardForm.bankAccountName}
                    onChangeText={bankAccountName =>
                      setBankCardForm(current => ({
                        ...current,
                        bankAccountName: bankAccountName,
                      }))
                    }
                  />
                  <TextInput
                    testID={`driver-bank-card-edit-account-no-${card.id}`}
                    style={styles.ordersSearchInput}
                    placeholder="银行卡号（留空不修改）"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={bankCardForm.bankAccountNo}
                    onChangeText={bankAccountNo =>
                      setBankCardForm(current => ({
                        ...current,
                        bankAccountNo:
                          formatDriverBankCardNumberInput(bankAccountNo),
                      }))
                    }
                  />
                  <Pressable
                    testID={`driver-bank-card-edit-toggle-default-${card.id}`}
                    style={styles.detailSecondaryButton}
                    onPress={() =>
                      setBankCardForm(current => ({
                        ...current,
                        isDefault: !current.isDefault,
                      }))
                    }
                  >
                    <Text style={styles.detailSecondaryButtonText}>
                      {`默认银行卡：${bankCardForm.isDefault ? '是' : '否'}`}
                    </Text>
                  </Pressable>
                  <Pressable
                    testID={`driver-bank-card-edit-submit-${card.id}`}
                    style={styles.detailSecondaryButton}
                    onPress={submitBankCard}
                  >
                    <Text style={styles.detailSecondaryButtonText}>
                      保存修改
                    </Text>
                  </Pressable>
                  <Pressable
                    testID={`driver-bank-card-edit-cancel-${card.id}`}
                    style={styles.detailSecondaryButton}
                    onPress={closeBankCardForm}
                  >
                    <Text style={styles.detailSecondaryButtonText}>取消</Text>
                  </Pressable>
                </>
              ) : (
                (() => {
                  const isSelectedForWithdrawal =
                    selectedWithdrawalBankCard?.id === card.id;
                  const bankCardLastUsedText =
                    getDriverBankCardLastUsedText(card);

                  return (
                    <>
                      <View style={styles.detailTitleRow}>
                        <Text style={styles.detailRoute}>
                          {`${card.bankName} · ${card.bankAccountMasked}`}
                        </Text>
                        {card.isDefault ? (
                          <View style={styles.detailStatusPill}>
                            <Text style={styles.detailStatusPillText}>
                              默认
                            </Text>
                          </View>
                        ) : null}
                        {isSelectedForWithdrawal ? (
                          <View
                            testID={`driver-bank-card-selected-${card.id}`}
                            style={styles.detailStatusPillActive}
                          >
                            <Text style={styles.detailStatusPillTextActive}>
                              当前提现卡
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {bankCardLastUsedText ? (
                        <Text
                          testID={`driver-bank-card-last-used-${card.id}`}
                          style={styles.detailMeta}
                        >
                          {bankCardLastUsedText}
                        </Text>
                      ) : null}
                      <View style={styles.detailActionRow}>
                        {!card.isDefault ? (
                          <Pressable
                            testID={`driver-bank-card-set-default-${card.id}`}
                            style={styles.detailSecondaryButton}
                            onPress={() => setDefaultBankCard(card.id)}
                          >
                            <Text style={styles.detailSecondaryButtonText}>
                              设为默认
                            </Text>
                          </Pressable>
                        ) : null}
                        <Pressable
                          testID={`driver-bank-card-select-${card.id}`}
                          style={
                            isSelectedForWithdrawal
                              ? styles.detailSelectedButton
                              : styles.detailSecondaryButton
                          }
                          disabled={isSelectedForWithdrawal}
                          onPress={() => selectBankCard(card)}
                        >
                          <Text
                            style={
                              isSelectedForWithdrawal
                                ? styles.detailSelectedButtonText
                                : styles.detailSecondaryButtonText
                            }
                          >
                            {isSelectedForWithdrawal
                              ? '已选用于提现'
                              : '用于提现'}
                          </Text>
                        </Pressable>
                        <Pressable
                          testID={`driver-bank-card-edit-${card.id}`}
                          style={styles.detailSecondaryButton}
                          onPress={() => openBankCardForm(card.id)}
                        >
                          <Text style={styles.detailSecondaryButtonText}>
                            编辑
                          </Text>
                        </Pressable>
                        <Pressable
                          testID={`driver-bank-card-delete-${card.id}`}
                          style={styles.detailDangerButton}
                          onPress={() => deleteBankCardHandler(card.id)}
                        >
                          <Text style={styles.detailDangerButtonText}>
                            删除
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  );
                })()
              )}
            </View>
          ))
        ) : (
          <Text style={styles.detailMeta}>暂无绑定银行卡。</Text>
        )}
        {showBankCardForm && editingBankCardId === undefined ? (
          <View style={styles.detailNoticeCard}>
            <TextInput
              testID="driver-bank-card-bank-name"
              style={styles.ordersSearchInput}
              placeholder="开户银行"
              placeholderTextColor={colors.textMuted}
              value={bankCardForm.bankName}
              onChangeText={bankName =>
                setBankCardForm(current => ({
                  ...current,
                  bankName: bankName,
                }))
              }
            />
            <TextInput
              testID="driver-bank-card-account-name"
              style={styles.ordersSearchInput}
              placeholder="收款人姓名"
              placeholderTextColor={colors.textMuted}
              value={bankCardForm.bankAccountName}
              onChangeText={bankAccountName =>
                setBankCardForm(current => ({
                  ...current,
                  bankAccountName: bankAccountName,
                }))
              }
            />
            <TextInput
              testID="driver-bank-card-account-no"
              style={styles.ordersSearchInput}
              placeholder="银行卡号"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={bankCardForm.bankAccountNo}
              onChangeText={bankAccountNo =>
                setBankCardForm(current => ({
                  ...current,
                  bankAccountNo: formatDriverBankCardNumberInput(bankAccountNo),
                }))
              }
            />
            <Pressable
              testID="driver-bank-card-toggle-default"
              style={styles.detailSecondaryButton}
              onPress={() =>
                setBankCardForm(current => ({
                  ...current,
                  isDefault: !current.isDefault,
                }))
              }
            >
              <Text style={styles.detailSecondaryButtonText}>
                {`默认银行卡：${bankCardForm.isDefault ? '是' : '否'}`}
              </Text>
            </Pressable>
            <Pressable
              testID="driver-bank-card-submit"
              style={styles.detailPrimaryButton}
              onPress={submitBankCard}
            >
              <Text style={styles.detailPrimaryButtonText}>添加银行卡</Text>
            </Pressable>
            <Pressable
              testID="driver-bank-card-cancel"
              style={styles.detailSecondaryButton}
              onPress={closeBankCardForm}
            >
              <Text style={styles.detailSecondaryButtonText}>取消</Text>
            </Pressable>
          </View>
        ) : null}
        {!showBankCardForm ? (
          <Pressable
            testID="driver-bank-card-add"
            style={styles.detailSecondaryButton}
            onPress={() => openBankCardForm()}
          >
            <Text style={styles.detailSecondaryButtonText}>添加银行卡</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.detailCard}>
        <Text testID="driver-certification-title" style={styles.detailRoute}>
          司机认证
        </Text>
        <Text testID="driver-identity-status" style={styles.detailMeta}>
          {`实名认证：${getCertificationStatusText(
            certification?.identity?.status,
          )}`}
        </Text>
        <Text testID="driver-vehicle-status" style={styles.detailMeta}>
          {`车辆认证：${getCertificationStatusText(
            certification?.vehicle?.status,
          )}`}
        </Text>
        {certification?.identity?.rejectionReason ? (
          <Text style={styles.detailMeta}>
            实名驳回原因：{certification.identity.rejectionReason}
          </Text>
        ) : null}
        {certification?.vehicle?.rejectionReason ? (
          <Text style={styles.detailMeta}>
            车辆驳回原因：{certification.vehicle.rejectionReason}
          </Text>
        ) : null}

        <TextInput
          testID="driver-cert-real-name"
          style={styles.ordersSearchInput}
          placeholder="司机姓名"
          placeholderTextColor={colors.textMuted}
          value={certificationForm.realName}
          onChangeText={realName =>
            setCertificationForm(current => ({ ...current, realName }))
          }
        />
        <TextInput
          testID="driver-cert-identity-number"
          style={styles.ordersSearchInput}
          placeholder="身份证号"
          placeholderTextColor={colors.textMuted}
          value={certificationForm.identityNumber}
          onChangeText={identityNumber =>
            setCertificationForm(current => ({ ...current, identityNumber }))
          }
        />
        <TextInput
          testID="driver-cert-identity-front-file"
          style={styles.ordersSearchInput}
          placeholder="可手动填写身份证人像面文件 ID"
          placeholderTextColor={colors.textMuted}
          value={certificationForm.identityFrontFileId}
          onChangeText={identityFrontFileId =>
            setCertificationForm(current => ({
              ...current,
              identityFrontFileId,
            }))
          }
        />
        <Pressable
          testID="driver-cert-upload-identity-front"
          style={styles.detailSecondaryButton}
          onPress={() => {
            uploadCertificationFile('identityFrontFileId').catch(
              () => undefined,
            );
          }}
        >
          <Text style={styles.detailSecondaryButtonText}>上传身份证人像面</Text>
        </Pressable>
        <TextInput
          testID="driver-cert-identity-back-file"
          style={styles.ordersSearchInput}
          placeholder="可手动填写身份证国徽面文件 ID"
          placeholderTextColor={colors.textMuted}
          value={certificationForm.identityBackFileId}
          onChangeText={identityBackFileId =>
            setCertificationForm(current => ({
              ...current,
              identityBackFileId,
            }))
          }
        />
        <Pressable
          testID="driver-cert-upload-identity-back"
          style={styles.detailSecondaryButton}
          onPress={() => {
            uploadCertificationFile('identityBackFileId').catch(
              () => undefined,
            );
          }}
        >
          <Text style={styles.detailSecondaryButtonText}>上传身份证国徽面</Text>
        </Pressable>
        <Text style={styles.routeMeta}>
          上传后会自动回填文件 ID；如已存在平台附件，也可手动填写已有文件 ID。
        </Text>
        <Text style={styles.draftSectionTitle}>实名认证附件</Text>
        {identityAttachmentEntries.map(entry => (
          <ImageCredentialCard
            key={entry.fieldName}
            title={createCertificationAttachmentTitle(entry)}
            publicUrl={entry.attachmentRef?.file.publicUrl}
            placeholderLabel={entry.label}
            metaLines={createCertificationAttachmentMetaLines(entry)}
            imageTestID={`driver-cert-preview-image-${entry.fieldName}`}
            placeholderTestID={`driver-cert-preview-placeholder-${entry.fieldName}`}
            previewGroup={identityAttachmentEntries.map(groupEntry => ({
              key: groupEntry.fieldName,
              title: createCertificationAttachmentTitle(groupEntry),
              publicUrl: groupEntry.attachmentRef?.file.publicUrl,
              fileId: groupEntry.attachmentRef?.file.id,
            }))}
            previewKey={entry.fieldName}
            previewFileId={entry.attachmentRef?.file.id}
          />
        ))}
        <Pressable
          testID="driver-cert-submit-identity"
          style={styles.detailSecondaryButton}
          onPress={submitIdentityCertification}
        >
          <Text style={styles.detailSecondaryButtonText}>提交实名</Text>
        </Pressable>

        <TextInput
          testID="driver-cert-plate-number"
          style={styles.ordersSearchInput}
          placeholder="车牌号"
          placeholderTextColor={colors.textMuted}
          value={certificationForm.plateNumber}
          onChangeText={plateNumber =>
            setCertificationForm(current => ({ ...current, plateNumber }))
          }
        />
        <TextInput
          testID="driver-cert-vehicle-type"
          style={styles.ordersSearchInput}
          placeholder="车辆类型"
          placeholderTextColor={colors.textMuted}
          value={certificationForm.vehicleType}
          onChangeText={vehicleType =>
            setCertificationForm(current => ({ ...current, vehicleType }))
          }
        />
        <TextInput
          testID="driver-cert-vehicle-length"
          style={styles.ordersSearchInput}
          placeholder="车长"
          placeholderTextColor={colors.textMuted}
          value={certificationForm.vehicleLengthText}
          onChangeText={vehicleLengthText =>
            setCertificationForm(current => ({
              ...current,
              vehicleLengthText,
            }))
          }
        />
        <TextInput
          testID="driver-cert-load-capacity"
          style={styles.ordersSearchInput}
          placeholder="载重"
          placeholderTextColor={colors.textMuted}
          value={certificationForm.loadCapacityText}
          onChangeText={loadCapacityText =>
            setCertificationForm(current => ({
              ...current,
              loadCapacityText,
            }))
          }
        />
        <TextInput
          testID="driver-cert-driving-license-file"
          style={styles.ordersSearchInput}
          placeholder="可手动填写行驶证文件 ID"
          placeholderTextColor={colors.textMuted}
          value={certificationForm.drivingLicenseFileId}
          onChangeText={drivingLicenseFileId =>
            setCertificationForm(current => ({
              ...current,
              drivingLicenseFileId,
            }))
          }
        />
        <Pressable
          testID="driver-cert-upload-driving-license"
          style={styles.detailSecondaryButton}
          onPress={() => {
            uploadCertificationFile('drivingLicenseFileId').catch(
              () => undefined,
            );
          }}
        >
          <Text style={styles.detailSecondaryButtonText}>上传行驶证</Text>
        </Pressable>
        <TextInput
          testID="driver-cert-driver-license-file"
          style={styles.ordersSearchInput}
          placeholder="可手动填写驾驶证文件 ID"
          placeholderTextColor={colors.textMuted}
          value={certificationForm.driverLicenseFileId}
          onChangeText={driverLicenseFileId =>
            setCertificationForm(current => ({
              ...current,
              driverLicenseFileId,
            }))
          }
        />
        <Pressable
          testID="driver-cert-upload-driver-license"
          style={styles.detailSecondaryButton}
          onPress={() => {
            uploadCertificationFile('driverLicenseFileId').catch(
              () => undefined,
            );
          }}
        >
          <Text style={styles.detailSecondaryButtonText}>上传驾驶证</Text>
        </Pressable>
        <TextInput
          testID="driver-cert-transport-qualification-file"
          style={styles.ordersSearchInput}
          placeholder="可手动填写从业资格证文件 ID"
          placeholderTextColor={colors.textMuted}
          value={certificationForm.transportQualificationFileId}
          onChangeText={transportQualificationFileId =>
            setCertificationForm(current => ({
              ...current,
              transportQualificationFileId,
            }))
          }
        />
        <Pressable
          testID="driver-cert-upload-transport-qualification"
          style={styles.detailSecondaryButton}
          onPress={() => {
            uploadCertificationFile('transportQualificationFileId').catch(
              () => undefined,
            );
          }}
        >
          <Text style={styles.detailSecondaryButtonText}>上传从业资格证</Text>
        </Pressable>
        <TextInput
          testID="driver-cert-operation-permit-file"
          style={styles.ordersSearchInput}
          placeholder="可手动填写营运证文件 ID"
          placeholderTextColor={colors.textMuted}
          value={certificationForm.operationPermitFileId}
          onChangeText={operationPermitFileId =>
            setCertificationForm(current => ({
              ...current,
              operationPermitFileId,
            }))
          }
        />
        <Pressable
          testID="driver-cert-upload-operation-permit"
          style={styles.detailSecondaryButton}
          onPress={() => {
            uploadCertificationFile('operationPermitFileId').catch(
              () => undefined,
            );
          }}
        >
          <Text style={styles.detailSecondaryButtonText}>上传营运证</Text>
        </Pressable>
        <TextInput
          testID="driver-cert-vehicle-photo-file"
          style={styles.ordersSearchInput}
          placeholder="可手动填写车辆照片文件 ID"
          placeholderTextColor={colors.textMuted}
          value={certificationForm.vehiclePhotoFileId}
          onChangeText={vehiclePhotoFileId =>
            setCertificationForm(current => ({
              ...current,
              vehiclePhotoFileId,
            }))
          }
        />
        <Pressable
          testID="driver-cert-upload-vehicle-photo"
          style={styles.detailSecondaryButton}
          onPress={() => {
            uploadCertificationFile('vehiclePhotoFileId').catch(
              () => undefined,
            );
          }}
        >
          <Text style={styles.detailSecondaryButtonText}>上传车辆照片</Text>
        </Pressable>
        <Text style={styles.routeMeta}>
          车辆资料上传后会自动回填文件
          ID；如已存在平台附件，也可手动填写已有文件 ID。
        </Text>
        <Text style={styles.draftSectionTitle}>车辆认证附件</Text>
        {vehicleAttachmentEntries.map(entry => (
          <ImageCredentialCard
            key={entry.fieldName}
            title={createCertificationAttachmentTitle(entry)}
            publicUrl={entry.attachmentRef?.file.publicUrl}
            placeholderLabel={entry.label}
            metaLines={createCertificationAttachmentMetaLines(entry)}
            imageTestID={`driver-cert-preview-image-${entry.fieldName}`}
            placeholderTestID={`driver-cert-preview-placeholder-${entry.fieldName}`}
            previewGroup={vehicleAttachmentEntries.map(groupEntry => ({
              key: groupEntry.fieldName,
              title: createCertificationAttachmentTitle(groupEntry),
              publicUrl: groupEntry.attachmentRef?.file.publicUrl,
              fileId: groupEntry.attachmentRef?.file.id,
            }))}
            previewKey={entry.fieldName}
            previewFileId={entry.attachmentRef?.file.id}
          />
        ))}
        <Pressable
          testID="driver-cert-toggle-tailboard"
          style={styles.detailSecondaryButton}
          onPress={() =>
            setCertificationForm(current => ({
              ...current,
              hasTailboard: !current.hasTailboard,
            }))
          }
        >
          <Text style={styles.detailSecondaryButtonText}>
            尾板：{certificationForm.hasTailboard ? '有' : '无'}
          </Text>
        </Pressable>
        <Pressable
          testID="driver-cert-submit-vehicle"
          style={styles.detailSecondaryButton}
          onPress={submitVehicleCertification}
        >
          <Text style={styles.detailSecondaryButtonText}>提交车辆</Text>
        </Pressable>
      </View>

      <View style={styles.detailCard}>
        <Text testID="driver-order-hall-title" style={styles.detailRoute}>
          待接单订单
        </Text>
        <Text style={styles.detailMeta}>
          根据您的车型和接单范围筛选的附近订单
        </Text>
        <TextInput
          testID="driver-order-hall-search"
          style={styles.ordersSearchInput}
          placeholder="搜索订单号、装货地址或卸货地址"
          placeholderTextColor={colors.textMuted}
          value={orderHallSearchKeyword}
          onChangeText={setOrderHallSearchKeyword}
        />
        <View style={styles.ordersTabs}>
          {driverOrderHallFilterOptions.map(filter => {
            const active = activeOrderHallFilter === filter.id;
            return (
              <Pressable
                key={filter.id}
                testID={filter.testID}
                style={[styles.ordersTab, active && styles.ordersTabActive]}
                onPress={() => setActiveOrderHallFilter(filter.id)}
              >
                <Text
                  style={[
                    styles.ordersTabText,
                    active && styles.ordersTabTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {orderHallFilterSummaryText ? (
          <Text
            testID="driver-order-hall-filter-summary"
            style={styles.detailMeta}
          >
            {orderHallFilterSummaryText}
          </Text>
        ) : null}
      </View>

      {displayedOrderHallOrders.length === 0 ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailMeta}>
            {orderHallKeyword
              ? '没有匹配的待接单订单。'
              : activeOrderHallFilter === 'all'
              ? '暂无可接订单，请调整接单设置。'
              : '当前筛选下暂无待接单订单。'}
          </Text>
        </View>
      ) : (
        displayedOrderHallOrders.map(order => {
          const form = getForm(order.orderNo);
          const latestExceptionCaseHeadline = order.latestExceptionCase
            ? getOrderExceptionCaseSummaryHeadline(order.latestExceptionCase)
            : undefined;
          const latestExceptionCaseDetail = order.latestExceptionCase
            ? getOrderExceptionCaseSummaryText(order.latestExceptionCase)
            : undefined;
          const orderDistanceText = getDriverOrderPickupDistanceText(order);
          const orderBonusText = getDriverOrderHallBonusText(order);

          return (
            <View
              key={order.id}
              testID={`driver-order-card-${order.orderNo}`}
              style={styles.detailCard}
            >
              <Text style={styles.detailRoute}>
                {order.pickupAddress} → {order.deliveryAddress}
              </Text>
              <Text style={styles.detailMeta}>
                {order.orderNo} · {order.cargoType} · {order.weightText}
              </Text>
              <View style={styles.orderMetaRow}>
                <Text
                  testID={`driver-order-pricing-${order.orderNo}`}
                  style={styles.orderMetaText}
                >
                  {getDriverOrderHallPricingText(order)}
                </Text>
                {orderBonusText ? (
                  <Text
                    testID={`driver-order-bonus-${order.orderNo}`}
                    style={styles.orderMetaText}
                  >
                    {orderBonusText}
                  </Text>
                ) : null}
                {orderDistanceText ? (
                  <Text
                    testID={`driver-order-distance-${order.orderNo}`}
                    style={styles.orderMetaText}
                  >
                    {orderDistanceText}
                  </Text>
                ) : null}
              </View>
              {latestExceptionCaseHeadline ? (
                <View style={styles.orderExceptionSummary}>
                  <Text
                    style={styles.orderExceptionSummaryTitle}
                    numberOfLines={1}
                  >
                    {latestExceptionCaseHeadline}
                  </Text>
                  {latestExceptionCaseDetail ? (
                    <Text
                      style={styles.orderExceptionSummaryText}
                      numberOfLines={2}
                    >
                      {latestExceptionCaseDetail}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <Text style={styles.detailMeta}>
                装货：{order.pickupContact} {order.pickupPhone}
              </Text>
              <Text style={styles.detailMeta}>
                卸货：{order.deliveryContact} {order.deliveryPhone}
              </Text>

              <TextInput
                testID={`driver-quote-cents-${order.orderNo}`}
                style={styles.ordersSearchInput}
                placeholder="报价金额，例如 880"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={form.quoteText}
                onChangeText={quoteText =>
                  updateForm(order.orderNo, { quoteText })
                }
              />
              <TextInput
                testID={`driver-arrival-${order.orderNo}`}
                style={styles.ordersSearchInput}
                placeholder="预计到达，例如 45 分钟到达"
                placeholderTextColor={colors.textMuted}
                value={form.arrivalText}
                onChangeText={arrivalText =>
                  updateForm(order.orderNo, { arrivalText })
                }
              />
              <TextInput
                testID={`driver-quote-note-${order.orderNo}`}
                style={styles.ordersSearchInput}
                placeholder="报价备注，可选"
                placeholderTextColor={colors.textMuted}
                value={form.noteText}
                onChangeText={noteText =>
                  updateForm(order.orderNo, { noteText })
                }
              />

              <Pressable
                testID={`driver-quote-submit-${order.orderNo}`}
                style={styles.detailSecondaryButton}
                onPress={() => submitQuote(order)}
              >
                <Text style={styles.detailSecondaryButtonText}>提交报价</Text>
              </Pressable>
              <Pressable
                testID={`driver-accept-${order.orderNo}`}
                style={styles.detailPrimaryButton}
                onPress={() => acceptOrder(order)}
              >
                <Text style={styles.detailPrimaryButtonText}>直接接单</Text>
              </Pressable>
            </View>
          );
        })
      )}

      <View style={styles.detailCard}>
        <Text testID="driver-my-orders-title" style={styles.detailRoute}>
          我的执行订单
        </Text>
        <Text style={styles.detailMeta}>
          展示已接单、运输中和待货主确认订单
        </Text>
        <TextInput
          testID="driver-my-orders-search"
          style={styles.ordersSearchInput}
          placeholder="搜索订单号、装货地址或卸货地址"
          placeholderTextColor={colors.textMuted}
          value={myOrdersSearchKeyword}
          onChangeText={setMyOrdersSearchKeyword}
        />
        <View style={styles.ordersTabs}>
          {[
            { id: 'all', label: '全部' },
            { id: 'loading', label: '待装货' },
            { id: 'transporting', label: '运输中' },
            { id: 'confirming', label: '待确认' },
          ].map(tab => {
            const active = activeMyOrdersFilter === tab.id;
            return (
              <Pressable
                key={tab.id}
                testID={`driver-my-orders-tab-${tab.id}`}
                style={[styles.ordersTab, active && styles.ordersTabActive]}
                onPress={() => setActiveMyOrdersFilter(tab.id)}
              >
                <Text
                  style={[
                    styles.ordersTabText,
                    active && styles.ordersTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {(() => {
          const keyword = myOrdersSearchKeyword.trim().toLowerCase();
          const statusFiltered =
            activeMyOrdersFilter === 'all'
              ? executingMyOrders
              : executingMyOrders.filter(
                  order => order.status === activeMyOrdersFilter,
                );
          const filtered = keyword
            ? statusFiltered.filter(
                order =>
                  order.orderNo.toLowerCase().includes(keyword) ||
                  order.pickupAddress.toLowerCase().includes(keyword) ||
                  order.deliveryAddress.toLowerCase().includes(keyword) ||
                  order.cargoType.toLowerCase().includes(keyword),
              )
            : statusFiltered;
          if (filtered.length === 0) {
            return <Text style={styles.detailMeta}>暂无执行中的订单。</Text>;
          }
          return filtered.map(order => {
            const latestExceptionCaseHeadline = order.latestExceptionCase
              ? getOrderExceptionCaseSummaryHeadline(order.latestExceptionCase)
              : undefined;
            const latestExceptionCaseDetail = order.latestExceptionCase
              ? getOrderExceptionCaseSummaryText(order.latestExceptionCase)
              : undefined;
            const driverOrderStatusBadgeStyle = {
              backgroundColor: getDriverStatusBadgeColor(order.status),
            };

            return (
              <View
                key={order.id}
                testID={`driver-my-order-card-${order.orderNo}`}
                style={styles.detailInlineGroup}
              >
                <Text style={styles.detailRoute}>
                  {order.pickupAddress} → {order.deliveryAddress}
                </Text>
                <View style={styles.driverOrderStatusRow}>
                  <Text style={styles.detailMeta}>
                    {order.orderNo} · {getDriverStatusText(order.status)}
                  </Text>
                  <View
                    style={[
                      styles.driverOrderStatusBadge,
                      driverOrderStatusBadgeStyle,
                    ]}
                  >
                    <Text style={styles.driverOrderStatusBadgeText}>
                      {getDriverStatusText(order.status)}
                    </Text>
                  </View>
                </View>
                {latestExceptionCaseHeadline ? (
                  <View style={styles.orderExceptionSummary}>
                    <Text
                      style={styles.orderExceptionSummaryTitle}
                      numberOfLines={1}
                    >
                      {latestExceptionCaseHeadline}
                    </Text>
                    {latestExceptionCaseDetail ? (
                      <Text
                        style={styles.orderExceptionSummaryText}
                        numberOfLines={2}
                      >
                        {latestExceptionCaseDetail}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                <Pressable
                  testID={`driver-open-order-${order.orderNo}`}
                  style={styles.detailSecondaryButton}
                  onPress={() => openOrderDetail(order)}
                >
                  <Text style={styles.detailSecondaryButtonText}>查看详情</Text>
                </Pressable>
              </View>
            );
          });
        })()}
      </View>

      <View style={styles.detailCard}>
        <Text testID="driver-completed-orders-title" style={styles.detailRoute}>
          已完成订单
        </Text>
        <Text style={styles.detailMeta}>展示已送达并确认完成的订单</Text>
        {completedMyOrders.length === 0 ? (
          <Text style={styles.detailMeta}>暂无已完成订单。</Text>
        ) : (
          completedMyOrders.map(order => (
            <View
              key={order.id}
              testID={`driver-completed-order-card-${order.orderNo}`}
              style={styles.detailInlineGroup}
            >
              <Text style={styles.detailRoute}>
                {order.pickupAddress} → {order.deliveryAddress}
              </Text>
              <Text style={styles.detailMeta}>
                {order.orderNo} · {getDriverStatusText(order.status)}
              </Text>
              <Text style={styles.detailMeta}>
                货物：{order.cargoType} · {order.weightText}
              </Text>
              <Pressable
                testID={`driver-open-completed-order-${order.orderNo}`}
                style={styles.detailSecondaryButton}
                onPress={() => openOrderDetail(order)}
              >
                <Text style={styles.detailSecondaryButtonText}>查看详情</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      {selectedOrder ? (
        <View
          testID={`driver-order-detail-${selectedOrder.orderNo}`}
          style={styles.detailCard}
        >
          <Text testID="driver-order-detail-title" style={styles.detailRoute}>
            执行订单详情
          </Text>
          <Text style={styles.detailMeta}>
            {selectedOrder.orderNo} ·{' '}
            {getDriverStatusText(selectedOrder.status)}
          </Text>
          <Text
            testID={`driver-order-route-${selectedOrder.orderNo}`}
            style={styles.detailMeta}
          >
            {`路线：${selectedOrder.pickupAddress} → ${selectedOrder.deliveryAddress}`}
          </Text>
          <Text style={styles.detailMeta}>
            货物：{selectedOrder.cargoType} · {selectedOrder.weightText} ·{' '}
            {selectedOrder.quantityText}
          </Text>
          <Text style={styles.detailMeta}>
            车辆：{selectedOrder.vehicleRequirement}
            {selectedOrder.vehicleLengthText
              ? ` · ${selectedOrder.vehicleLengthText}`
              : ''}
          </Text>
          <Text style={styles.detailMeta}>
            装货：{selectedOrder.pickupContact} {selectedOrder.pickupPhone}
          </Text>
          <Text style={styles.detailMeta}>
            卸货：{selectedOrder.deliveryContact} {selectedOrder.deliveryPhone}
          </Text>
          {(() => {
            const changeRequestEvent = [...(selectedOrder.events ?? [])]
              .filter(event => event.eventType === 'change_requested')
              .sort((left, right) =>
                right.createdAtIso.localeCompare(left.createdAtIso),
              )[0];
            if (!changeRequestEvent) {
              return null;
            }
            const reviewEvent = [...(selectedOrder.events ?? [])]
              .filter(
                event =>
                  (event.eventType === 'change_request_approved' ||
                    event.eventType === 'change_request_rejected') &&
                  event.createdAtIso >= changeRequestEvent.createdAtIso,
              )
              .sort((left, right) =>
                right.createdAtIso.localeCompare(left.createdAtIso),
              )[0];
            let reviewSnapshot:
              | {
                  reviewResultText?: string;
                  costImpactText?: string;
                  driverNoticeText?: string;
                  adjustedPayablePriceCents?: number;
                  previousPayablePriceCents?: number;
                }
              | undefined;
            if (reviewEvent?.noteText) {
              try {
                const parsed = JSON.parse(reviewEvent.noteText) as Record<
                  string,
                  unknown
                >;
                if (
                  parsed &&
                  typeof parsed === 'object' &&
                  !Array.isArray(parsed)
                ) {
                  reviewSnapshot = {
                    reviewResultText:
                      typeof parsed.reviewResultText === 'string'
                        ? parsed.reviewResultText
                        : undefined,
                    costImpactText:
                      typeof parsed.costImpactText === 'string'
                        ? parsed.costImpactText
                        : undefined,
                    driverNoticeText:
                      typeof parsed.driverNoticeText === 'string'
                        ? parsed.driverNoticeText
                        : undefined,
                    adjustedPayablePriceCents:
                      typeof parsed.adjustedPayablePriceCents === 'number'
                        ? parsed.adjustedPayablePriceCents
                        : undefined,
                    previousPayablePriceCents:
                      typeof parsed.previousPayablePriceCents === 'number'
                        ? parsed.previousPayablePriceCents
                        : undefined,
                  };
                }
              } catch {
                reviewSnapshot = {
                  reviewResultText: reviewEvent.noteText,
                };
              }
            }

            return (
              <View style={styles.detailInlineGroup}>
                <Text style={styles.draftSectionTitle}>修改申请</Text>
                <Text
                  testID={`driver-change-request-description-${selectedOrder.orderNo}`}
                  style={styles.detailMeta}
                >
                  {changeRequestEvent.noteText || '货主已提交修改申请'}
                </Text>
                <Text style={styles.detailMeta}>
                  {reviewEvent
                    ? reviewEvent.eventType === 'change_request_approved'
                      ? '状态：客服已通过'
                      : '状态：客服已驳回'
                    : '状态：待客服确认'}
                </Text>
                {reviewSnapshot?.reviewResultText ? (
                  <Text style={styles.detailMeta}>
                    审核结果：{reviewSnapshot.reviewResultText}
                  </Text>
                ) : null}
                {reviewSnapshot?.costImpactText ? (
                  <Text style={styles.detailMeta}>
                    费用影响：{reviewSnapshot.costImpactText}
                  </Text>
                ) : null}
                {reviewSnapshot?.driverNoticeText ? (
                  <Text style={styles.detailMeta}>
                    司机通知：{reviewSnapshot.driverNoticeText}
                  </Text>
                ) : null}
                {reviewSnapshot?.adjustedPayablePriceCents !== undefined ? (
                  <Text
                    testID={`driver-change-request-adjusted-price-${selectedOrder.orderNo}`}
                    style={styles.detailMeta}
                  >
                    {`审核改价：${
                      reviewSnapshot.previousPayablePriceCents !== undefined
                        ? `￥${(
                            reviewSnapshot.previousPayablePriceCents / 100
                          ).toFixed(2)} → `
                        : ''
                    }￥${(
                      reviewSnapshot.adjustedPayablePriceCents / 100
                    ).toFixed(2)}`}
                  </Text>
                ) : null}
                {typeof selectedOrder.payablePriceCents === 'number' ||
                typeof selectedOrder.priceCents === 'number' ? (
                  <Text style={styles.detailMeta}>
                    {`当前订单金额：￥${(
                      ((selectedOrder.payablePriceCents ??
                        selectedOrder.priceCents) as number) / 100
                    ).toFixed(2)}`}
                  </Text>
                ) : null}
              </View>
            );
          })()}
          {navigationTargets.length > 0 ? (
            <View style={styles.detailInlineGroup}>
              <Text style={styles.draftSectionTitle}>导航与位置</Text>
              {navigationTargets.map(target => (
                <View
                  key={`${target.type}-${target.address}`}
                  style={styles.detailInfoCard}
                >
                  <Text style={styles.detailInfoLabel}>
                    {target.type === 'pickup' ? '装货点' : '卸货点'}
                  </Text>
                  <Text
                    testID={`driver-navigation-target-address-${target.type}-${selectedOrder.orderNo}`}
                    style={styles.detailInfoValue}
                  >
                    {target.address}
                  </Text>
                  <Text
                    testID={`driver-navigation-target-contact-${target.type}-${selectedOrder.orderNo}`}
                    style={styles.detailMeta}
                  >
                    {`联系人：${target.contactName} ${target.contactPhone}`}
                  </Text>
                  <Pressable
                    testID={`driver-navigate-${target.type}-${selectedOrder.orderNo}`}
                    style={styles.detailSecondaryButton}
                    onPress={() => openDriverNavigation(target)}
                  >
                    <Text style={styles.detailSecondaryButtonText}>
                      外跳导航到{target.type === 'pickup' ? '装货点' : '卸货点'}
                    </Text>
                  </Pressable>
                </View>
              ))}
              {platformMapsApi ? (
                <Pressable
                  testID={`driver-report-location-${selectedOrder.orderNo}`}
                  style={styles.detailSecondaryButton}
                  onPress={reportSandboxDriverLocation}
                >
                  <Text style={styles.detailSecondaryButtonText}>
                    上报 sandbox 位置
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {latestReportedDriverLocation ? (
            <View style={styles.detailInfoCard}>
              <Text style={styles.detailInfoLabel}>最新上报位置</Text>
              {latestReportedDriverLocationCoordinateText ? (
                <Text
                  testID={`driver-latest-location-coordinate-${selectedOrder.orderNo}`}
                  style={styles.detailInfoValue}
                >
                  {latestReportedDriverLocationCoordinateText}
                </Text>
              ) : null}
              <Text
                testID={`driver-latest-location-meta-${selectedOrder.orderNo}`}
                style={styles.detailMeta}
              >
                {latestReportedDriverLocationMetaText}
              </Text>
              {latestReportedDriverLocationEstimateText ? (
                <Text
                  testID={`driver-latest-location-estimate-${selectedOrder.orderNo}`}
                  style={styles.detailMeta}
                >
                  {latestReportedDriverLocationEstimateText}
                </Text>
              ) : null}
              {latestReportedDriverLocation.targetAddress ? (
                <Text
                  testID={`driver-latest-location-target-${selectedOrder.orderNo}`}
                  style={styles.detailMeta}
                >
                  {`当前目标：${latestReportedDriverLocation.targetAddress}`}
                </Text>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.detailMeta}>
            事件记录：{selectedOrder.events?.length ?? 0} 条
          </Text>
          {latestDriverException?.noteText ? (
            <Text style={styles.detailMeta}>
              最新异常：{latestDriverException.noteText}
            </Text>
          ) : null}
          {selectedReportedExceptionAttachmentRefs.length > 0 ? (
            <View>
              <Text style={styles.draftSectionTitle}>最近一次异常凭证</Text>
              {selectedReportedExceptionAttachmentRefs.map(
                (attachmentRef, index) => (
                  <ImageCredentialCard
                    key={`reported-exception-${attachmentRef.file.id}-${index}`}
                    title={`异常凭证 ${index + 1}：${attachmentRef.fileName}`}
                    publicUrl={attachmentRef.file.publicUrl}
                    placeholderLabel={`异常凭证 ${index + 1}`}
                    metaLines={createUploadedAttachmentMetaLines(attachmentRef)}
                    imageTestID={`driver-reported-exception-preview-image-${
                      index + 1
                    }`}
                    placeholderTestID={`driver-reported-exception-preview-placeholder-${
                      index + 1
                    }`}
                    previewGroup={selectedReportedExceptionAttachmentRefs.map(
                      (groupRef, groupIndex) => ({
                        key: `reported-exception-${groupRef.file.id}-${groupIndex}`,
                        title: `异常凭证 ${groupIndex + 1}：${
                          groupRef.fileName
                        }`,
                        publicUrl: groupRef.file.publicUrl,
                        fileId: groupRef.file.id,
                      }),
                    )}
                    previewKey={`reported-exception-${attachmentRef.file.id}-${index}`}
                    previewFileId={attachmentRef.file.id}
                  />
                ),
              )}
            </View>
          ) : null}
          <ExceptionCaseProgressPanel
            cases={sortedExceptionCases}
            isLoading={isLoadingExceptionCases}
            notice={exceptionCaseNotice}
            appealDrafts={appealDrafts}
            appealingCaseId={appealingCaseId}
            platformFileApi={platformFileApi}
            onChangeAppealReason={(caseId, reason) =>
              setAppealDrafts(currentDrafts => ({
                ...currentDrafts,
                [caseId]: reason,
              }))
            }
            onSubmitAppeal={
              platformDriverOrderApi?.appealExceptionCase
                ? submitExceptionCaseAppeal
                : undefined
            }
          />
          {canDriverReportException(selectedOrder.status) ? (
            <View style={styles.detailInlineGroup}>
              <Text style={styles.draftSectionTitle}>上报运输异常</Text>
              {driverExceptionTypeOptions.map(option => (
                <Pressable
                  key={option.id}
                  testID={`driver-exception-type-${option.id}-${selectedOrder.orderNo}`}
                  style={styles.detailSecondaryButton}
                  onPress={() =>
                    updateExceptionForm(selectedOrder.orderNo, {
                      typeLabel: option.label,
                    })
                  }
                >
                  <Text style={styles.detailSecondaryButtonText}>
                    {selectedExceptionForm.typeLabel === option.label
                      ? `已选：${option.label}`
                      : option.label}
                  </Text>
                </Pressable>
              ))}
              <TextInput
                testID={`driver-exception-description-${selectedOrder.orderNo}`}
                style={styles.ordersSearchInput}
                placeholder="异常说明，至少 6 个字"
                placeholderTextColor={colors.textMuted}
                multiline
                value={selectedExceptionForm.description}
                onChangeText={description =>
                  updateExceptionForm(selectedOrder.orderNo, { description })
                }
              />
              <Text style={styles.detailMeta}>
                异常证据：{selectedExceptionForm.photoFileIds.length} / 6 张
              </Text>
              <Pressable
                testID={`driver-upload-exception-proof-${selectedOrder.orderNo}`}
                style={styles.detailSecondaryButton}
                onPress={() => {
                  uploadExceptionProof(selectedOrder).catch(() => undefined);
                }}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  上传异常凭证
                </Text>
              </Pressable>
              {selectedExceptionAttachmentRefs.length > 0 ? (
                <View>
                  <Text style={styles.draftSectionTitle}>异常凭证清单</Text>
                  {selectedExceptionAttachmentRefs.map(
                    (attachmentRef, index) => (
                      <ImageCredentialCard
                        key={`${attachmentRef.file.id}-${index}`}
                        title={`异常凭证 ${index + 1}：${
                          attachmentRef.fileName
                        }`}
                        publicUrl={attachmentRef.file.publicUrl}
                        placeholderLabel={`异常凭证 ${index + 1}`}
                        metaLines={createUploadedAttachmentMetaLines(
                          attachmentRef,
                        )}
                        imageTestID={`driver-exception-preview-image-${
                          index + 1
                        }`}
                        placeholderTestID={`driver-exception-preview-placeholder-${
                          index + 1
                        }`}
                        previewGroup={selectedExceptionAttachmentRefs.map(
                          (groupRef, groupIndex) => ({
                            key: `${groupRef.file.id}-${groupIndex}`,
                            title: `异常凭证 ${groupIndex + 1}：${
                              groupRef.fileName
                            }`,
                            publicUrl: groupRef.file.publicUrl,
                            fileId: groupRef.file.id,
                          }),
                        )}
                        previewKey={`${attachmentRef.file.id}-${index}`}
                        previewFileId={attachmentRef.file.id}
                      />
                    ),
                  )}
                </View>
              ) : null}
              <Pressable
                testID={`driver-submit-exception-${selectedOrder.orderNo}`}
                style={styles.detailPrimaryButton}
                onPress={() => submitException(selectedOrder)}
              >
                <Text style={styles.detailPrimaryButtonText}>提交异常上报</Text>
              </Pressable>
            </View>
          ) : null}
          {hasDriverEvaluationSubmitted(selectedOrder) ? (
            <>
              {latestEvaluationReply?.noteText ? (
                <Text style={styles.detailMeta}>
                  司机回复：{latestEvaluationReply.noteText}
                </Text>
              ) : null}
              <TextInput
                testID={`driver-evaluation-reply-${selectedOrder.orderNo}`}
                style={styles.ordersSearchInput}
                placeholder="回复货主评价，200 字以内"
                placeholderTextColor={colors.textMuted}
                value={evaluationReplyForms[selectedOrder.orderNo] ?? ''}
                onChangeText={content =>
                  updateEvaluationReplyForm(selectedOrder.orderNo, content)
                }
              />
              <Pressable
                testID={`driver-submit-evaluation-reply-${selectedOrder.orderNo}`}
                style={styles.detailSecondaryButton}
                onPress={() => submitEvaluationReply(selectedOrder)}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  提交评价回复
                </Text>
              </Pressable>
            </>
          ) : null}
          {selectedOrder.status === 'completed' ? (
            <>
              {latestShipperEvaluation?.noteText ? (
                <Text style={styles.detailMeta}>
                  司机评价货主：{latestShipperEvaluation.noteText}
                </Text>
              ) : null}
              {selectedReportedShipperEvaluationAttachmentRefs.length > 0 ? (
                <View>
                  <Text style={styles.draftSectionTitle}>
                    最近一次评价货主凭证
                  </Text>
                  {selectedReportedShipperEvaluationAttachmentRefs.map(
                    (attachmentRef, index) => (
                      <ImageCredentialCard
                        key={`reported-shipper-evaluation-${attachmentRef.file.id}-${index}`}
                        title={`评价货主凭证 ${index + 1}：${
                          attachmentRef.fileName
                        }`}
                        publicUrl={attachmentRef.file.publicUrl}
                        placeholderLabel={`评价货主凭证 ${index + 1}`}
                        metaLines={createUploadedAttachmentMetaLines(
                          attachmentRef,
                        )}
                        imageTestID={`driver-reported-shipper-evaluation-preview-image-${
                          index + 1
                        }`}
                        placeholderTestID={`driver-reported-shipper-evaluation-preview-placeholder-${
                          index + 1
                        }`}
                        previewGroup={selectedReportedShipperEvaluationAttachmentRefs.map(
                          (groupRef, groupIndex) => ({
                            key: `reported-shipper-evaluation-${groupRef.file.id}-${groupIndex}`,
                            title: `评价货主凭证 ${groupIndex + 1}：${
                              groupRef.fileName
                            }`,
                            publicUrl: groupRef.file.publicUrl,
                            fileId: groupRef.file.id,
                          }),
                        )}
                        previewKey={`reported-shipper-evaluation-${attachmentRef.file.id}-${index}`}
                        previewFileId={attachmentRef.file.id}
                      />
                    ),
                  )}
                </View>
              ) : null}
              <TextInput
                testID={`driver-shipper-evaluation-rating-${selectedOrder.orderNo}`}
                style={styles.ordersSearchInput}
                placeholder="给货主评分，1-5"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={selectedShipperEvaluationForm.ratingText}
                onChangeText={ratingText =>
                  updateShipperEvaluationForm(selectedOrder.orderNo, {
                    ratingText,
                  })
                }
              />
              <TextInput
                testID={`driver-shipper-evaluation-tags-${selectedOrder.orderNo}`}
                style={styles.ordersSearchInput}
                placeholder="评价标签，用顿号或逗号分隔"
                placeholderTextColor={colors.textMuted}
                value={selectedShipperEvaluationForm.tagsText}
                onChangeText={tagsText =>
                  updateShipperEvaluationForm(selectedOrder.orderNo, {
                    tagsText,
                  })
                }
              />
              <TextInput
                testID={`driver-shipper-evaluation-content-${selectedOrder.orderNo}`}
                style={styles.ordersSearchInput}
                placeholder="评价货主，至少 6 个字"
                placeholderTextColor={colors.textMuted}
                value={selectedShipperEvaluationForm.content}
                onChangeText={content =>
                  updateShipperEvaluationForm(selectedOrder.orderNo, {
                    content,
                  })
                }
              />
              <Pressable
                testID={`driver-toggle-shipper-evaluation-anonymous-${selectedOrder.orderNo}`}
                style={styles.detailSecondaryButton}
                onPress={() => {
                  updateShipperEvaluationForm(selectedOrder.orderNo, {
                    anonymous: !selectedShipperEvaluationForm.anonymous,
                  });
                }}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  匿名：{selectedShipperEvaluationForm.anonymous ? '是' : '否'}
                </Text>
              </Pressable>
              <Text style={styles.detailMeta}>
                评价凭证：{selectedShipperEvaluationForm.photoFileIds.length} /
                6 张
              </Text>
              <Pressable
                testID={`driver-upload-shipper-evaluation-proof-${selectedOrder.orderNo}`}
                style={styles.detailSecondaryButton}
                onPress={() => {
                  uploadShipperEvaluationProof(selectedOrder).catch(
                    () => undefined,
                  );
                }}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  上传评价货主凭证
                </Text>
              </Pressable>
              {selectedShipperEvaluationAttachmentRefs.length > 0 ? (
                <View>
                  <Text style={styles.draftSectionTitle}>评价货主凭证清单</Text>
                  {selectedShipperEvaluationAttachmentRefs.map(
                    (attachmentRef, index) => (
                      <ImageCredentialCard
                        key={`${attachmentRef.file.id}-${index}`}
                        title={`评价货主凭证 ${index + 1}：${
                          attachmentRef.fileName
                        }`}
                        publicUrl={attachmentRef.file.publicUrl}
                        placeholderLabel={`评价货主凭证 ${index + 1}`}
                        metaLines={createUploadedAttachmentMetaLines(
                          attachmentRef,
                        )}
                        imageTestID={`driver-shipper-evaluation-preview-image-${
                          index + 1
                        }`}
                        placeholderTestID={`driver-shipper-evaluation-preview-placeholder-${
                          index + 1
                        }`}
                        previewGroup={selectedShipperEvaluationAttachmentRefs.map(
                          (groupRef, groupIndex) => ({
                            key: `${groupRef.file.id}-${groupIndex}`,
                            title: `评价货主凭证 ${groupIndex + 1}：${
                              groupRef.fileName
                            }`,
                            publicUrl: groupRef.file.publicUrl,
                            fileId: groupRef.file.id,
                          }),
                        )}
                        previewKey={`${attachmentRef.file.id}-${index}`}
                        previewFileId={attachmentRef.file.id}
                      />
                    ),
                  )}
                </View>
              ) : null}
              <Pressable
                testID={`driver-submit-shipper-evaluation-${selectedOrder.orderNo}`}
                style={styles.detailSecondaryButton}
                onPress={() => submitShipperEvaluation(selectedOrder)}
              >
                <Text style={styles.detailSecondaryButtonText}>评价货主</Text>
              </Pressable>
            </>
          ) : null}
          {selectedEvaluationReplyQueueItem ? (
            <View
              testID={`driver-evaluation-reply-queue-${selectedOrder.orderNo}`}
              style={styles.detailInlineGroup}
            >
              <Text style={styles.draftSectionTitle}>评价回复同步队列</Text>
              <Text style={styles.detailMeta}>
                待重试：{selectedEvaluationReplyQueueItem.content}
              </Text>
              <Pressable
                testID={`driver-retry-evaluation-reply-${selectedOrder.orderNo}`}
                style={styles.detailSecondaryButton}
                onPress={() =>
                  retryEvaluationReply(selectedEvaluationReplyQueueItem)
                }
              >
                <Text style={styles.detailSecondaryButtonText}>
                  重试评价回复
                </Text>
              </Pressable>
            </View>
          ) : null}
          <Text style={styles.detailMeta}>
            已关联凭证：{selectedExecutionReceiptCount} 张
          </Text>
          {selectedExecutionReceiptSections.length > 0 ? (
            <View>
              {selectedExecutionReceiptSections.map(section => (
                <View key={section.key}>
                  <Text style={styles.draftSectionTitle}>
                    {section.label}清单
                  </Text>
                  {section.refs.map((attachmentRef, index) => (
                    <ImageCredentialCard
                      key={`${section.key}-${attachmentRef.file.id}-${index}`}
                      title={`${section.label} ${index + 1}：${
                        attachmentRef.fileName
                      }`}
                      publicUrl={attachmentRef.file.publicUrl}
                      placeholderLabel={section.label}
                      metaLines={createUploadedAttachmentMetaLines(
                        attachmentRef,
                      )}
                      imageTestID={`driver-receipt-preview-image-${
                        section.key
                      }-${index + 1}`}
                      placeholderTestID={`driver-receipt-preview-placeholder-${
                        section.key
                      }-${index + 1}`}
                      previewGroup={section.refs.map(
                        (groupRef, groupIndex) => ({
                          key: `${section.key}-${groupRef.file.id}-${groupIndex}`,
                          title: `${section.label} ${groupIndex + 1}：${
                            groupRef.fileName
                          }`,
                          publicUrl: groupRef.file.publicUrl,
                          fileId: groupRef.file.id,
                        }),
                      )}
                      previewKey={`${section.key}-${attachmentRef.file.id}-${index}`}
                      previewFileId={attachmentRef.file.id}
                    />
                  ))}
                </View>
              ))}
            </View>
          ) : null}
          <Pressable
            testID={`driver-upload-receipt-${selectedOrder.orderNo}`}
            style={styles.detailSecondaryButton}
            onPress={() => {
              uploadExecutionReceipt(selectedOrder).catch(() => undefined);
            }}
          >
            <Text style={styles.detailSecondaryButtonText}>
              {getDriverReceiptUploadButtonText(selectedOrder.status)}
            </Text>
          </Pressable>
          <Pressable
            testID={`driver-advance-status-${selectedOrder.orderNo}`}
            style={styles.detailPrimaryButton}
            onPress={advanceSelectedOrderStatus}
          >
            <Text style={styles.detailPrimaryButtonText}>
              {getDriverAdvanceButtonText(selectedOrder.status)}
            </Text>
          </Pressable>
          <DriverOrderExecution
            order={selectedOrder}
            baseUpdatedAtIso={
              selectedOrder.updatedAtIso ?? selectedOrder.createdAtIso ?? ''
            }
            navigationTargets={navigationTargets}
            platformMapsApi={platformMapsApi}
            platformFileApi={platformFileApi}
            onNavigate={openDriverNavigation}
            onReportLocation={reportSandboxDriverLocation}
            onCallContact={(contactType, contactName, phone) => {
              if (!phone) {
                setNotice(`${contactType}电话待补充。`);
                return;
              }
              Linking.openURL(`tel:${phone}`).catch(() => {
                setNotice(`无法打开拨号，请手动联系${contactType}。`);
              });
            }}
            onCancelOrder={request => {
              const baseUpdatedAtIso =
                selectedOrder.updatedAtIso ?? selectedOrder.createdAtIso ?? '';
              const mutationContext =
                createOrderMutationContext(baseUpdatedAtIso);
              executeDriverOrderMutation({
                operation: 'cancel',
                driverAccountId: resolvedDriverAccountId,
                orderId: selectedOrder.id,
                orderNo: selectedOrder.orderNo,
                request: {
                  baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
                  reasonText: request.reasonText,
                  ...(request.description
                    ? { description: request.description }
                    : {}),
                },
                mutationContext,
              });
            }}
            onAdvanceStatus={request => {
              const nextStatus = request.nextStatus as
                | 'transporting'
                | 'confirming';
              const baseUpdatedAtIso =
                selectedOrder.updatedAtIso ?? selectedOrder.createdAtIso ?? '';
              const mutationContext =
                createOrderMutationContext(baseUpdatedAtIso);
              executeDriverOrderMutation({
                operation: 'status',
                driverAccountId: resolvedDriverAccountId,
                orderId: selectedOrder.id,
                orderNo: selectedOrder.orderNo,
                request: {
                  baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
                  nextStatus,
                  ...(request.receiptPhotoFileIds?.length
                    ? { receiptPhotoFileIds: request.receiptPhotoFileIds }
                    : {}),
                },
                mutationContext,
              });
            }}
            onChangeReceipt={(file, fieldName) => {
              setExecutionProofs(current => {
                const currentOrderProofs = current[selectedOrder.id] ?? {
                  transportingReceiptFileIds: [],
                  confirmingReceiptFileIds: [],
                };
                if (fieldName === 'loadingReceiptFileId') {
                  return {
                    ...current,
                    [selectedOrder.id]: {
                      transportingReceiptFileIds: file ? [file.id] : [],
                      confirmingReceiptFileIds:
                        currentOrderProofs.confirmingReceiptFileIds,
                    },
                  };
                }
                return {
                  ...current,
                  [selectedOrder.id]: {
                    transportingReceiptFileIds:
                      currentOrderProofs.transportingReceiptFileIds,
                    confirmingReceiptFileIds: file ? [file.id] : [],
                  },
                };
              });
              setExecutionReceiptAttachments(current => {
                const currentOrderAttachments = current[selectedOrder.id] ?? {
                  transportingReceiptFiles: [],
                  confirmingReceiptFiles: [],
                };
                const fileName =
                  fieldName === 'loadingReceiptFileId'
                    ? '装货凭证.png'
                    : '到达凭证.png';

                if (fieldName === 'loadingReceiptFileId') {
                  return {
                    ...current,
                    [selectedOrder.id]: {
                      transportingReceiptFiles: file
                        ? [{ file, fileName }]
                        : [],
                      confirmingReceiptFiles:
                        currentOrderAttachments.confirmingReceiptFiles,
                    },
                  };
                }

                return {
                  ...current,
                  [selectedOrder.id]: {
                    transportingReceiptFiles:
                      currentOrderAttachments.transportingReceiptFiles,
                    confirmingReceiptFiles: file ? [{ file, fileName }] : [],
                  },
                };
              });
            }}
            receiptFiles={selectedExecutionReceipts}
            isAdvancing={isSelectedOrderAdvancing}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}
