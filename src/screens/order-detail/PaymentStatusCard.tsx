import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  PlatformPaymentChannel,
  PlatformPaymentRecord,
} from '../../services/platformPaymentApi';
import { colors, shadows } from '../../styles';
import type { OrderPaymentStatus, PaymentChannel } from '../../types';

const paymentStatusCopy: Record<
  OrderPaymentStatus | PlatformPaymentRecord['status'],
  { label: string; description: string }
> = {
  not_required: {
    label: '货到付款',
    description: '订单无需在线支付，完成运输后按约定结算。',
  },
  pending: {
    label: '待支付',
    description: '支付结果以平台服务端状态为准。',
  },
  processing: {
    label: '支付确认中',
    description: '支付单仍有效，可继续拉起原支付流程。',
  },
  escrowed: {
    label: '资金已托管',
    description: '平台已确认收款，运输完成后进入结算。',
  },
  settled: {
    label: '已完成结算',
    description: '订单资金已按服务端结算快照完成分账。',
  },
  failed: {
    label: '支付失败',
    description: '可重新选择支付渠道并发起支付。',
  },
  expired: {
    label: '支付单已过期',
    description: '原支付单已失效，可重新发起支付。',
  },
  cancelled: {
    label: '支付已取消',
    description: '该支付单已关闭。',
  },
  refund_pending: {
    label: '退款处理中',
    description: '退款请求已受理，请勿重复取消订单。',
  },
  refunded: {
    label: '已退款',
    description: '平台服务端已确认退款完成。',
  },
  refund_failed: {
    label: '退款待处理',
    description: '退款暂未完成，平台将继续处理。',
  },
  legacy_unverified: {
    label: '历史资金待核验',
    description: '该历史订单没有可验证的在线资金快照。',
  },
};

