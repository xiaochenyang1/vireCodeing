import { Clipboard, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';

import { showUnavailable } from '../components/SectionHeader';
import {
  recentOrderStatusCopy,
} from '../data/mockData';
import { styles } from '../styles';
import { BonusForm } from './order-detail/BonusForm';
import { CancellationForm } from './order-detail/CancellationForm';
import { ChangeRequestForm } from './order-detail/ChangeRequestForm';
import { DriverEvaluationForm } from './order-detail/DriverEvaluationForm';
import { DriverInfoCard } from './order-detail/DriverInfoCard';
import { DriverQuoteCard } from './order-detail/DriverQuoteCard';
import { ExceptionReportForm } from './order-detail/ExceptionReportForm';
import { ExceptionCaseProgressPanel } from './order-detail/ExceptionCaseProgressPanel';
import {
  OrderActionsCard,
  OrderProgressActionCard,
} from './order-detail/OrderActionCards';
import { OrderCargoContactCard } from './order-detail/OrderCargoContactCard';
import {
  CancellationRecordCard,
  EvaluationRecordCard,
  ExceptionRecordCard,
  ModificationRequestRecordCard,
} from './order-detail/OrderRecordCards';
import { OrderSyncStatusCard } from './order-detail/OrderSyncStatusCard';
import { PaymentStatusCard } from './order-detail/PaymentStatusCard';
import { TrackingCard } from './order-detail/TrackingCard';
import { useOrderDetailPanels } from './order-detail/useOrderDetailPanels';
import type {
  DraftOrderPrefill,
  FileAttachmentRef,
  DriverQuote,
  RecentOrder,
} from '../types';
import type { createPlatformFileApi } from '../services/platformFileApi';
import type {
  createPlatformPaymentApi,
  PlatformPaymentChannel,
  PlatformPaymentRecord,
  PlatformPaymentSdk,
} from '../services/platformPaymentApi';
import type { createPlatformMapsApi } from '../services/platformMapsApi';
import { PlatformApiError } from '../services/platformApiClient';
import type {
  createPlatformOrderApi,
  PlatformOrderExceptionCase,
} from '../services/platformOrderApi';
import {
  createFailedOrderSyncState,
  createPrefillFromOrder,
  createSyncedOrderSyncState,
  formatVehicleRequirementText,
} from '../utils/order';
import {
  buildDetailTimeline,
  createBonusOrderChange,
  createChangeRequestOrderChange,
  createDriverQuoteOrderChange,
  createEvaluationNotice,
  createExceptionReportOrderChange,
  getCancellationSettlement,
  getOrderPrimaryActionLabel,
  getOrderProgressAction,
  getOrderSecondaryActionLabel,
  type OrderProgressAction,
} from '../utils/orderDetail';
import {
  continuePlatformPayment,
  createPaymentIdempotencyKey,
  executePlatformPayment,
} from '../utils/payment';

export function OrderDetailScreen({
  orderId,
  now,
  orders,
  onBack,
  onUpdateOrder,
  onReorder,
  onEditOrder,
  onRetryOrderSync,
  onCancelOrder,
  onCompleteOrder,
  onAdvanceOrderStatus,
  onReportException,
  onSubmitChangeRequest,
  onSubmitEvaluation,
  platformFileApi,
  platformOrderApi,
  platformPaymentApi,
  platformMapsApi,
  platformPaymentSdk,
}: {
  orderId: string;
  now: number;
  orders: RecentOrder[];
  onBack: () => void;
  onUpdateOrder: (orderId: string, changes: Partial<RecentOrder>) => void;
  onReorder: (prefill: DraftOrderPrefill) => void;
  onEditOrder: (order: RecentOrder) => void;
  onRetryOrderSync?: (order: RecentOrder) => void;
  onCancelOrder?: (
    order: RecentOrder,
    cancellation: NonNullable<RecentOrder['cancellation']>,
  ) => void;
  onCompleteOrder?: (order: RecentOrder) => void;
  onAdvanceOrderStatus?: (
    order: RecentOrder,
    progressAction: OrderProgressAction,
  ) => void;
  onReportException?: (
    order: RecentOrder,
    exceptionReport: NonNullable<RecentOrder['exceptionReport']>,
  ) => void;
  onSubmitChangeRequest?: (
    order: RecentOrder,
    modificationRequest: NonNullable<RecentOrder['modificationRequest']>,
  ) => void;
  onSubmitEvaluation?: (
    order: RecentOrder,
    evaluation: NonNullable<RecentOrder['evaluation']>,
  ) => void;
  platformFileApi?: Pick<
    ReturnType<typeof createPlatformFileApi>,
    'createUploadIntent' | 'confirmUploaded' | 'confirmLocalUploadTarget'
  >;
  platformOrderApi?: Pick<
    ReturnType<typeof createPlatformOrderApi>,
    'listExceptionCases' | 'appealExceptionCase'
  >;
  platformPaymentApi?: Pick<
    ReturnType<typeof createPlatformPaymentApi>,
    'createPayment' | 'getLatestPayment'
  >;
  platformMapsApi?: Pick<
    ReturnType<typeof createPlatformMapsApi>,
    'getShipperDriverLocation'
  > &
    Partial<
      Pick<ReturnType<typeof createPlatformMapsApi>, 'reverseGeocode'>
    >;
  platformPaymentSdk?: PlatformPaymentSdk;
}) {
  const order = orders.find(item => item.id === orderId) ?? orders[0];
  const status = recentOrderStatusCopy[order.status];
  const usesPlatformOrderActions = Boolean(
    platformOrderApi && order.platformOrderId,
  );
  const progressAction = getOrderProgressAction(
    order.status,
    usesPlatformOrderActions,
  );
  const vehicleRequirementText = formatVehicleRequirementText(order);
  const [exceptionCases, setExceptionCases] = useState<
    PlatformOrderExceptionCase[]
  >([]);
  const [isLoadingExceptionCases, setIsLoadingExceptionCases] =
    useState(false);
  const [exceptionCaseNotice, setExceptionCaseNotice] = useState<string>();
  const [appealDrafts, setAppealDrafts] = useState<Record<string, string>>({});
  const [appealingCaseId, setAppealingCaseId] = useState<string>();
  const [payment, setPayment] = useState<PlatformPaymentRecord>();
  const [paymentChannel, setPaymentChannel] =
    useState<PlatformPaymentChannel>('wechat');
  const [isPaymentBusy, setIsPaymentBusy] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<string>();
  const latestOrderRef = useRef(order);
  const latestOnUpdateOrderRef = useRef(onUpdateOrder);

  useEffect(() => {
    latestOrderRef.current = order;
    latestOnUpdateOrderRef.current = onUpdateOrder;
  }, [order, onUpdateOrder]);

  useEffect(() => {
    if (!platformOrderApi || !order.platformOrderId) {
      setExceptionCases([]);
      setExceptionCaseNotice(undefined);
      setIsLoadingExceptionCases(false);
      setAppealDrafts({});
      setAppealingCaseId(undefined);
      return;
    }

    let active = true;
    setExceptionCases([]);
    setExceptionCaseNotice(undefined);
    setAppealDrafts({});
    setAppealingCaseId(undefined);
    setIsLoadingExceptionCases(true);
    platformOrderApi
      .listExceptionCases(order.platformOrderId)
      .then(result => {
        if (active) {
          setExceptionCases(Array.isArray(result?.items) ? result.items : []);
        }
      })
      .catch(error => {
        if (!active) {
          return;
        }

        setExceptionCaseNotice(
          error instanceof PlatformApiError &&
            error.code === 'AUTH_ACCESS_TOKEN_MISSING'
            ? '登录状态已失效，请重新登录后查看异常处理进度。'
            : '异常处理进度加载失败，请稍后重试。',
        );
      })
      .finally(() => {
        if (active) {
          setIsLoadingExceptionCases(false);
        }
      });

    return () => {
      active = false;
    };
  }, [order.platformOrderId, platformOrderApi]);

  const submitExceptionCaseAppeal = (
    exceptionCase: PlatformOrderExceptionCase,
  ) => {
    if (!platformOrderApi || !order.platformOrderId) {
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
    platformOrderApi
      .appealExceptionCase(order.platformOrderId, exceptionCase.id, {
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

  useEffect(() => {
    if (
      order.paymentMethod !== 'online' ||
      !order.platformOrderId ||
      !platformPaymentApi
    ) {
      setPayment(undefined);
      setPaymentNotice(undefined);
      setIsPaymentBusy(false);
      return;
    }

    let active = true;
    setPayment(undefined);
    setPaymentNotice(undefined);
    setIsPaymentBusy(true);
    platformPaymentApi
      .getLatestPayment(order.platformOrderId)
      .then(latestPayment => {
        if (!active) {
          return;
        }
        applyPaymentSnapshot({
          order: latestOrderRef.current,
          latestPayment,
          onUpdateOrder: latestOnUpdateOrderRef.current,
          setPayment,
          setPaymentChannel,
        });
      })
      .catch(error => {
        if (!active) {
          return;
        }
        setPaymentNotice(
          error instanceof PlatformApiError &&
            error.code === 'PAYMENT_ORDER_NOT_AVAILABLE'
            ? '暂未创建支付单，可选择渠道后支付。'
            : '支付状态加载失败，可稍后刷新重试。',
        );
      })
      .finally(() => {
        if (active) {
          setIsPaymentBusy(false);
        }
      });

    return () => {
      active = false;
    };
  }, [order.paymentMethod, order.platformOrderId, platformPaymentApi]);
  const { isPanelOpen, closeAllPanels, togglePanel } = useOrderDetailPanels();
  const [localNotice, setLocalNotice] = useState('');
  const driverQuotes = order.driverQuotes ?? [];
  const canRequestChange =
    order.status === 'loading' ||
    order.status === 'transporting' ||
    order.status === 'confirming';
  const syncState = order.syncState;
  const openSystemDialer = (phone: string, targetLabel: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {
      setLocalNotice(`无法打开系统拨号，请手动联系${targetLabel}。`);
    });
  };
  const timeline = buildDetailTimeline(status.label);
  const updateOrderFromDetail = (changes: Partial<RecentOrder>) => {
    onUpdateOrder(order.id, {
      ...changes,
      updatedAtIso: new Date(now).toISOString(),
    });
  };

  const refreshPaymentStatus = async () => {
    if (!order.platformOrderId) {
      setPaymentNotice('当前订单还未同步到平台，暂不能刷新支付状态。');
      return;
    }

    if (!platformPaymentApi) {
      setPaymentNotice('当前订单尚未连接平台支付服务。');
      return;
    }

    setIsPaymentBusy(true);
    setPaymentNotice(undefined);
    try {
      applyPaymentSnapshot({
        order,
        latestPayment: await platformPaymentApi.getLatestPayment(
          order.platformOrderId,
        ),
        onUpdateOrder,
        setPayment,
        setPaymentChannel,
      });
    } catch {
      setPaymentNotice('支付状态刷新失败，请稍后重试。');
    } finally {
      setIsPaymentBusy(false);
    }
  };

  const submitPlatformPayment = async () => {
    if (!order.platformOrderId) {
      setPaymentNotice('当前订单还未同步到平台，暂不能发起在线支付。');
      return;
    }

    if (!platformPaymentApi) {
      setPaymentNotice('当前订单尚未连接平台支付服务。');
      return;
    }

    if (!platformPaymentSdk) {
      setPaymentNotice('当前客户端未配置可用的原生支付能力。');
      return;
    }

    setIsPaymentBusy(true);
    setPaymentNotice(undefined);
    try {
      const hasActivePayment =
        payment?.status === 'pending' || payment?.status === 'processing';
      const result = hasActivePayment
        ? await continuePlatformPayment({
            api: platformPaymentApi,
            sdk: platformPaymentSdk,
            payment,
            channel: paymentChannel,
          })
        : await executePlatformPayment({
            api: platformPaymentApi,
            sdk: platformPaymentSdk,
            orderId: order.platformOrderId,
            channel: paymentChannel,
            idempotencyKey: createPaymentIdempotencyKey(),
          });

      applyPaymentSnapshot({
        order,
        latestPayment: result.payment,
        onUpdateOrder,
        setPayment,
        setPaymentChannel,
      });
      if (
        (result.status === 'cancelled' ||
          result.status === 'sdk-cancelled') &&
        (result.payment.status === 'pending' ||
          result.payment.status === 'processing')
      ) {
        setPaymentNotice('已取消支付，可稍后继续。');
      } else if (result.status === 'sdk-failed') {
        setPaymentNotice(result.message ?? '支付客户端调用失败，请稍后重试。');
      } else if (result.status === 'pending') {
        setPaymentNotice('支付结果仍在服务端确认，可稍后刷新状态。');
      }
    } catch (error) {
      setPaymentNotice(getPaymentFailureNotice(error));
    } finally {
      setIsPaymentBusy(false);
    }
  };

  const primaryAction = getOrderPrimaryActionLabel(order);
  const secondaryAction = getOrderSecondaryActionLabel(order);

  const runProgressAction = () => {
    if (!progressAction) {
      return;
    }

    if (progressAction.nextStatus === 'completed') {
      if (onCompleteOrder) {
        onCompleteOrder(order);
        setLocalNotice(progressAction.noticeText ?? '');
        return;
      }

      updateOrderFromDetail({
        status: progressAction.nextStatus,
        updatedAtText: progressAction.updatedAtText,
      });
      setLocalNotice(progressAction.noticeText ?? '');
      return;
    }

    if (onAdvanceOrderStatus) {
      onAdvanceOrderStatus(order, progressAction);
      setLocalNotice(progressAction.noticeText ?? '');
      return;
    }

    updateOrderFromDetail({
      status: progressAction.nextStatus,
      updatedAtText: progressAction.updatedAtText,
    });
    setLocalNotice(progressAction.noticeText ?? '');
  };

  const selectDriverQuote = (quote: DriverQuote) => {
    const selection = createDriverQuoteOrderChange(quote);

    updateOrderFromDetail(selection.changes);
    closeAllPanels();
    setLocalNotice(selection.noticeText);
  };

  const runPrimaryAction = () => {
    if (order.status === 'waiting') {
      togglePanel('quotes');
      setLocalNotice('');
      return;
    }

    if (order.status === 'confirming') {
      if (onCompleteOrder) {
        onCompleteOrder(order);
        setLocalNotice(
          usesPlatformOrderActions
            ? '正在确认送达并同步平台订单。'
            : '已确认送达，当前本地订单已完成。',
        );
        return;
      }

      updateOrderFromDetail({
        status: 'completed',
        updatedAtText: '订单已完成 · 刚刚',
      });
      setLocalNotice('已确认送达，当前本地订单已完成。');
      return;
    }

    if (order.status === 'completed' && order.evaluation) {
      closeAllPanels();
      setLocalNotice('评价已提交，不可修改。');
      return;
    }

    if (order.status === 'completed') {
      togglePanel('evaluation');
      setLocalNotice('');
      return;
    }

    if (order.status === 'transporting' && order.driverInfo) {
      togglePanel('tracking');
      setLocalNotice('');
      return;
    }

    if (order.status === 'loading' && order.driverInfo) {
      openSystemDialer(order.driverInfo.driverPhone, '司机');
      setLocalNotice(
        `正在联系司机：${order.driverInfo.driverName} ${order.driverInfo.driverPhone}`,
      );
      return;
    }

    showUnavailable(primaryAction);
  };

  const callOrderContact = (
    contactType: '装货联系人' | '卸货联系人',
    contactName?: string,
    phone?: string,
  ) => {
    if (!phone) {
      setLocalNotice(`${contactType}电话待补充。`);
      return;
    }

    openSystemDialer(phone, contactType);
    setLocalNotice(`正在联系${contactType}：${contactName ?? '待补充'} ${phone}`);
  };

  const runSecondaryAction = () => {
    if (
      order.paymentStatus === 'refund_pending' ||
      payment?.status === 'refund_pending'
    ) {
      closeAllPanels();
      setLocalNotice('退款处理中，请勿重复取消订单。');
      return;
    }

    if (order.status === 'waiting' || order.status === 'loading') {
      togglePanel('cancellation');
      setLocalNotice('');
      return;
    }

    if (order.status === 'transporting' || order.status === 'confirming') {
      togglePanel('exception');
      setLocalNotice('');
      return;
    }

    onReorder(createPrefillFromOrder(order, now));
  };

  const retryOrderSync = () => {
    if (onRetryOrderSync) {
      onRetryOrderSync(order);
      setLocalNotice('正在重放订单同步请求。');
      return;
    }

    updateOrderFromDetail({
      syncState: createSyncedOrderSyncState(undefined, 'local', now),
    });
    setLocalNotice('订单同步已在本地标记为已同步，等待平台订单同步。');
  };

  const markOrderSyncFailed = () => {
    updateOrderFromDetail({
      syncState: createFailedOrderSyncState(undefined, 'local', now),
    });
    setLocalNotice('订单同步已在本地标记失败，已保留本地订单队列。');
  };

  const submitCancellation = (cancellation: {
    reasonText: string;
    description: string;
  }) => {
    const cancellationSettlement = getCancellationSettlement(
      order.status,
      usesPlatformOrderActions,
    );
    const cancellationRecord = {
      ...cancellation,
      ...cancellationSettlement,
    };

    if (onCancelOrder) {
      onCancelOrder(order, cancellationRecord);
      closeAllPanels();
      setLocalNotice(`订单已取消：${cancellation.reasonText}`);
      return;
    }

    updateOrderFromDetail({
      status: 'cancelled',
      updatedAtText: '已取消 · 刚刚',
      cancellation: cancellationRecord,
    });
    closeAllPanels();
    setLocalNotice(`订单已取消：${cancellation.reasonText}`);
  };

  const submitBonus = (bonusAmount: string) => {
    const bonusChange = createBonusOrderChange(bonusAmount, order.bonusText);

    updateOrderFromDetail(bonusChange.changes);
    closeAllPanels();
    setLocalNotice(bonusChange.noticeText);
  };

  const submitExceptionReport = (report: {
    typeLabel: string;
    description: string;
    photoCount?: number;
    photoFiles?: FileAttachmentRef[];
  }) => {
    const exceptionChange = createExceptionReportOrderChange(report);

    if (onReportException) {
      onReportException(
        order,
        exceptionChange.changes.exceptionReport as NonNullable<
          RecentOrder['exceptionReport']
        >,
      );
      closeAllPanels();
      setLocalNotice(exceptionChange.noticeText);
      return;
    }

    updateOrderFromDetail(exceptionChange.changes);
    closeAllPanels();
    setLocalNotice(exceptionChange.noticeText);
  };

  const submitChangeRequest = (description: string) => {
    const changeRequest = createChangeRequestOrderChange(
      description,
      usesPlatformOrderActions,
    );

    if (onSubmitChangeRequest) {
      onSubmitChangeRequest(
        order,
        changeRequest.changes.modificationRequest as NonNullable<
          RecentOrder['modificationRequest']
        >,
      );
      closeAllPanels();
      setLocalNotice(changeRequest.noticeText);
      return;
    }

    updateOrderFromDetail(changeRequest.changes);
    closeAllPanels();
    setLocalNotice(changeRequest.noticeText);
  };

  const updateChangeRequestReview = (
    statusText: string,
    reviewResultText: string,
  ) => {
    if (!order.modificationRequest) {
      return;
    }

    updateOrderFromDetail({
      modificationRequest: {
        ...order.modificationRequest,
        statusText,
        reviewResultText,
      },
    });
    setLocalNotice(reviewResultText);
  };

  const resolveExceptionReport = () => {
    if (!order.exceptionReport) {
      return;
    }

    updateOrderFromDetail({
      exceptionReport: {
        ...order.exceptionReport,
        statusText: '已处理',
      },
    });
    setLocalNotice('异常处理状态已更新：已处理');
  };

  const submitEvaluation = (evaluation: {
    rating: number;
    tags: string[];
    content: string;
    anonymous?: boolean;
    photoCount?: number;
    photoFiles?: FileAttachmentRef[];
  }) => {
    if (onSubmitEvaluation) {
      onSubmitEvaluation(order, evaluation);
      closeAllPanels();
      setLocalNotice(createEvaluationNotice(evaluation));
      return;
    }

    updateOrderFromDetail({
      evaluation,
    });
    closeAllPanels();
    setLocalNotice(createEvaluationNotice(evaluation));
  };

  const toggleBonusForm = () => {
    togglePanel('bonus');
    setLocalNotice('');
  };

  const toggleChangeRequestForm = () => {
    togglePanel('changeRequest');
    setLocalNotice('');
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.detailContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.detailTopBar}>
        <Pressable
          testID="order-detail-back"
          style={styles.draftBackButton}
          onPress={onBack}
        >
          <Text style={styles.draftBackText}>返回首页</Text>
        </Pressable>
        <View style={styles.detailTitleGroup}>
          <Text style={styles.draftKicker}>订单详情</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.detailTitle}>{order.id}</Text>
            <Pressable
              testID="order-detail-copy-order-no"
              style={styles.detailSecondaryButton}
              onPress={() => {
                Clipboard.setString(order.id);
                setLocalNotice('订单号已复制到剪贴板。');
              }}
            >
              <Text style={styles.detailSecondaryButtonText}>复制</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.draftBadge}>
          <Text style={styles.draftBadgeText}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.detailRoute} numberOfLines={2}>
          {order.from} → {order.to}
        </Text>
        <Text style={styles.detailMeta}>{order.updatedAtText}</Text>
        {order.pickupTimeText ? (
          <Text style={styles.detailMeta}>装货时间：{order.pickupTimeText}</Text>
        ) : null}
        {order.expectedDeliveryTimeText ? (
          <Text style={styles.detailMeta}>
            期望送达：{order.expectedDeliveryTimeText}
          </Text>
        ) : null}
      </View>

      {syncState ? (
        <OrderSyncStatusCard
          syncState={syncState}
          onRetry={retryOrderSync}
          onMarkFailed={markOrderSyncFailed}
        />
      ) : null}

      {order.paymentMethod === 'online' ? (
        <PaymentStatusCard
          orderPaymentStatus={order.paymentStatus ?? 'pending'}
          payment={payment}
          orderPaymentChannel={order.paymentChannel}
          paymentSettledAtIso={order.paymentSettledAtIso}
          refundedAtIso={order.refundedAtIso}
          selectedChannel={paymentChannel}
          isBusy={isPaymentBusy}
          notice={paymentNotice}
          onSelectChannel={setPaymentChannel}
          onPay={submitPlatformPayment}
          onRefresh={refreshPaymentStatus}
          supportsPlatformPaymentFlow={Boolean(platformPaymentApi)}
          hasPlatformOrderBinding={Boolean(order.platformOrderId)}
          canSubmitPaymentAction={Boolean(
            platformPaymentApi && platformPaymentSdk && order.platformOrderId,
          )}
        />
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
          platformOrderApi?.appealExceptionCase
            ? submitExceptionCaseAppeal
            : undefined
        }
      />

      <View style={styles.detailCard}>
        <Text style={styles.draftSectionTitle}>状态流转</Text>
        <View style={styles.detailTimeline}>
          {timeline.map(item => (
            <View key={item.label} style={styles.detailTimelineItem}>
              <View
                style={[
                  styles.detailTimelineDot,
                  item.active && styles.detailTimelineDotActive,
                ]}
              />
              <Text
                style={[
                  styles.detailTimelineText,
                  item.active && styles.detailTimelineTextActive,
                ]}
              >
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <OrderCargoContactCard
        order={order}
        vehicleRequirementText={vehicleRequirementText}
        onCallContact={callOrderContact}
        supportsPlatformPaymentFlow={Boolean(platformPaymentApi)}
      />

      {order.driverInfo ? (
        <View style={styles.detailCard}>
          <Text style={styles.draftSectionTitle}>司机信息</Text>
          <DriverInfoCard driver={order.driverInfo} />
        </View>
      ) : null}

      {isPanelOpen('quotes') ? (
        <View style={styles.detailCard}>
          <Text style={styles.draftSectionTitle}>司机报价列表</Text>
          {driverQuotes.length > 0 ? (
            driverQuotes.map(quote => (
              <DriverQuoteCard
                key={quote.driverId}
                quote={quote}
                onSelect={selectDriverQuote}
              />
            ))
          ) : (
            <Text style={styles.detailMeta}>
              暂无司机报价，议价订单发布后将等待司机提交报价。
            </Text>
          )}
        </View>
      ) : null}

      {isPanelOpen('exception') ? (
        <ExceptionReportForm
          platformFileApi={platformFileApi}
          onSubmit={submitExceptionReport}
        />
      ) : null}

      {isPanelOpen('changeRequest') ? (
      <ChangeRequestForm
        onSubmit={submitChangeRequest}
        usesPlatformChangeRequest={usesPlatformOrderActions}
        />
      ) : null}

      {isPanelOpen('cancellation') ? (
        <CancellationForm
          onSubmit={submitCancellation}
          usesPlatformCancellation={usesPlatformOrderActions}
        />
      ) : null}

      {isPanelOpen('bonus') ? (
        <BonusForm
          currentBonusText={order.bonusText}
          onSubmit={submitBonus}
        />
      ) : null}

      {isPanelOpen('tracking') && order.driverInfo ? (
        <TrackingCard
          order={order}
          driver={order.driverInfo}
          platformMapsApi={platformMapsApi}
          onOpenNavigation={url => {
            Linking.openURL(url).catch(() => {
              setExceptionCaseNotice('无法打开导航应用，请检查本机是否安装地图 App。');
            });
          }}
        />
      ) : null}

      {isPanelOpen('evaluation') ? (
        <DriverEvaluationForm
          platformFileApi={platformFileApi}
          onSubmit={submitEvaluation}
        />
      ) : null}

      {order.exceptionReport ? (
        <ExceptionRecordCard
          orderId={order.id}
          exceptionReport={order.exceptionReport}
          onResolve={resolveExceptionReport}
        />
      ) : null}

      {order.modificationRequest ? (
        <ModificationRequestRecordCard
          orderId={order.id}
          modificationRequest={order.modificationRequest}
          onReview={updateChangeRequestReview}
        />
      ) : null}

      {order.cancellation ? (
        <CancellationRecordCard cancellation={order.cancellation} />
      ) : null}

      {order.evaluation ? (
        <EvaluationRecordCard evaluation={order.evaluation} />
      ) : null}
      {order.shipperEvaluation ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailRoute}>司机评价</Text>
          <View style={styles.detailInlineGroup}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.detailMeta}>
                {`评分：${'★'.repeat(order.shipperEvaluation.rating)}${'☆'.repeat(5 - order.shipperEvaluation.rating)}`}
              </Text>
            </View>
            {order.shipperEvaluation.tags.map((tag, index) => (
              <Text key={index} style={styles.detailMeta}>
                {`#${tag}`}
              </Text>
            ))}
            <Text style={styles.detailMeta}>
              {order.shipperEvaluation.content}
            </Text>
            {order.shipperEvaluation.anonymous ? (
              <Text style={styles.detailMeta}>匿名评价</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {localNotice ? (
        <View style={styles.detailNoticeCard}>
          <Text style={styles.detailNoticeText}>{localNotice}</Text>
        </View>
      ) : null}

      <OrderActionsCard
        order={order}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        canRequestChange={canRequestChange}
        onPrimaryAction={runPrimaryAction}
        onSecondaryAction={runSecondaryAction}
        onEditOrder={onEditOrder}
        onToggleBonus={toggleBonusForm}
        onToggleChangeRequest={toggleChangeRequestForm}
      />

      {progressAction ? (
        <OrderProgressActionCard
          progressAction={progressAction}
          onProgressAction={runProgressAction}
        />
      ) : null}
    </ScrollView>
  );
}

function mapPaymentRecordToOrderStatus(
  payment: PlatformPaymentRecord,
): NonNullable<RecentOrder['paymentStatus']> {
  if (payment.status === 'pending' || payment.status === 'processing') {
    return 'pending';
  }
  if (payment.status === 'expired') {
    return 'failed';
  }
  return payment.status;
}

function applyPaymentSnapshot({
  order,
  latestPayment,
  onUpdateOrder,
  setPayment,
  setPaymentChannel,
}: {
  order: RecentOrder;
  latestPayment: PlatformPaymentRecord;
  onUpdateOrder: (orderId: string, changes: Partial<RecentOrder>) => void;
  setPayment: (payment: PlatformPaymentRecord) => void;
  setPaymentChannel: (channel: PlatformPaymentChannel) => void;
}) {
  setPayment(latestPayment);
  if (
    latestPayment.channel === 'wechat' ||
    latestPayment.channel === 'alipay'
  ) {
    setPaymentChannel(latestPayment.channel);
  }

  const nextPaymentStatus = mapPaymentRecordToOrderStatus(latestPayment);
  const nextPaymentSettledAtIso =
    latestPayment.settledAtIso ?? order.paymentSettledAtIso;
  const nextRefundedAtIso =
    latestPayment.refundedAtIso ?? order.refundedAtIso;

  if (
    order.paymentStatus === nextPaymentStatus &&
    order.paymentChannel === latestPayment.channel &&
    order.paymentSettledAtIso === nextPaymentSettledAtIso &&
    order.refundedAtIso === nextRefundedAtIso
  ) {
    return;
  }

  onUpdateOrder(order.id, {
    paymentStatus: nextPaymentStatus,
    paymentChannel: latestPayment.channel,
    paymentSettledAtIso: nextPaymentSettledAtIso,
    refundedAtIso: nextRefundedAtIso,
    syncState: order.syncState,
  });
}

function getPaymentFailureNotice(error: unknown) {
  if (error instanceof PlatformApiError) {
    if (error.code === 'AUTH_ACCESS_TOKEN_MISSING') {
      return '登录状态已失效，请重新登录后支付。';
    }
    if (error.code === 'PAYMENT_ORDER_NOT_AVAILABLE') {
      return '已有支付仍在处理中，请先刷新服务端状态。';
    }
  }
  return '支付请求失败，请稍后重试。';
}
