import { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ImageCredentialCard } from '../components/ImageCredentialCard';
import { vehicleRequirementOptions } from '../data/mockData';
import { colors, styles } from '../styles';
import type {
  PlatformDriverAcceptanceSettings,
  PlatformDriverAcceptOrderRequest,
  PlatformDriverAdvanceOrderStatusRequest,
  PlatformDriverIncomeOverview,
  PlatformDriverReplyEvaluationRequest,
  PlatformDriverWithdrawalRecord,
  createPlatformDriverOrderApi,
} from '../services/platformDriverOrderApi';
import type {
  PlatformNavigationTarget,
  createPlatformMapsApi,
} from '../services/platformMapsApi';
import { buildExternalNavigationUrls } from '../utils/mapsNavigation';
import type {
  PlatformDriverCertificationSnapshot,
  createPlatformDriverCertificationApi,
} from '../services/platformDriverCertificationApi';
import { PlatformApiError } from '../services/platformApiClient';
import {
  confirmPlatformFileUploadIntent,
  type PlatformFileUploadConfirmationApi,
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
} from '../utils/orderExceptionCases';
import {
  createAcceptanceSettingsForm,
  createAcceptanceSettingsRequest,
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
  filterDriverOrderHallOrders,
  formatDriverCurrency,
  formatDriverIncomeTime,
  getCertificationStatusText,
  getDriverAcceptanceVehicleTypesText,
  getDriverAdvanceButtonText,
  getDriverExecutionReceiptFileIds,
  getDriverOrderActionFailureNotice,
  getDriverReceiptUploadButtonText,
  getDriverStatusText,
  getDriverWithdrawalStatusText,
  getLatestDriverEvaluationReply,
  getLatestDriverException,
  getLatestDriverShipperEvaluation,
  getNextDriverStatus,
  hasDriverEvaluationSubmitted,
  isDriverEvaluationReplyMissingAccessToken,
  omitDriverEvaluationReplyQueueItem,
  upsertOrder,
  type DriverAcceptanceSettingsFormState,
  type DriverCertificationFileFieldName,
  type DriverCertificationFormState,
  type DriverExceptionFormState,
  type DriverExecutionProofState,
  type DriverOrderFormState,
  type DriverShipperEvaluationFormState,
  type DriverWithdrawalFormState,
} from './driver-home/driverHomeUtils';

type PlatformDriverOrderApi = ReturnType<typeof createPlatformDriverOrderApi>;
type PlatformDriverCertificationApi = ReturnType<
  typeof createPlatformDriverCertificationApi
>;
type DriverPlatformFileApi = PlatformFileUploadConfirmationApi &
  Pick<ReturnType<typeof createPlatformFileApi>, 'createUploadIntent'> &
  Partial<Pick<ReturnType<typeof createPlatformFileApi>, 'getFileMetadata'>>;
type PlatformMapsApi = Pick<
  ReturnType<typeof createPlatformMapsApi>,
  'getDriverNavigationTargets' | 'reportDriverLocation'
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
type DriverExecutionReceiptAttachmentState = Record<
  string,
  {
    transportingReceiptFiles: DriverUploadedFileRef[];
    confirmingReceiptFiles: DriverUploadedFileRef[];
  }
>;

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
        getDriverCertificationSnapshotFileId(certification, fieldName)?.trim() ??
        '';

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