export function PaymentStatusCard({
  orderPaymentStatus,
  payment,
  orderPaymentChannel,
  paymentSettledAtIso,
  refundedAtIso,
  selectedChannel,
  isBusy,
  notice,
  onSelectChannel,
  onPay,
  onRefresh,
  supportsPlatformPaymentFlow = false,
  hasPlatformOrderBinding = false,
  canSubmitPaymentAction = true,
}: {
  orderPaymentStatus: OrderPaymentStatus;
  payment?: PlatformPaymentRecord;
  orderPaymentChannel?: PaymentChannel;
  paymentSettledAtIso?: string;
  refundedAtIso?: string;
  selectedChannel: PlatformPaymentChannel;
  isBusy: boolean;
  notice?: string;
  onSelectChannel: (channel: PlatformPaymentChannel) => void;
  onPay: () => void;
  onRefresh: () => void;
  supportsPlatformPaymentFlow?: boolean;
  hasPlatformOrderBinding?: boolean;
  canSubmitPaymentAction?: boolean;
}) {
  const effectiveStatus = payment?.status ?? orderPaymentStatus;
  const status = paymentStatusCopy[effectiveStatus];
  const description = getPaymentStatusDescription(effectiveStatus, {
    supportsPlatformPaymentFlow,
    hasPlatformOrderBinding,
  });
  const factTexts = buildPaymentFactTexts({
    payment,
    orderPaymentChannel,
    effectiveStatus,
    paymentSettledAtIso,
    refundedAtIso,
  });
  const hasActivePayment =
    payment?.status === 'pending' || payment?.status === 'processing';
  const canPay =
    hasActivePayment ||
    orderPaymentStatus === 'pending' ||
    orderPaymentStatus === 'failed';
  const shouldShowPaymentAction =
    canSubmitPaymentAction &&
    canPay &&
    effectiveStatus !== 'escrowed' &&
    effectiveStatus !== 'settled' &&
    effectiveStatus !== 'refund_pending' &&
    effectiveStatus !== 'refunded';

  return (
    <View style={cardStyles.card} testID="payment-status-card">
      <View style={cardStyles.header}>
        <View style={cardStyles.titleGroup}>
          <Text style={cardStyles.eyebrow}>资金状态</Text>
          <Text style={cardStyles.status}>{status.label}</Text>
        </View>
        <Pressable
          testID="payment-refresh"
          accessibilityRole="button"
          disabled={isBusy}
          style={({ pressed }) => [
            cardStyles.refreshButton,
            pressed && !isBusy ? cardStyles.pressed : null,
            isBusy ? cardStyles.disabled : null,
          ]}
          onPress={onRefresh}
        >
          <Text style={cardStyles.refreshText}>刷新状态</Text>
        </Pressable>
      </View>

      <Text style={cardStyles.description}>{description}</Text>

      {factTexts.length > 0 ? (
        <View style={cardStyles.factRow}>
          {factTexts.map((factText, index) => (
            <Text key={`${index}-${factText}`} style={cardStyles.factText}>
              {factText}
            </Text>
          ))}
        </View>
      ) : null}

      {shouldShowPaymentAction ? (
        <View style={cardStyles.actionGroup}>
          <View style={cardStyles.segmentedControl}>
            <ChannelButton
              channel="wechat"
              label="微信支付"
              active={selectedChannel === 'wechat'}
              disabled={isBusy || hasActivePayment}
              onPress={onSelectChannel}
            />
            <ChannelButton
              channel="alipay"
              label="支付宝"
              active={selectedChannel === 'alipay'}
              disabled={isBusy || hasActivePayment}
              onPress={onSelectChannel}
            />
          </View>
          <Pressable
            testID="payment-submit"
            accessibilityRole="button"
            disabled={isBusy}
            style={({ pressed }) => [
              cardStyles.payButton,
              pressed && !isBusy ? cardStyles.payButtonPressed : null,
              isBusy ? cardStyles.disabled : null,
            ]}
            onPress={onPay}
          >
            <Text style={cardStyles.payButtonText}>
              {isBusy
                ? '正在确认'
                : hasActivePayment
                  ? '继续支付'
                  : '立即支付'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {notice ? <Text style={cardStyles.notice}>{notice}</Text> : null}
    </View>
  );
}

function getPaymentStatusDescription(
  status: OrderPaymentStatus | PlatformPaymentRecord['status'],
  {
    supportsPlatformPaymentFlow,
    hasPlatformOrderBinding,
  }: {
    supportsPlatformPaymentFlow: boolean;
    hasPlatformOrderBinding: boolean;
  },
) {
  if (status === 'pending') {
    if (supportsPlatformPaymentFlow && hasPlatformOrderBinding) {
      return paymentStatusCopy.pending.description;
    }

    if (supportsPlatformPaymentFlow) {
      return '当前订单还未同步到平台，需待平台订单创建后再发起支付。';
    }

    return '当前仍是本地演示订单，切到平台模式后可继续在线支付。';
  }

  return paymentStatusCopy[status].description;
}

function ChannelButton({
  channel,
  label,
  active,
  disabled,
  onPress,
}: {
  channel: PlatformPaymentChannel;
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: (channel: PlatformPaymentChannel) => void;
}) {
  return (
    <Pressable
      testID={`payment-channel-${channel}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      style={({ pressed }) => [
        cardStyles.channelButton,
        active ? cardStyles.channelButtonActive : null,
        pressed && !disabled ? cardStyles.pressed : null,
        disabled && !active ? cardStyles.disabled : null,
      ]}
      onPress={() => onPress(channel)}
    >
      <Text
        style={[
          cardStyles.channelButtonText,
          active ? cardStyles.channelButtonTextActive : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatPaymentAmount(amountCents: number) {
  return `￥${(amountCents / 100).toFixed(2)}`;
}

function buildPaymentFactTexts({
  payment,
  orderPaymentChannel,
  effectiveStatus,
  paymentSettledAtIso,
  refundedAtIso,
}: {
  payment?: PlatformPaymentRecord;
  orderPaymentChannel?: PaymentChannel;
  effectiveStatus: OrderPaymentStatus | PlatformPaymentRecord['status'];
  paymentSettledAtIso?: string;
  refundedAtIso?: string;
}) {
  const facts: string[] = [];
  const effectivePaymentSettledAtIso =
    payment?.settledAtIso ?? paymentSettledAtIso;
  const effectiveRefundedAtIso = payment?.refundedAtIso ?? refundedAtIso;

  if (payment) {
    facts.push(`金额 ${formatPaymentAmount(payment.amountCents)}`);
  }

  const effectiveChannel = payment?.channel ?? orderPaymentChannel;
  if (effectiveChannel) {
    facts.push(`渠道 ${formatPaymentChannel(effectiveChannel)}`);
  }

  if (payment?.paymentNo) {
    facts.push(`支付单号 ${payment.paymentNo}`);
  }

  if (payment?.providerTradeNo) {
    facts.push(`渠道流水 ${payment.providerTradeNo}`);
  }

  if (effectiveStatus === 'refunded' && effectiveRefundedAtIso) {
    facts.push(`退款时间 ${formatPaymentDateTime(effectiveRefundedAtIso)}`);
  }

  if (
    (effectiveStatus === 'settled' || effectiveStatus === 'refunded') &&
    effectivePaymentSettledAtIso
  ) {
    facts.push(`结算时间 ${formatPaymentDateTime(effectivePaymentSettledAtIso)}`);
  }

  if (
    payment?.paidAtIso &&
    effectiveStatus !== 'pending' &&
    effectiveStatus !== 'processing'
  ) {
    facts.push(`支付时间 ${formatPaymentDateTime(payment.paidAtIso)}`);
  }

  if (
    (effectiveStatus === 'pending' || effectiveStatus === 'processing') &&
    payment?.expiresAtIso
  ) {
    facts.push(`有效期至 ${formatPaymentDateTime(payment.expiresAtIso)}`);
  }

  if (effectiveStatus === 'cancelled' && payment?.cancelledAtIso) {
    facts.push(`关闭时间 ${formatPaymentDateTime(payment.cancelledAtIso)}`);
  }

  if (payment?.updatedAtIso) {
    facts.push(`服务端更新 ${formatPaymentDateTime(payment.updatedAtIso)}`);
  }

  return facts;
}

function formatPaymentChannel(
  channel: PlatformPaymentRecord['channel'] | PaymentChannel,
) {
  if (channel === 'wechat') {
    return '微信支付';
  }
  if (channel === 'alipay') {
    return '支付宝';
  }
  return '沙箱支付';
}

const SHANGHAI_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

function formatPaymentDateTime(value: string) {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return value;
  }

  const shanghaiTime = new Date(timestamp + SHANGHAI_TIME_OFFSET_MS);
  const year = shanghaiTime.getUTCFullYear();
  const month = `${shanghaiTime.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${shanghaiTime.getUTCDate()}`.padStart(2, '0');
  const hours = `${shanghaiTime.getUTCHours()}`.padStart(2, '0');
  const minutes = `${shanghaiTime.getUTCMinutes()}`.padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 8,
    backgroundColor: colors.surface,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    shadowColor: shadows.shadowColor,
    shadowOffset: shadows.shadowOffset,
    shadowOpacity: shadows.shadowOpacity,
    shadowRadius: shadows.shadowRadius,
    elevation: shadows.elevation,
  },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleGroup: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  status: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  refreshButton: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  refreshText: {
    color: colors.tealDark,
    fontSize: 12,
    fontWeight: '800',
  },
  description: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  factRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  factText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  actionGroup: {
    gap: 10,
  },
  segmentedControl: {
    minHeight: 46,
    flexDirection: 'row',
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    padding: 3,
    gap: 3,
  },
  channelButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
  },
  channelButtonActive: {
    backgroundColor: colors.surface,
    shadowColor: '#17372E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 1,
  },
  channelButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  channelButtonTextActive: {
    color: colors.tealDark,
  },
  payButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.tealDark,
    transform: [{ scale: 1 }],
  },
  payButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  payButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '900',
  },
  notice: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.55,
  },
});
