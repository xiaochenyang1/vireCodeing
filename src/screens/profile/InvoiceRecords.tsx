import { Pressable, Text, View } from 'react-native';
import { useEffect, useState } from 'react';

import { AuthField } from '../../components/AuthField';
import { PlatformApiError } from '../../services/platformApiClient';
import type {
  createPlatformProfileApi,
  PlatformProfileSpendingSnapshot,
} from '../../services/platformProfileApi';
import { styles } from '../../styles';
import type { RecentOrder } from '../../types';
import type {
  EnterpriseVerificationRequest,
  InvoiceApplicationDetails,
  InvoiceItem,
  InvoiceRejectionReasons,
  InvoiceTitleOption,
  InvoiceTypeOption,
  ProfileInvoiceApplicationSyncMode,
  ProfileInvoiceApplicationSyncRequest,
  ProfileLocalState,
  SavedAccountSettings,
} from '../../utils/profileLocalState';
import {
  canRequestVatSpecialInvoice,
  createApprovedInvoiceChanges,
  createDownloadedInvoiceDetails,
  createRejectedInvoiceChanges,
  createSubmittedInvoiceChanges,
  DEFAULT_INVOICE_REJECTION_REASON,
  getAvailableInvoiceableOrders,
  getInvoiceTitleText,
  getInvoiceTypeText,
  getNextInvoiceOrderSelection,
  getOccupiedInvoiceOrderIds,
  getSelectedInvoiceSummary,
  invoiceTitleOptions,
  invoiceTypeOptions,
  validateInvoiceSubmission,
  type ProfileInvoiceableOrderItem,
} from '../../utils/profileInvoices';
import {
  createInvoiceableOrders,
  formatLocalCurrency,
  formatLocalDateTime,
} from './profileRecordUtils';

type InvoicePlatformProfileApi = Pick<
  ReturnType<typeof createPlatformProfileApi>,
  'getInvoices' | 'createInvoiceApplication'
>;

