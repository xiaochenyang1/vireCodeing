import { useMemo } from 'react';
import {
  Linking,
  Pressable,
  Text,
  View,
} from 'react-native';

import { FileUploadField } from './FileUploadField';
import {
  useImageUpload,
  type UseImageUploadResult,
} from '../hooks/useImageUpload';
import { colors, styles } from '../styles';
import type { createPlatformFileApi, PlatformFileUploadRecord } from '../services/platformFileApi';
import type { createPlatformMapsApi, PlatformNavigationTarget } from '../services/platformMapsApi';
import type { PlatformShipperOrder } from '../services/platformOrderApi';

export type DriverReceiptFieldName =
  | 'loadingReceiptFileId'
  | 'confirmingReceiptFileId';

type DriverOrderExecutionFileApi = Pick<
  ReturnType<typeof createPlatformFileApi>,
  'createUploadIntent' | 'confirmUploaded'
> &
  Partial<
    Pick<ReturnType<typeof createPlatformFileApi>, 'confirmLocalUploadTarget'>
  >;

export type DriverOrderExecutionProps = {
  order: PlatformShipperOrder;
  baseUpdatedAtIso: string;
  navigationTargets: PlatformNavigationTarget[];
  platformMapsApi?: Pick<
    ReturnType<typeof createPlatformMapsApi>,
    'getDriverNavigationTargets' | 'reportDriverLocation'
  >;
  platformFileApi?: DriverOrderExecutionFileApi;
  onNavigate: (target: PlatformNavigationTarget) => void;
  onReportLocation: () => void;
  onCallContact?: (contactType: '装货联系人' | '卸货联系人', contactName?: string, phone?: string) => void;
  onAdvanceStatus: (request: { nextStatus: string; receiptPhotoFileIds?: string[] }) => void;
  onChangeReceipt: (
    file: PlatformFileUploadRecord | undefined,
    fieldName: DriverReceiptFieldName,
  ) => void;
  receiptFiles: {
    loading: PlatformFileUploadRecord[];
    confirming: PlatformFileUploadRecord[];
  };
  isAdvancing: boolean;
};

const STATUS_STEPS = [
  { status: 'loading', label: '待装货', description: '前往装货点，装货完成后上传凭证' },
  { status: 'transporting', label: '运输中', description: '送达卸货点，卸货完成后上传凭证' },
  { status: 'confirming', label: '待确认', description: '等待货主确认送达' },
  { status: 'completed', label: '已完成', description: '订单完成，等待结算' },
] as const;

function getDriverStatusText(status: string): string {
  switch (status) {
    case 'loading':
      return '待装货';
    case 'transporting':
      return '运输中';
    case 'confirming':
      return '待确认';
    case 'completed':
      return '已完成';
    case 'waiting':
      return '待接单';
    case 'cancelled':
      return '已取消';
    default:
      return status;
  }
}

function getNextDriverStatus(status: string): string | undefined {
  const flow: Record<string, string> = {
    loading: 'transporting',
    transporting: 'confirming',
    confirming: 'completed',
  };
  return flow[status];
}