function mergeDriverCertificationAttachments(
  current: DriverCertificationAttachmentMap,
  certification: PlatformDriverCertificationSnapshot,
  hydrated: DriverCertificationAttachmentMap,
) {
  return driverCertificationAttachmentFieldNames.reduce<DriverCertificationAttachmentMap>(
    (result, fieldName) => {
      const fileId =
        getDriverCertificationSnapshotFileId(certification, fieldName)?.trim() ??
        '';

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
  const [orderHallOrders, setOrderHallOrders] = useState<PlatformShipperOrder[]>(
    [],
  );
  const [myOrders, setMyOrders] = useState<PlatformShipperOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PlatformShipperOrder>();
  const [exceptionCases, setExceptionCases] = useState<
    PlatformOrderExceptionCase[]
  >([]);
  const [isLoadingExceptionCases, setIsLoadingExceptionCases] =
    useState(false);
  const [exceptionCaseNotice, setExceptionCaseNotice] = useState<string>();
  const [appealDrafts, setAppealDrafts] = useState<Record<string, string>>({});
  const [appealingCaseId, setAppealingCaseId] = useState<string>();
  const [navigationTargets, setNavigationTargets] = useState<
    PlatformNavigationTarget[]
  >([]);
  const [certification, setCertification] =
    useState<PlatformDriverCertificationSnapshot>();
  const [incomeOverview, setIncomeOverview] =
    useState<PlatformDriverIncomeOverview>();
  const [withdrawals, setWithdrawals] = useState<PlatformDriverWithdrawalRecord[]>(
    [],
  );
  const [acceptanceSettings, setAcceptanceSettings] =
    useState<PlatformDriverAcceptanceSettings>();
  const [acceptanceSettingsForm, setAcceptanceSettingsForm] =
    useState<DriverAcceptanceSettingsFormState>(emptyAcceptanceSettingsForm);
  const [withdrawalForm, setWithdrawalForm] =
    useState<DriverWithdrawalFormState>(emptyWithdrawalForm);
  const withdrawalIdempotencyKeyRef = useRef<string | undefined>(undefined);
  const [certificationForm, setCertificationForm] =
    useState<DriverCertificationFormState>(emptyCertificationForm);
  const [certificationAttachments, setCertificationAttachments] =
    useState<DriverCertificationAttachmentMap>({});
  const [exceptionAttachments, setExceptionAttachments] =
    useState<DriverExceptionAttachmentState>({});
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
  const [evaluationReplyQueue, setEvaluationReplyQueue] = useState<
    DriverEvaluationReplyQueue
  >({});
  const [orderMutationQueue, setOrderMutationQueue] =
    useState<DriverOrderMutationQueue>({});
  const [notice, setNotice] = useState('');

  const applyCertificationSnapshot = (
    snapshot: PlatformDriverCertificationSnapshot,
  ) => {
    setCertification(snapshot);
    setCertificationForm(createDriverCertificationForm(snapshot));

    void buildDriverCertificationAttachments(snapshot, platformFileApi).then(
      hydratedAttachments => {
        setCertificationAttachments(current =>
          mergeDriverCertificationAttachments(
            current,
            snapshot,
            hydratedAttachments,
          ),
        );
      },
    );
  };

  const refreshOrderHall = (
    settingsOverride: PlatformDriverAcceptanceSettings | undefined =
      acceptanceSettings,
  ) => {
    if (!platformDriverOrderApi) {
      setOrderHallOrders([]);
      setNotice('司机订单大厅等待平台 API 配置。');
      return;
    }

    platformDriverOrderApi
      .listOrderHall({ page: 1, pageSize: 20 })
      .then(result => {
        setOrderHallOrders(result.items);
        setNotice(createDriverOrderHallNotice(result.items, settingsOverride));
      })
      .catch(() => {
        setNotice('司机订单大厅刷新失败，请稍后重试。');
      });
  };

  const refreshMyOrders = () => {
    if (!platformDriverOrderApi) {
      setMyOrders([]);
      return;
    }

    platformDriverOrderApi
      .listMyOrders({
        statuses: ['loading', 'transporting', 'confirming'],
        page: 1,
        pageSize: 20,
      })
      .then(result => {
        setMyOrders(result.items);
      })
      .catch(() => {
        setNotice('司机执行订单刷新失败，请稍后重试。');
      });
  };

  const refreshCertification = () => {
    if (!platformDriverCertificationApi) {
      return;
    }

    platformDriverCertificationApi
      .getCertification()
      .then(snapshot => {
        applyCertificationSnapshot(snapshot);
      })
      .catch(() => {
        setNotice('司机认证状态加载失败，请稍后重试。');
      });
  };

  const refreshAcceptanceSettings = () => {
    if (!platformDriverOrderApi) {
      return;
    }

    platformDriverOrderApi
      .getAcceptanceSettings()
      .then(settings => {
        setAcceptanceSettings(settings);
        setAcceptanceSettingsForm(createAcceptanceSettingsForm(settings));
      })
      .catch(() => {
        setNotice('接单设置加载失败，请稍后重试。');
      });
  };

  const refreshIncome = () => {
    if (!platformDriverOrderApi) {
      setIncomeOverview(undefined);
      setWithdrawals([]);
      return;
    }

    platformDriverOrderApi
      .getIncomeOverview()
      .then(result => {
        setIncomeOverview(result);
      })
      .catch(() => {
        setNotice('司机收入加载失败，请稍后重试。');
      });

    platformDriverOrderApi
      .listWithdrawals({ page: 1, pageSize: 5 })
      .then(result => {
        setWithdrawals(Array.isArray(result.items) ? result.items : []);
      })
      .catch(() => {
        setNotice('提现记录加载失败，请稍后重试。');
      });
  };

  useEffect(() => {
    refreshOrderHall();
    refreshMyOrders();
    refreshCertification();
    refreshAcceptanceSettings();
    refreshIncome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformDriverOrderApi, platformDriverCertificationApi, platformFileApi]);

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
      vehicleTypePreferences: current.vehicleTypePreferences.includes(vehicleType)
        ? current.vehicleTypePreferences.filter(item => item !== vehicleType)
        : [...current.vehicleTypePreferences, vehicleType],
    }));
  };

  const upsertOrderMutationQueueItem = (
    item: DriverOrderMutationQueueItem,
  ) => {
    setOrderMutationQueue(currentQueue => {
      const nextQueue = {
        ...currentQueue,
        [createDriverOrderMutationQueueKey(item.operation, item.orderId)]: item,
      };
      saveDriverOrderMutationQueue(resolvedDriverAccountId, nextQueue);
      return nextQueue;
    });
  };

  const removeOrderMutationQueueItem = (
    item: DriverOrderMutationQueueItem,
  ) => {
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
            setMyOrders(currentOrders => upsertOrder(currentOrders, updatedOrder));
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
            currentOrders.filter(currentOrder => currentOrder.id !== item.orderId),
          );
          setMyOrders(currentOrders => upsertOrder(currentOrders, updatedOrder));
          setSelectedOrder(updatedOrder);
          refreshIncome();
          setNotice('接单成功，订单已进入待装货。');
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
      orderMutationQueue[
        createDriverOrderMutationQueueKey('accept', order.id)
      ];

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
    setIsLoadingExceptionCases(true);
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
        setExceptionCases(Array.isArray(result?.items) ? result.items : []);
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
          setNavigationTargets(Array.isArray(result?.targets) ? result.targets : []);
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

  const openDriverNavigation = (target: PlatformNavigationTarget) => {
    const urls = buildExternalNavigationUrls({
      label: target.type === 'pickup' ? '装货点' : '卸货点',
      address: target.address,
      latitude: target.latitude,
      longitude: target.longitude,
    });
    Linking.openURL(urls.geo).catch(() => {
      setNotice('无法打开导航应用，请检查本机是否安装地图 App。');
    });
  };

  const reportSandboxDriverLocation = () => {
    if (!platformMapsApi || !selectedOrder) {
      setNotice('上报位置需要平台 API 配置。');
      return;
    }

    const pickup = navigationTargets.find(item => item.type === 'pickup');
    const latitude = pickup?.latitude ?? 22.6;
    const longitude = pickup?.longitude ?? 113.9;
    platformMapsApi
      .reportDriverLocation({
        latitude,
        longitude,
        orderId: selectedOrder.id,
        source: 'sandbox',
        accuracyMeters: 25,
      })
      .then(() => {
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
          currentCases.map(item =>
            item.id === updatedCase.id ? updatedCase : item,
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
        const isMissingAccessToken = isDriverEvaluationReplyMissingAccessToken(error);

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
        setSelectedOrder(updatedOrder);
        setMyOrders(currentOrders => upsertOrder(currentOrders, updatedOrder));
        setShipperEvaluationForms(currentForms => ({
          ...currentForms,
          [order.orderNo]: emptyShipperEvaluationForm,
        }));
        setNotice('货主评价已提交。');
      })
      .catch(error => {
        if (
          error instanceof PlatformApiError &&
          error.code === 'ORDER_STATE_INVALID'
        ) {
          setNotice('订单完成后才能评价货主。');
          return;
        }

        setNotice('货主评价提交失败，请稍后重试。');
      });
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
        setSelectedOrder(updatedOrder);
        setMyOrders(currentOrders => upsertOrder(currentOrders, updatedOrder));
        setExceptionForms(currentForms => ({
          ...currentForms,
          [order.orderNo]: emptyExceptionForm,
        }));
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
            AUTH_ACCESS_TOKEN_MISSING:
              '登录状态已失效，请重新登录后上报异常。',
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

    try {
      const intent = await platformFileApi.createUploadIntent({
        purpose: 'exception',
        fileName,
        contentType: 'image/png',
        byteSize: 2048,
      });
      const uploadedFile = await confirmPlatformFileUploadIntent(
        platformFileApi,
        intent,
      );

      updateExceptionForm(order.orderNo, {
        photoFileIds: [...currentForm.photoFileIds, uploadedFile.id],
      });
      setExceptionAttachments(current => ({
        ...current,
        [order.orderNo]: [
          ...(current[order.orderNo] ?? []),
          {
            file: uploadedFile,
            fileName,
          },
        ],
      }));
      setNotice('异常凭证已关联平台文件。');
    } catch {
      setNotice('异常凭证上传失败，请稍后重试。');
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

    try {
      const intent = await platformFileApi.createUploadIntent({
        purpose: 'receipt',
        fileName,
        contentType: 'image/png',
        byteSize: 2048,
      });
      const uploadedFile = await confirmPlatformFileUploadIntent(
        platformFileApi,
        intent,
      );

      setExecutionProofs(current => ({
        ...current,
        [order.id]: isLoadingProof
          ? {
              transportingReceiptFileIds: [uploadedFile.id],
              confirmingReceiptFileIds:
                current[order.id]?.confirmingReceiptFileIds ?? [],
            }
          : {
              transportingReceiptFileIds:
                current[order.id]?.transportingReceiptFileIds ?? [],
              confirmingReceiptFileIds: [uploadedFile.id],
            },
      }));
      setExecutionReceiptAttachments(current => ({
        ...current,
        [order.id]: isLoadingProof
          ? {
              transportingReceiptFiles: [
                {
                  file: uploadedFile,
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
                  file: uploadedFile,
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
    } catch {
      setNotice(
        isLoadingProof
          ? '装货凭证上传失败，请稍后重试。'
          : '到达凭证上传失败，请稍后重试。',
      );
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

  const submitWithdrawal = () => {
    if (!platformDriverOrderApi) {
      setNotice('司机提现需要平台 API 配置。');
      return;
    }

    if (!incomeOverview) {
      setNotice('司机收入还在加载，请稍后再试。');
      return;
    }

    const request = createDriverWithdrawalRequest(withdrawalForm);

    if (!request) {
      setNotice('请填写有效提现金额、开户银行、收款人姓名和银行卡号。');
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
        withdrawalIdempotencyKeyRef.current = undefined;
        setWithdrawalForm(emptyWithdrawalForm);
        setNotice('提现申请已提交审核。');
        refreshIncome();
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

  const visibleOrders = filterDriverOrderHallOrders(
    orderHallOrders,
    acceptanceSettings,
  );
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
  const selectedEvaluationReplyQueueItem = selectedOrder
    ? evaluationReplyQueue[selectedOrder.id]
    : undefined;
  const incomeRecords = Array.isArray(incomeOverview?.records)
    ? incomeOverview.records
    : [];
  const withdrawalRecords = Array.isArray(withdrawals) ? withdrawals : [];

  const uploadCertificationFile = async (
    fieldName: DriverCertificationFileFieldName,
  ) => {
    if (!platformFileApi) {
      setNotice('认证附件上传需要平台文件 API 配置。');
      return;
    }

    const uploadConfig = driverCertificationFileUploadConfigs[fieldName];

    try {
      const intent = await platformFileApi.createUploadIntent({
        purpose: 'identity',
        fileName: uploadConfig.fileName,
        contentType: 'image/png',
        byteSize: 2048,
      });
      const uploadedFile = await confirmPlatformFileUploadIntent(
        platformFileApi,
        intent,
      );

      setCertificationForm(current => ({
        ...current,
        [fieldName]: uploadedFile.id,
      }));
      setCertificationAttachments(current => ({
        ...current,
        [fieldName]: {
          ...createDriverUploadedFileRef(uploadedFile, uploadConfig.fileName),
        },
      }));
      setNotice(uploadConfig.successNotice);
    } catch {
      setNotice(uploadConfig.failureNotice);
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
  const selectedExecutionReceiptAttachmentRefs = selectedOrder
    ? selectedOrder.status === 'loading'
      ? executionReceiptAttachments[selectedOrder.id]?.transportingReceiptFiles ??
        []
      : selectedOrder.status === 'transporting'
        ? executionReceiptAttachments[selectedOrder.id]?.confirmingReceiptFiles ??
          []
      : []
    : [];
  const selectedExecutionReceiptLabel = selectedOrder
    ? selectedOrder.status === 'loading'
      ? '装货凭证'
      : selectedOrder.status === 'transporting'
        ? '到达凭证'
        : '执行凭证'
    : '执行凭证';
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

      <Pressable
        testID="driver-refresh-orders"
        style={styles.detailPrimaryButton}
        onPress={() => {
          refreshOrderHall();
          refreshMyOrders();
          refreshAcceptanceSettings();
          refreshIncome();
        }}
      >
        <Text style={styles.detailPrimaryButtonText}>刷新订单</Text>
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
                {`原始版本：${item.mutationContext.baseUpdatedAtIso}`}
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
        <Text testID="driver-settings-vehicle-types-summary" style={styles.detailMeta}>
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
          当前先保存范围设置，待地图坐标接入后用于附近单过滤。
        </Text>
        {vehicleRequirementOptions.map(option => {
          const selected = acceptanceSettingsForm.vehicleTypePreferences.includes(
            option.id,
          );

          return (
            <Pressable
              key={option.id}
              testID={`driver-settings-vehicle-type-${option.id}`}
              style={styles.detailSecondaryButton}
              onPress={() => toggleAcceptanceVehicleType(option.id)}
            >
              <Text style={styles.detailSecondaryButtonText}>
                {selected ? `已选车型：${option.label}` : `车型：${option.label}`}
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
        <Text style={styles.detailMeta}>
          {`已完成 ${incomeOverview?.summary?.completedOrderCount ?? 0} 单`}
        </Text>
        {incomeRecords.length ? (
          incomeRecords.slice(0, 3).map(record => (
            <View key={record.orderId} style={styles.detailInlineGroup}>
              <Text style={styles.detailRoute}>{record.routeText}</Text>
              <Text style={styles.detailMeta}>
                {`${record.orderNo} · ${formatDriverIncomeTime(
                  record.completedAtIso,
                )}`}
              </Text>
              <Text style={styles.detailMeta}>
                {`司机净收入 ${formatDriverCurrency(
                  record.netIncomeCents,
                )} · 平台服务费 ${formatDriverCurrency(
                  record.platformFeeCents,
                )}`}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.detailMeta}>暂无已完成收入记录。</Text>
        )}
        <TextInput
          testID="driver-withdrawal-amount"
          style={styles.ordersSearchInput}
          placeholder="提现金额，例如 120"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          value={withdrawalForm.amountText}
          onChangeText={amountText => {
            withdrawalIdempotencyKeyRef.current = undefined;
            setWithdrawalForm(current => ({ ...current, amountText }))
          }}
        />
        <TextInput
          testID="driver-withdrawal-bank-name"
          style={styles.ordersSearchInput}
          placeholder="开户银行"
          placeholderTextColor={colors.textMuted}
          value={withdrawalForm.bankName}
          onChangeText={bankName => {
            withdrawalIdempotencyKeyRef.current = undefined;
            setWithdrawalForm(current => ({ ...current, bankName }))
          }}
        />
        <TextInput
          testID="driver-withdrawal-bank-account-name"
          style={styles.ordersSearchInput}
          placeholder="收款人姓名"
          placeholderTextColor={colors.textMuted}
          value={withdrawalForm.bankAccountName}
          onChangeText={bankAccountName => {
            withdrawalIdempotencyKeyRef.current = undefined;
            setWithdrawalForm(current => ({ ...current, bankAccountName }))
          }}
        />
        <TextInput
          testID="driver-withdrawal-bank-account-no"
          style={styles.ordersSearchInput}
          placeholder="银行卡号"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          value={withdrawalForm.bankAccountNo}
          onChangeText={bankAccountNo => {
            withdrawalIdempotencyKeyRef.current = undefined;
            setWithdrawalForm(current => ({ ...current, bankAccountNo }))
          }}
        />
        <Pressable
          testID="driver-withdrawal-submit"
          style={styles.detailPrimaryButton}
          onPress={submitWithdrawal}
        >
          <Text style={styles.detailPrimaryButtonText}>提交提现申请</Text>
        </Pressable>
        <Text style={styles.detailMeta}>最近提现记录</Text>
        {withdrawalRecords.length ? (
          withdrawalRecords.map(withdrawal => (
            <View key={withdrawal.id} style={styles.detailInlineGroup}>
              <Text style={styles.detailRoute}>
                {`${withdrawal.bankName} · ${withdrawal.bankAccountMasked}`}
              </Text>
              <Text style={styles.detailMeta}>
                {`${formatDriverCurrency(withdrawal.amountCents)} · ${getDriverWithdrawalStatusText(
                  withdrawal.status,
                )}`}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.detailMeta}>暂无提现记录。</Text>
        )}
      </View>

      <View style={styles.detailCard}>
        <Text testID="driver-certification-title" style={styles.detailRoute}>
          司机认证
        </Text>
        <Text testID="driver-identity-status" style={styles.detailMeta}>
          {`实名认证：${getCertificationStatusText(certification?.identity?.status)}`}
        </Text>
        <Text testID="driver-vehicle-status" style={styles.detailMeta}>
          {`车辆认证：${getCertificationStatusText(certification?.vehicle?.status)}`}
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
            uploadCertificationFile('identityFrontFileId').catch(() => undefined);
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
            uploadCertificationFile('identityBackFileId').catch(() => undefined);
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
            title={
              entry.fileId
                ? `${entry.label}：${
                    entry.source === 'file-object'
                      ? entry.attachmentRef?.fileName ?? '已关联平台文件对象'
                      : entry.source === 'snapshot'
                        ? '平台已同步文件 ID'
                        : '本地已填写文件 ID'
                  }`
                : `${entry.label}：待上传占位`
            }
            publicUrl={entry.attachmentRef?.file.publicUrl}
            placeholderLabel={entry.label}
            metaLines={createCertificationAttachmentMetaLines(entry)}
            imageTestID={`driver-cert-preview-image-${entry.fieldName}`}
            placeholderTestID={`driver-cert-preview-placeholder-${entry.fieldName}`}
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
            uploadCertificationFile('drivingLicenseFileId').catch(() => undefined);
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
            uploadCertificationFile('driverLicenseFileId').catch(() => undefined);
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
            uploadCertificationFile('vehiclePhotoFileId').catch(() => undefined);
          }}
        >
          <Text style={styles.detailSecondaryButtonText}>上传车辆照片</Text>
        </Pressable>
        <Text style={styles.routeMeta}>
          车辆资料上传后会自动回填文件 ID；如已存在平台附件，也可手动填写已有文件 ID。
        </Text>
        <Text style={styles.draftSectionTitle}>车辆认证附件</Text>
        {vehicleAttachmentEntries.map(entry => (
          <ImageCredentialCard
            key={entry.fieldName}
            title={
              entry.fileId
                ? `${entry.label}：${
                    entry.source === 'file-object'
                      ? entry.attachmentRef?.fileName ?? '已关联平台文件对象'
                      : entry.source === 'snapshot'
                        ? '平台已同步文件 ID'
                        : '本地已填写文件 ID'
                  }`
                : `${entry.label}：待上传占位`
            }
            publicUrl={entry.attachmentRef?.file.publicUrl}
            placeholderLabel={entry.label}
            metaLines={createCertificationAttachmentMetaLines(entry)}
            imageTestID={`driver-cert-preview-image-${entry.fieldName}`}
            placeholderTestID={`driver-cert-preview-placeholder-${entry.fieldName}`}
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

      {visibleOrders.map(order => {
        const form = getForm(order.orderNo);
        const latestExceptionCaseHeadline =
          order.latestExceptionCase
            ? getOrderExceptionCaseSummaryHeadline(order.latestExceptionCase)
            : undefined;
        const latestExceptionCaseDetail =
          order.latestExceptionCase
            ? getOrderExceptionCaseSummaryText(order.latestExceptionCase)
            : undefined;

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
              onChangeText={quoteText => updateForm(order.orderNo, { quoteText })}
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
              onChangeText={noteText => updateForm(order.orderNo, { noteText })}
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
      })}

      <View style={styles.detailCard}>
        <Text testID="driver-my-orders-title" style={styles.detailRoute}>
          我的执行订单
        </Text>
        <Text style={styles.detailMeta}>
          展示已接单、运输中和待货主确认订单
        </Text>
        {myOrders.length === 0 ? (
          <Text style={styles.detailMeta}>暂无执行中的订单。</Text>
        ) : null}
        {myOrders.map(order => {
          const latestExceptionCaseHeadline =
            order.latestExceptionCase
              ? getOrderExceptionCaseSummaryHeadline(order.latestExceptionCase)
              : undefined;
          const latestExceptionCaseDetail =
            order.latestExceptionCase
              ? getOrderExceptionCaseSummaryText(order.latestExceptionCase)
              : undefined;

          return (
            <View
              key={order.id}
              testID={`driver-my-order-card-${order.orderNo}`}
              style={styles.detailInlineGroup}
            >
              <Text style={styles.detailRoute}>
                {order.pickupAddress} → {order.deliveryAddress}
              </Text>
              <Text style={styles.detailMeta}>
                {order.orderNo} · {getDriverStatusText(order.status)}
              </Text>
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
        })}
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
            {selectedOrder.orderNo} · {getDriverStatusText(selectedOrder.status)}
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
          {navigationTargets.length > 0 ? (
            <View style={styles.detailInlineGroup}>
              <Text style={styles.draftSectionTitle}>导航与位置</Text>
              {navigationTargets.map(target => (
                <Pressable
                  key={`${target.type}-${target.address}`}
                  testID={`driver-navigate-${target.type}-${selectedOrder.orderNo}`}
                  style={styles.detailSecondaryButton}
                  onPress={() => openDriverNavigation(target)}
                >
                  <Text style={styles.detailSecondaryButtonText}>
                    外跳导航到{target.type === 'pickup' ? '装货点' : '卸货点'}
                  </Text>
                </Pressable>
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
          <Text style={styles.detailMeta}>
            事件记录：{selectedOrder.events?.length ?? 0} 条
          </Text>
          {latestDriverException?.noteText ? (
            <Text style={styles.detailMeta}>
              最新异常：{latestDriverException.noteText}
            </Text>
          ) : null}
          <ExceptionCaseProgressPanel
            cases={exceptionCases}
            isLoading={isLoadingExceptionCases}
            notice={exceptionCaseNotice}
            appealDrafts={appealDrafts}
            appealingCaseId={appealingCaseId}
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
                <Text style={styles.detailSecondaryButtonText}>上传异常凭证</Text>
              </Pressable>
              {selectedExceptionAttachmentRefs.length > 0 ? (
                <View>
                  <Text style={styles.draftSectionTitle}>异常凭证清单</Text>
                  {selectedExceptionAttachmentRefs.map((attachmentRef, index) => (
                    <ImageCredentialCard
                      key={`${attachmentRef.file.id}-${index}`}
                      title={`异常凭证 ${index + 1}：${attachmentRef.fileName}`}
                      publicUrl={attachmentRef.file.publicUrl}
                      placeholderLabel={`异常凭证 ${index + 1}`}
                      metaLines={createUploadedAttachmentMetaLines(attachmentRef)}
                      imageTestID={`driver-exception-preview-image-${index + 1}`}
                      placeholderTestID={
                        `driver-exception-preview-placeholder-${index + 1}`
                      }
                    />
                  ))}
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
                <Text style={styles.detailSecondaryButtonText}>提交评价回复</Text>
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
              <TextInput
                testID={`driver-shipper-evaluation-rating-${selectedOrder.orderNo}`}
                style={styles.ordersSearchInput}
                placeholder="给货主评分，1-5"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={
                  (shipperEvaluationForms[selectedOrder.orderNo] ??
                    emptyShipperEvaluationForm).ratingText
                }
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
                value={
                  (shipperEvaluationForms[selectedOrder.orderNo] ??
                    emptyShipperEvaluationForm).tagsText
                }
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
                value={
                  (shipperEvaluationForms[selectedOrder.orderNo] ??
                    emptyShipperEvaluationForm).content
                }
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
                  const currentForm =
                    shipperEvaluationForms[selectedOrder.orderNo] ??
                    emptyShipperEvaluationForm;
                  updateShipperEvaluationForm(selectedOrder.orderNo, {
                    anonymous: !currentForm.anonymous,
                  });
                }}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  匿名：{(shipperEvaluationForms[selectedOrder.orderNo] ??
                    emptyShipperEvaluationForm).anonymous
                    ? '是'
                    : '否'}
                </Text>
              </Pressable>
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
                <Text style={styles.detailSecondaryButtonText}>重试评价回复</Text>
              </Pressable>
            </View>
          ) : null}
          <Text style={styles.detailMeta}>
            已关联凭证：
            {
              getDriverExecutionReceiptFileIds(
                executionProofs,
                selectedOrder.id,
                selectedOrder.status,
              ).length
            }{' '}
            张
          </Text>
          {selectedExecutionReceiptAttachmentRefs.length > 0 ? (
            <View>
              <Text style={styles.draftSectionTitle}>
                {selectedExecutionReceiptLabel}清单
              </Text>
              {selectedExecutionReceiptAttachmentRefs.map(
                (attachmentRef, index) => (
                  <ImageCredentialCard
                    key={`${attachmentRef.file.id}-${index}`}
                    title={
                      `${selectedExecutionReceiptLabel} ${index + 1}：${attachmentRef.fileName}`
                    }
                    publicUrl={attachmentRef.file.publicUrl}
                    placeholderLabel={selectedExecutionReceiptLabel}
                    metaLines={createUploadedAttachmentMetaLines(attachmentRef)}
                    imageTestID={`driver-receipt-preview-image-${index + 1}`}
                    placeholderTestID={
                      `driver-receipt-preview-placeholder-${index + 1}`
                    }
                  />
                ),
              )}
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
        </View>
      ) : null}
    </ScrollView>
  );
}