export function InvoiceRecords({
  now,
  orders,
  invoices,
  invoiceDetails,
  invoiceRejectionReasons,
  enterpriseVerification,
  invoiceType,
  invoiceTitle,
  receiverEmail,
  selectedInvoiceOrderIds,
  account,
  platformProfileApi,
  platformSpendingSnapshot,
  onUpdateInvoices,
  onUpdateInvoiceDetails,
  onUpdateInvoiceRejectionReasons,
  onUpdateInvoiceSelections,
  onUpdateInvoiceMeta,
  onRefreshPlatformInvoices,
  onMarkInvoiceApplicationSyncFailed,
}: {
  now: number;
  orders: RecentOrder[];
  invoices: InvoiceItem[];
  invoiceDetails: Record<string, InvoiceApplicationDetails>;
  invoiceRejectionReasons: InvoiceRejectionReasons;
  enterpriseVerification?: EnterpriseVerificationRequest;
  invoiceType: InvoiceTypeOption;
  invoiceTitle: InvoiceTitleOption;
  receiverEmail: string;
  selectedInvoiceOrderIds: string[];
  account: SavedAccountSettings;
  platformProfileApi?: InvoicePlatformProfileApi;
  platformSpendingSnapshot?: PlatformProfileSpendingSnapshot;
  onUpdateInvoices: (invoices: InvoiceItem[]) => void;
  onUpdateInvoiceDetails: (
    invoiceDetails: Record<string, InvoiceApplicationDetails>,
  ) => void;
  onUpdateInvoiceRejectionReasons: (
    reasons: InvoiceRejectionReasons,
  ) => void;
  onUpdateInvoiceSelections: (selectedInvoiceOrderIds: string[]) => void;
  onUpdateInvoiceMeta: (
    changes: Partial<
      Pick<ProfileLocalState, 'invoiceType' | 'invoiceTitle' | 'receiverEmail'>
    >,
  ) => void;
  onRefreshPlatformInvoices: (options?: {
    clearSelectedInvoiceOrderIds?: boolean;
    resolveSyncFailureMode?: 'none' | 'auto' | 'always';
    successMessage?: string;
  }) => Promise<boolean>;
  onMarkInvoiceApplicationSyncFailed: (options: {
    message: string;
    mode: ProfileInvoiceApplicationSyncMode;
    request?: ProfileInvoiceApplicationSyncRequest;
    clearSelectedInvoiceOrderIds?: boolean;
  }) => void;
}) {
  const [notice, setNotice] = useState('');
  const [isSubmittingPlatformInvoice, setIsSubmittingPlatformInvoice] =
    useState(false);
  const currentTimeText = formatLocalDateTime(now);
  const currentTimeIso = new Date(now).toISOString();
  const isPlatformMode = Boolean(platformProfileApi);
  const canRequestVatSpecial = canRequestVatSpecialInvoice(
    enterpriseVerification,
  );
  const canUseEnterpriseInvoiceTitle = canRequestVatSpecial;
  const effectiveInvoiceTitle =
    invoiceTitle === 'enterprise' && !canUseEnterpriseInvoiceTitle
      ? 'personal'
      : invoiceTitle;
  const visibleInvoices = isPlatformMode
    ? invoices.filter(item => invoiceDetails[item.id]?.platformSynced)
    : invoices;
  const invoiceableOrders = getAvailableInvoiceableOrders(
    createInvoiceableOrders(orders, {
      platformOnly: isPlatformMode,
      platformRecords: platformSpendingSnapshot?.items ?? [],
    }),
    getOccupiedInvoiceOrderIds(visibleInvoices, invoiceDetails),
  );
  const {
    selectedOrders: selectedInvoiceOrders,
    selectedAmount: selectedInvoiceAmount,
    selectedOrderText: selectedInvoiceOrderText,
  } = getSelectedInvoiceSummary(invoiceableOrders, selectedInvoiceOrderIds);
  const platformInvoiceTitleText = getInvoiceTitleText({
    invoiceTitle: effectiveInvoiceTitle,
    currentInvoiceTitle:
      visibleInvoices[0]?.title ||
      enterpriseVerification?.enterpriseName ||
      account.displayName.trim() ||
      '个人货主',
    accountDisplayName: account.displayName,
    enterpriseVerification,
  });

  useEffect(() => {
    if (!isPlatformMode) {
      return;
    }

    const availableInvoiceOrderIdSet = new Set(
      invoiceableOrders.map(item => item.id),
    );
    const nextSelectedInvoiceOrderIds = selectedInvoiceOrderIds.filter(orderId =>
      availableInvoiceOrderIdSet.has(orderId),
    );

    if (nextSelectedInvoiceOrderIds.length === selectedInvoiceOrderIds.length) {
      return;
    }

    onUpdateInvoiceSelections(nextSelectedInvoiceOrderIds);
  }, [
    invoiceableOrders,
    isPlatformMode,
    onUpdateInvoiceSelections,
    selectedInvoiceOrderIds,
  ]);

  useEffect(() => {
    if (invoiceTitle === effectiveInvoiceTitle) {
      return;
    }

    onUpdateInvoiceMeta({invoiceTitle: effectiveInvoiceTitle});
  }, [effectiveInvoiceTitle, invoiceTitle, onUpdateInvoiceMeta]);

  const toggleInvoiceOrder = (order: ProfileInvoiceableOrderItem) => {
    const nextSelection = getNextInvoiceOrderSelection(
      selectedInvoiceOrderIds,
      order.id,
    );

    if (nextSelection.notice) {
      setNotice(nextSelection.notice);
      return;
    }

    onUpdateInvoiceSelections(nextSelection.selectedInvoiceOrderIds);
  };

  const submitPlatformInvoice = async () => {
    if (!platformProfileApi || isSubmittingPlatformInvoice) {
      return;
    }

    const validation = validateInvoiceSubmission({
      receiverEmail,
      selectedOrderCount: selectedInvoiceOrders.length,
      invoiceType,
      invoiceTitle: effectiveInvoiceTitle,
      canRequestVatSpecialInvoice: canRequestVatSpecial,
      canUseEnterpriseInvoiceTitle,
    });

    if (validation.notice) {
      setNotice(validation.notice);
      return;
    }

    const platformOrderIds = selectedInvoiceOrders
      .map(order => order.platformOrderId)
      .filter((orderId): orderId is string => Boolean(orderId));

    if (
      platformOrderIds.length === 0 ||
      platformOrderIds.length !== selectedInvoiceOrders.length
    ) {
      setNotice('请选择平台已完成订单后再提交发票申请');
      return;
    }

    const retryRequest: ProfileInvoiceApplicationSyncRequest = {
      invoiceType,
      invoiceTitleType: effectiveInvoiceTitle,
      invoiceTitle: platformInvoiceTitleText,
      receiverEmail: validation.trimmedEmail,
      orderIds: platformOrderIds,
    };

    setIsSubmittingPlatformInvoice(true);

    try {
      await platformProfileApi.createInvoiceApplication(retryRequest);

      try {
        await onRefreshPlatformInvoices({
          clearSelectedInvoiceOrderIds: true,
          resolveSyncFailureMode: 'always',
          successMessage: '平台发票申请已提交，状态已同步。',
        });
        setNotice('平台发票申请已提交，状态已同步。');
      } catch (refreshError) {
        const noticeText =
          refreshError instanceof PlatformApiError &&
          refreshError.code === 'AUTH_ACCESS_TOKEN_MISSING'
            ? '平台发票申请已提交，重新登录后再刷新申请记录。'
            : '平台发票申请已提交，但申请记录刷新失败，请稍后重试。';
        onMarkInvoiceApplicationSyncFailed({
          message: noticeText,
          mode: 'refresh',
          clearSelectedInvoiceOrderIds: true,
        });
        setNotice(noticeText);
      }
    } catch (error) {
      const noticeText =
        error instanceof PlatformApiError &&
        error.code === 'AUTH_ACCESS_TOKEN_MISSING'
          ? '平台发票申请需要重新登录后再提交。'
          : error instanceof PlatformApiError && error.code === 'NETWORK_ERROR'
          ? '平台发票申请失败，请检查网络后重试。'
          : error instanceof PlatformApiError &&
            /[\u4e00-\u9fa5]/.test(error.message)
          ? error.message
          : '平台发票申请失败，请稍后重试。';
      onMarkInvoiceApplicationSyncFailed({
        message: noticeText,
        mode: 'submit',
        request: retryRequest,
      });
      setNotice(noticeText);
    } finally {
      setIsSubmittingPlatformInvoice(false);
    }
  };

  const submitInvoice = (invoiceId: string) => {
    const targetInvoice = invoices.find(item => item.id === invoiceId);

    if (!targetInvoice) {
      return;
    }

    const validation = validateInvoiceSubmission({
      receiverEmail,
      selectedOrderCount: selectedInvoiceOrders.length,
      invoiceType,
      invoiceTitle: effectiveInvoiceTitle,
      canRequestVatSpecialInvoice: canRequestVatSpecial,
      canUseEnterpriseInvoiceTitle,
    });

    if (validation.notice) {
      setNotice(validation.notice);
      return;
    }

    const nextChanges = createSubmittedInvoiceChanges({
      invoiceId,
      invoices,
      invoiceDetails,
      invoiceRejectionReasons,
      selectedOrders: selectedInvoiceOrders,
      selectedInvoiceOrderIds,
      invoiceTypeText: getInvoiceTypeText(invoiceType),
      invoiceTitleText: getInvoiceTitleText({
        invoiceTitle: effectiveInvoiceTitle,
        currentInvoiceTitle: targetInvoice.title,
        accountDisplayName: account.displayName,
        enterpriseVerification,
      }),
      receiverEmail: validation.trimmedEmail,
      selectedOrderText: selectedInvoiceOrderText,
      invoiceAmountText: formatLocalCurrency(selectedInvoiceAmount),
      currentTimeText,
      currentTimeIso,
    });

    if (!nextChanges) {
      return;
    }

    onUpdateInvoices(nextChanges.invoices);
    onUpdateInvoiceRejectionReasons(nextChanges.invoiceRejectionReasons);
    onUpdateInvoiceDetails(nextChanges.invoiceDetails);
    onUpdateInvoiceSelections(nextChanges.selectedInvoiceOrderIds);
    setNotice('发票申请已提交，当前为本地演示状态。');
  };

  const approveInvoice = (invoiceId: string) => {
    const nextChanges = createApprovedInvoiceChanges({
      invoiceId,
      invoices,
      invoiceDetails,
      currentTimeText,
      currentTimeIso,
    });

    onUpdateInvoices(nextChanges.invoices);
    onUpdateInvoiceDetails(nextChanges.invoiceDetails);
    setNotice('发票审核通过，可下载本地凭证。');
  };

  const rejectInvoice = (invoiceId: string) => {
    const nextChanges = createRejectedInvoiceChanges({
      invoiceId,
      invoices,
      invoiceDetails,
      invoiceRejectionReasons,
      rejectionReason: DEFAULT_INVOICE_REJECTION_REASON,
      currentTimeText,
      currentTimeIso,
    });

    onUpdateInvoices(nextChanges.invoices);
    onUpdateInvoiceRejectionReasons(nextChanges.invoiceRejectionReasons);
    onUpdateInvoiceDetails(nextChanges.invoiceDetails);
    setNotice(`发票申请已驳回：${DEFAULT_INVOICE_REJECTION_REASON}。`);
  };

  const downloadInvoice = (invoiceId: string) => {
    onUpdateInvoiceDetails(
      createDownloadedInvoiceDetails({
        invoiceId,
        invoiceDetails,
        currentTimeText,
        currentTimeIso,
      }),
    );
    setNotice(`发票下载凭证：INV-LOCAL-${invoiceId}`);
  };

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>发票申请信息</Text>
      {isPlatformMode ? (
        <Text style={styles.routeMeta}>
          平台模式下将直接提交真实发票申请，并展示平台返回的申请记录。
        </Text>
      ) : null}
      <Text style={styles.draftSectionTitle}>可开票订单</Text>
      {invoiceableOrders.length > 0 ? (
        invoiceableOrders.map(item => {
          const selected = selectedInvoiceOrderIds.includes(item.id);

          return (
            <Pressable
              key={item.id}
              testID={`invoice-order-${item.id}`}
              style={({ pressed }) => [
                styles.driverInfoCard,
                selected && styles.draftChoiceButtonActive,
                pressed && styles.pressedCard,
              ]}
              onPress={() => toggleInvoiceOrder(item)}
            >
              <View style={styles.routeHeader}>
                <Text style={styles.routeName}>{item.orderId}</Text>
                <Text style={styles.routeAction}>
                  {selected ? '已选' : '可选'}
                </Text>
              </View>
              <Text style={styles.detailMeta}>{item.routeText}</Text>
              <Text style={styles.routeMeta}>
                {`${item.amountText} · ${item.completedTimeText}`}
              </Text>
            </Pressable>
          );
        })
      ) : (
        <Text style={styles.routeMeta}>
          {isPlatformMode
            ? '暂无可申请平台发票的已完成订单'
            : '暂无可开票订单'}
        </Text>
      )}
      <Text style={styles.routeMeta}>
        {`已选 ${selectedInvoiceOrders.length} 单`}
      </Text>
      <Text style={styles.routeMeta}>
        {`本次申请金额：${formatLocalCurrency(selectedInvoiceAmount)}`}
      </Text>

      <Text style={styles.detailMeta}>发票类型</Text>
      <View style={styles.draftChoiceGrid}>
        {invoiceTypeOptions.map(option => {
          const active = invoiceType === option.id;

          return (
            <Pressable
              key={option.id}
              testID={`invoice-type-${option.id}`}
              style={({ pressed }) => [
                styles.draftChoiceButton,
                active && styles.draftChoiceButtonActive,
                pressed && styles.pressedButton,
              ]}
              onPress={() => onUpdateInvoiceMeta({ invoiceType: option.id })}
            >
              <Text
                style={[
                  styles.draftChoiceText,
                  active && styles.draftChoiceTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.detailMeta}>发票抬头</Text>
      <View style={styles.draftChoiceGrid}>
        {invoiceTitleOptions.map(option => {
          const active = effectiveInvoiceTitle === option.id;

          return (
            <Pressable
              key={option.id}
              testID={`invoice-title-${option.id}`}
              style={({ pressed }) => [
                styles.draftChoiceButton,
                active && styles.draftChoiceButtonActive,
                pressed && styles.pressedButton,
              ]}
              onPress={() => {
                if (
                  option.id === 'enterprise' &&
                  !canUseEnterpriseInvoiceTitle
                ) {
                  setNotice('企业抬头需先提交企业认证资料');
                  return;
                }

                onUpdateInvoiceMeta({invoiceTitle: option.id});
              }}
            >
              <Text
                style={[
                  styles.draftChoiceText,
                  active && styles.draftChoiceTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <AuthField
        testID="invoice-email"
        label="接收邮箱"
        placeholder="例如 finance@company.com"
        value={receiverEmail}
        onChangeText={value => onUpdateInvoiceMeta({ receiverEmail: value })}
      />

      {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}
      {isPlatformMode ? (
        <Pressable
          testID="invoice-submit-platform"
          disabled={isSubmittingPlatformInvoice}
          style={({ pressed }) => [
            styles.detailPrimaryButton,
            pressed && !isSubmittingPlatformInvoice && styles.pressedButton,
          ]}
          onPress={submitPlatformInvoice}
        >
          <Text style={styles.detailPrimaryButtonText}>
            {isSubmittingPlatformInvoice ? '提交中...' : '提交平台发票申请'}
          </Text>
        </Pressable>
      ) : null}
      {isPlatformMode ? (
        <Text style={styles.draftSectionTitle}>平台申请记录</Text>
      ) : null}
      {visibleInvoices.length === 0 && isPlatformMode ? (
        <Text style={styles.routeMeta}>暂无平台发票申请记录</Text>
      ) : null}
      {visibleInvoices.map(item => {
        const details = invoiceDetails[item.id];
        const rejectionReason = invoiceRejectionReasons[item.id];
        const latestHistoryEntry =
          details?.historyEntries?.[details.historyEntries.length - 1];

        return (
          <View key={item.id} style={styles.driverInfoCard}>
            <View style={styles.routeHeader}>
              <Text style={styles.routeName}>{item.title}</Text>
              <Text style={styles.routeAction}>{item.statusText}</Text>
            </View>
            <Text style={styles.detailMeta}>{item.typeText}</Text>
            <Text style={styles.routeMeta}>{item.amountText}</Text>
            {details && latestHistoryEntry ? (
              <>
                <Text style={styles.routeMeta}>当前申请</Text>
                <Text style={styles.routeMeta}>
                  {`发票类型：${latestHistoryEntry.typeText}`}
                </Text>
                <Text style={styles.routeMeta}>
                  {`发票抬头：${latestHistoryEntry.titleText}`}
                </Text>
                <Text style={styles.routeMeta}>
                  {`接收邮箱：${latestHistoryEntry.receiverEmail}`}
                </Text>
                <Text style={styles.routeMeta}>
                  {`开票订单：${latestHistoryEntry.orderText}`}
                </Text>
                <Text style={styles.routeMeta}>
                  {`申请金额：${latestHistoryEntry.amountText}`}
                </Text>
                {latestHistoryEntry.submittedAtText ? (
                  <Text style={styles.routeMeta}>
                    {`提交时间：${latestHistoryEntry.submittedAtText}`}
                  </Text>
                ) : null}
                {latestHistoryEntry.approvedAtText ? (
                  <Text style={styles.routeMeta}>
                    {`开票时间：${latestHistoryEntry.approvedAtText}`}
                  </Text>
                ) : null}
                {details.rejectedAtText &&
                latestHistoryEntry.statusText === '已驳回' ? (
                  <Text style={styles.routeMeta}>
                    {`驳回时间：${details.rejectedAtText}`}
                  </Text>
                ) : null}
                {latestHistoryEntry.downloadedAtText ? (
                  <Text style={styles.routeMeta}>
                    {`下载时间：${latestHistoryEntry.downloadedAtText}`}
                  </Text>
                ) : null}
                {rejectionReason &&
                latestHistoryEntry.statusText === '已驳回' ? (
                  <Text style={styles.routeMeta}>
                    {`驳回原因：${rejectionReason}`}
                  </Text>
                ) : null}
                {details.statusHistory?.length ? (
                  <>
                    <Text style={styles.routeMeta}>处理记录</Text>
                    {details.statusHistory.map((historyItem, index) => (
                      <View key={`${item.id}-history-${index}`}>
                        <Text style={styles.routeMeta}>
                          {`${historyItem.actionText}：${historyItem.timestampText}`}
                        </Text>
                        {historyItem.noteText ? (
                          <Text style={styles.routeMeta}>
                            {historyItem.noteText}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </>
                ) : null}
                {details.historyEntries?.length ? (
                  <>
                    <Text style={styles.routeMeta}>申请历史</Text>
                    {details.historyEntries.map(historyEntry => (
                      <View
                        key={historyEntry.entryId}
                        style={styles.driverInfoCard}
                      >
                        <Text style={styles.routeMeta}>
                          {`第 ${historyEntry.sequenceNumber} 次申请`}
                        </Text>
                        <Text style={styles.routeMeta}>
                          {historyEntry.statusText}
                        </Text>
                        <Text style={styles.routeMeta}>
                          {`发票抬头：${historyEntry.titleText}`}
                        </Text>
                        <Text style={styles.routeMeta}>
                          {`发票类型：${historyEntry.typeText}`}
                        </Text>
                        <Text style={styles.routeMeta}>
                          {`申请金额：${historyEntry.amountText}`}
                        </Text>
                        <Text style={styles.routeMeta}>
                          {`开票订单：${historyEntry.orderText}`}
                        </Text>
                        <Text style={styles.routeMeta}>
                          {`提交时间：${historyEntry.submittedAtText}`}
                        </Text>
                        <Text style={styles.routeMeta}>
                          {`接收邮箱：${historyEntry.receiverEmail}`}
                        </Text>
                        {historyEntry.rejectionReasonText &&
                        historyEntry.entryId !== latestHistoryEntry.entryId ? (
                          <Text style={styles.routeMeta}>
                            {`驳回原因：${historyEntry.rejectionReasonText}`}
                          </Text>
                        ) : null}
                        {historyEntry.approvedAtText ? (
                          <Text style={styles.routeMeta}>
                            {`开票时间：${historyEntry.approvedAtText}`}
                          </Text>
                        ) : null}
                        {historyEntry.downloadedAtText ? (
                          <Text style={styles.routeMeta}>
                            {`下载时间：${historyEntry.downloadedAtText}`}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </>
                ) : null}
              </>
            ) : null}
            {rejectionReason ? (
              <Text style={styles.routeMeta}>
                {`驳回原因：${rejectionReason}`}
              </Text>
            ) : null}
            {!isPlatformMode &&
            (item.statusText === '待提交' || item.statusText === '已驳回') ? (
              <Pressable
                testID={`invoice-submit-${item.id}`}
                style={({ pressed }) => [
                  styles.detailPrimaryButton,
                  pressed && styles.pressedButton,
                ]}
                onPress={() => submitInvoice(item.id)}
              >
                <Text style={styles.detailPrimaryButtonText}>
                  {item.statusText === '已驳回' ? '重新提交' : '提交申请'}
                </Text>
              </Pressable>
            ) : null}
            {!isPlatformMode && item.statusText === '申请中' ? (
              <>
                <Pressable
                  testID={`invoice-approve-${item.id}`}
                  style={({ pressed }) => [
                    styles.detailPrimaryButton,
                    pressed && styles.pressedButton,
                  ]}
                  onPress={() => approveInvoice(item.id)}
                >
                  <Text style={styles.detailPrimaryButtonText}>本地审核通过</Text>
                </Pressable>
                <Pressable
                  testID={`invoice-reject-${item.id}`}
                  style={styles.detailSecondaryButton}
                  onPress={() => rejectInvoice(item.id)}
                >
                  <Text style={styles.detailSecondaryButtonText}>本地驳回</Text>
                </Pressable>
              </>
            ) : null}
            {!isPlatformMode && item.statusText === '已开票' ? (
              <Pressable
                testID={`invoice-download-${item.id}`}
                style={styles.detailSecondaryButton}
                onPress={() => downloadInvoice(item.id)}
              >
                <Text style={styles.detailSecondaryButtonText}>下载凭证</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
