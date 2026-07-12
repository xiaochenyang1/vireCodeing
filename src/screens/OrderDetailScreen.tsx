import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useEffect, useState } from 'react';

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
import { TrackingCard } from './order-detail/TrackingCard';
import { useOrderDetailPanels } from './order-detail/useOrderDetailPanels';
import type {
  DraftOrderPrefill,
  FileAttachmentRef,
  DriverQuote,
  RecentOrder,
} from '../types';
import type { createPlatformFileApi } from '../services/platformFileApi';
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
    'listExceptionCases'
  >;
}) {
  const order = orders.find(item => item.id === orderId) ?? orders[0];
  const status = recentOrderStatusCopy[order.status];
  const progressAction = getOrderProgressAction(order.status);
  const vehicleRequirementText = formatVehicleRequirementText(order);
  const [exceptionCases, setExceptionCases] = useState<
    PlatformOrderExceptionCase[]
  >([]);
  const [isLoadingExceptionCases, setIsLoadingExceptionCases] =
    useState(false);
  const [exceptionCaseNotice, setExceptionCaseNotice] = useState<string>();

  useEffect(() => {
    if (!platformOrderApi || !order.platformOrderId) {
      setExceptionCases([]);
      setExceptionCaseNotice(undefined);
      setIsLoadingExceptionCases(false);
      return;
    }

    let active = true;
    setExceptionCases([]);
    setExceptionCaseNotice(undefined);
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

  const primaryAction = getOrderPrimaryActionLabel(order);
  const secondaryAction = getOrderSecondaryActionLabel(order);

  const runProgressAction = () => {
    if (!progressAction) {
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
        setLocalNotice('正在确认送达并同步平台订单。');
        return;
      }

      updateOrderFromDetail({
        status: 'completed',
        updatedAtText: '订单已完成 · 刚刚',
      });
      setLocalNotice('已确认送达，当前本地演示默认货到付款完成。');
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
    setLocalNotice('后端同步已在本地标记为已同步，真实 API 接入后替换这里。');
  };

  const markOrderSyncFailed = () => {
    updateOrderFromDetail({
      syncState: createFailedOrderSyncState(undefined, 'local', now),
    });
    setLocalNotice('订单同步已在本地标记失败，真实 API 接入后替换这里。');
  };

  const submitCancellation = (cancellation: {
    reasonText: string;
    description: string;
  }) => {
    const cancellationSettlement = getCancellationSettlement(order.status);
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
    const bonusChange = createBonusOrderChange(bonusAmount);

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
    const changeRequest = createChangeRequestOrderChange(description);

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
          <Text style={styles.detailTitle}>{order.id}</Text>
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

      <ExceptionCaseProgressPanel
        cases={exceptionCases}
        isLoading={isLoadingExceptionCases}
        notice={exceptionCaseNotice}
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
        <ChangeRequestForm onSubmit={submitChangeRequest} />
      ) : null}

      {isPanelOpen('cancellation') ? (
        <CancellationForm onSubmit={submitCancellation} />
      ) : null}

      {isPanelOpen('bonus') ? <BonusForm onSubmit={submitBonus} /> : null}

      {isPanelOpen('tracking') && order.driverInfo ? (
        <TrackingCard order={order} driver={order.driverInfo} />
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