export function DriverOrderExecution({
  order,
  navigationTargets,
  platformMapsApi,
  platformFileApi,
  onNavigate,
  onReportLocation,
  onCallContact,
  onAdvanceStatus,
  onChangeReceipt,
  receiptFiles,
  isAdvancing,
}: DriverOrderExecutionProps) {
  const currentStepIndex = STATUS_STEPS.findIndex(
    step => step.status === order.status,
  );
  const nextStatus = getNextDriverStatus(order.status);
  const isLoadingStage = order.status === 'loading';
  const isTransportingStage = order.status === 'transporting';
  const isConfirmingStage = order.status === 'confirming';
  const isCompleted = order.status === 'completed';

  const advanceButtonText = useMemo(() => {
    if (isLoadingStage) return '确认装货完成';
    if (isTransportingStage) return '确认卸货完成';
    if (isConfirmingStage) return '确认送达';
    return '订单已完成';
  }, [order.status]);

  const canAdvance = Boolean(nextStatus && !isCompleted);
  const loadingReceiptUpload = useImageUpload(platformFileApi, {
    purpose: 'receipt',
    fileName: '装货凭证.png',
    contentType: 'image/png',
    byteSize: 2048,
  });
  const confirmingReceiptUpload = useImageUpload(platformFileApi, {
    purpose: 'receipt',
    fileName: '到达凭证.png',
    contentType: 'image/png',
    byteSize: 2048,
  });

  const buildReceiptUploader = (
    stage: 'loading' | 'confirming',
  ): UseImageUploadResult | undefined => {
    if (!platformFileApi) {
      return undefined;
    }

    const uploader =
      stage === 'loading' ? loadingReceiptUpload : confirmingReceiptUpload;
    const fieldName: DriverReceiptFieldName =
      stage === 'loading' ? 'loadingReceiptFileId' : 'confirmingReceiptFileId';
    const existingFile =
      stage === 'loading' ? receiptFiles.loading[0] : receiptFiles.confirming[0];

    return {
      state: {
        ...uploader.state,
        file: uploader.state.file ?? existingFile,
      },
      pickAndUpload: async () => {
        const result = await uploader.pickAndUpload();
        if (result.status === 'uploaded') {
          onChangeReceipt(result.file, fieldName);
        }
        return result;
      },
      clear: () => {
        uploader.clear();
        onChangeReceipt(undefined, fieldName);
      },
    };
  };

  return (
    <View style={styles.detailCard} testID="driver-order-execution">
      <Text style={styles.detailRoute}>执行订单详情</Text>
      <Text style={styles.detailMeta}>
        订单号：{order.orderNo}
      </Text>

      <View style={styles.detailInlineGroup}>
        <Text style={styles.draftSectionTitle}>订单进度</Text>
        {STATUS_STEPS.map((step, index) => {
          const isActive = index === currentStepIndex;
          const isPast = index < currentStepIndex;

          return (
            <View
              key={step.status}
              style={[
                executionStyles.stepRow,
                isActive && executionStyles.stepRowActive,
              ]}
            >
              <View
                style={[
                  executionStyles.stepIndicator,
                  isPast && executionStyles.stepIndicatorPast,
                  isActive && executionStyles.stepIndicatorActive,
                ]}
              >
                <Text
                  style={[
                    executionStyles.stepNumber,
                    (isPast || isActive) && executionStyles.stepNumberActive,
                  ]}
                >
                  {isPast ? '✓' : index + 1}
                </Text>
              </View>
              <View style={executionStyles.stepContent}>
                <Text
                  style={[
                    executionStyles.stepLabel,
                    isActive && executionStyles.stepLabelActive,
                  ]}
                >
                  {step.label}
                </Text>
                <Text style={executionStyles.stepDescription}>
                  {step.description}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.detailInlineGroup}>
        <Text style={styles.draftSectionTitle}>货物信息</Text>
        <Text style={styles.detailMeta}>
          {order.cargoType} · {order.weightText} · {order.quantityText}
        </Text>
        {order.volumeText ? (
          <Text style={styles.detailMeta}>体积：{order.volumeText}</Text>
        ) : null}
        {order.cargoDescription ? (
          <Text style={styles.detailMeta}>描述：{order.cargoDescription}</Text>
        ) : null}
      </View>

      <View style={styles.detailInlineGroup}>
        <Text style={styles.draftSectionTitle}>联系人</Text>
        <Text style={styles.detailMeta}>
          装货：{order.pickupContact} {order.pickupPhone}
        </Text>
        <Text style={styles.detailMeta}>
          卸货：{order.deliveryContact} {order.deliveryPhone}
        </Text>
        {onCallContact ? (
          <View style={styles.draftChoiceGrid}>
            {order.pickupPhone ? (
              <Pressable
                testID={`driver-call-pickup-${order.orderNo}`}
                style={styles.detailSecondaryButton}
                onPress={() =>
                  onCallContact('装货联系人', order.pickupContact, order.pickupPhone)
                }
              >
                <Text style={styles.detailSecondaryButtonText}>
                  拨打装货联系人
                </Text>
              </Pressable>
            ) : null}
            {order.deliveryPhone ? (
              <Pressable
                testID={`driver-call-delivery-${order.orderNo}`}
                style={styles.detailSecondaryButton}
                onPress={() =>
                  onCallContact('卸货联系人', order.deliveryContact, order.deliveryPhone)
                }
              >
                <Text style={styles.detailSecondaryButtonText}>
                  拨打卸货联系人
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {navigationTargets.length > 0 ? (
        <View style={styles.detailInlineGroup}>
          <Text style={styles.draftSectionTitle}>导航</Text>
          {navigationTargets.map(target => (
            <Pressable
              key={target.type}
              testID={`driver-nav-${target.type}-${order.orderNo}`}
              style={styles.detailSecondaryButton}
              onPress={() => onNavigate(target)}
            >
              <Text style={styles.detailSecondaryButtonText}>
                导航到{target.type === 'pickup' ? '装货点' : '卸货点'}
              </Text>
            </Pressable>
          ))}
          {platformMapsApi ? (
            <Pressable
              testID={`driver-report-location-${order.orderNo}`}
              style={styles.detailSecondaryButton}
              onPress={onReportLocation}
            >
              <Text style={styles.detailSecondaryButtonText}>
                上报当前位置
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {(isLoadingStage || isTransportingStage) && platformFileApi && (
        <View style={styles.detailInlineGroup}>
          <Text style={styles.draftSectionTitle}>
            {isLoadingStage ? '装货凭证' : '卸货凭证'}
          </Text>
          <Text style={styles.detailMeta}>
            {isLoadingStage
              ? '装货完成后请上传装货凭证照片'
              : '卸货完成后请上传卸货凭证照片'}
          </Text>
          <FileUploadField
            label={isLoadingStage ? '装货凭证' : '卸货凭证'}
            uploader={buildReceiptUploader(isLoadingStage ? 'loading' : 'confirming')!}
            testIDPrefix={`driver-receipt-${isLoadingStage ? 'loading' : 'confirming'}-${order.id}`}
          />
        </View>
      )}

      {canAdvance ? (
        <Pressable
          testID={`driver-advance-${order.id}`}
          style={[
            styles.detailPrimaryButton,
            isAdvancing && { opacity: 0.55 },
          ]}
          onPress={() =>
            onAdvanceStatus({
              nextStatus: nextStatus!,
            })
          }
          disabled={isAdvancing}
        >
          <Text style={styles.detailPrimaryButtonText}>
            {isAdvancing ? '处理中...' : advanceButtonText}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.detailInlineGroup}>
          <Text style={[styles.detailRoute, { color: colors.teal }]}>
            订单已完成
          </Text>
          <Text style={styles.detailMeta}>等待平台结算款项</Text>
        </View>
      )}
    </View>
  );
}

const executionStyles = {
  stepRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    marginBottom: 6,
  },
  stepRowActive: {
    backgroundColor: colors.tealSoft,
    borderWidth: 1,
    borderColor: colors.teal,
  },
  stepIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.border,
  },
  stepIndicatorPast: {
    backgroundColor: colors.teal,
  },
  stepIndicatorActive: {
    backgroundColor: colors.teal,
  },
  stepNumber: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  stepNumberActive: {
    color: '#FFF',
  },
  stepContent: {
    flex: 1,
    gap: 2,
  },
  stepLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  stepLabelActive: {
    color: colors.tealDark,
    fontWeight: '900' as const,
  },
  stepDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
} as const;
