import { Pressable, ScrollView, Text, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';

import { AddressSection } from './order-draft/AddressSection';
import { CargoSection } from './order-draft/CargoSection';
import { DraftPublishActionsCard } from './order-draft/DraftPublishActionsCard';
import { PriceSection } from './order-draft/PriceSection';
import { PublishConfirmationCard } from './order-draft/PublishConfirmationCard';
import { ValueAddedServicesSection } from './order-draft/ValueAddedServicesSection';
import { VehicleTimeSection } from './order-draft/VehicleTimeSection';
import {
  cargoTypeOptions,
  paymentMethodOptions,
  valueAddedServiceOptions,
  vehicleLengthRequirementOptions,
  vehicleRequirementOptions,
} from '../data/mockData';
import { styles } from '../styles';
import type {
  CargoTypeOption,
  DraftOrderInput,
  DraftOrderPrefill,
  FileAttachmentRef,
  PaymentMethod,
  PricingMode,
  ValueAddedServiceOption,
  VehicleLengthRequirementOption,
  VehicleRequirementOption,
} from '../types';
import type {
  PlatformFileUploadConfirmationApi,
  PlatformFileUploadRecord,
  createPlatformFileApi,
} from '../services/platformFileApi';
import type { createPlatformMapsApi } from '../services/platformMapsApi';
import { confirmPlatformFileUploadIntent } from '../services/platformFileApi';
import {
  type DraftSyncState,
} from '../utils/draftStorage';
import {
  createAddCargoPhotoVoucherChange,
  createDraftCouponState,
  createDraftConfirmationDisplay,
  createDraftChangeSnapshot,
  createDraftFormState,
  createDraftInitialFormState,
  createLocalValueAddedServiceEstimate,
  createDraftPreviewState,
  createDraftPublishInput,
  createRemoveLatestCargoPhotoVoucherChange,
  getSaveDraftNotice,
  toggleDraftValueAddedService,
  type DraftOrderFormState,
} from '../utils/orderDraft';
import {
  createDraftFieldDifferences,
  getDraftConflictFieldLabel,
  mergeMissingDraftPrefillFields,
  type DraftConflictFieldName,
} from '../utils/draftConflict';
import {
  getProfileLocalState,
} from '../utils/profileLocalState';
import {
  createLocalDraftAddressPreview,
  createPlatformDraftAddressPreview,
  getDraftAddressPreviewErrorNotice,
  getDraftAddressPreviewSuccessNotice,
  validateDraftAddressPreviewInput,
  type DraftAddressPreview,
} from '../utils/orderDraftAddress';

type DraftPlatformFileApi = PlatformFileUploadConfirmationApi &
  Pick<
  ReturnType<typeof createPlatformFileApi>,
    'createUploadIntent'
  >;
type DraftPlatformMapsApi = Pick<
  ReturnType<typeof createPlatformMapsApi>,
  'geocode'
>;

function mapPlatformFileToAttachmentRef(
  file: PlatformFileUploadRecord,
  fileName: string,
): FileAttachmentRef {
  return {
    fileId: file.id,
    fileName,
    purpose: 'cargo',
    status: file.status,
    objectKey: file.objectKey,
    publicUrl: file.publicUrl,
  };
}

export function OrderDraftScreen({
  onBack,
  now,
  prefill,
  conflictPlatformDraft,
  draftConflictNoticeText,
  draftSyncState,
  onDraftChange,
  onSaveDraft,
  onRetryDraftSync,
  onMarkDraftSyncFailed,
  platformFileApi,
  platformMapsApi,
  usesPlatformOrderApi = false,
  onPublish,
}: {
  onBack: () => void;
  now: number;
  prefill?: DraftOrderPrefill;
  conflictPlatformDraft?: DraftOrderPrefill;
  draftConflictNoticeText?: string;
  draftSyncState?: DraftSyncState;
  onDraftChange?: (draftOrder: DraftOrderPrefill) => void;
  onSaveDraft?: (draftOrder: DraftOrderPrefill) => void;
  onRetryDraftSync?: () => void;
  onMarkDraftSyncFailed?: () => void;
  platformFileApi?: DraftPlatformFileApi;
  platformMapsApi?: DraftPlatformMapsApi;
  usesPlatformOrderApi?: boolean;
  onPublish: (draftOrder: DraftOrderInput) => void;
}) {
  const initialDraftFormState = createDraftInitialFormState(prefill);
  const [cargoType, setCargoType] = useState<CargoTypeOption['id']>(
    initialDraftFormState.cargoType,
  );
  const [weightText, setWeightText] = useState(
    initialDraftFormState.weightText,
  );
  const [volumeText, setVolumeText] = useState(
    initialDraftFormState.volumeText,
  );
  const [quantityText, setQuantityText] = useState(
    initialDraftFormState.quantityText,
  );
  const [descriptionText, setDescriptionText] = useState(
    initialDraftFormState.cargoDescription,
  );
  const [cargoPhotoCount, setCargoPhotoCount] = useState(
    initialDraftFormState.cargoPhotoCount,
  );
  const cargoPhotoCountRef = useRef(initialDraftFormState.cargoPhotoCount);
  const [cargoPhotoFiles, setCargoPhotoFiles] = useState<FileAttachmentRef[]>(
    initialDraftFormState.cargoPhotoFiles,
  );
  const [pickupAddress, setPickupAddress] = useState(
    initialDraftFormState.pickupAddress,
  );
  const [pickupNoteText, setPickupNoteText] = useState(
    initialDraftFormState.pickupNoteText,
  );
  const [pickupContact, setPickupContact] = useState(
    initialDraftFormState.pickupContact,
  );
  const [pickupPhone, setPickupPhone] = useState(
    initialDraftFormState.pickupPhone,
  );
  const [deliveryAddress, setDeliveryAddress] = useState(
    initialDraftFormState.deliveryAddress,
  );
  const [deliveryNoteText, setDeliveryNoteText] = useState(
    initialDraftFormState.deliveryNoteText,
  );
  const [deliveryContact, setDeliveryContact] = useState(
    initialDraftFormState.deliveryContact,
  );
  const [deliveryPhone, setDeliveryPhone] = useState(
    initialDraftFormState.deliveryPhone,
  );
  const [pickupAddressPreview, setPickupAddressPreview] =
    useState<DraftAddressPreview>();
  const [deliveryAddressPreview, setDeliveryAddressPreview] =
    useState<DraftAddressPreview>();
  const [isResolvingPickupAddress, setIsResolvingPickupAddress] =
    useState(false);
  const [isResolvingDeliveryAddress, setIsResolvingDeliveryAddress] =
    useState(false);
  const [vehicleRequirement, setVehicleRequirement] =
    useState<VehicleRequirementOption['id']>(
      initialDraftFormState.vehicleRequirement,
    );
  const [vehicleLengthRequirement, setVehicleLengthRequirement] =
    useState<VehicleLengthRequirementOption['id']>(
      initialDraftFormState.vehicleLengthRequirement,
    );
  const [needTailboard, setNeedTailboard] = useState(
    initialDraftFormState.needTailboard,
  );
  const [needTarp, setNeedTarp] = useState(initialDraftFormState.needTarp);
  const [pickupTimeText, setPickupTimeText] = useState(
    initialDraftFormState.pickupTimeText,
  );
  const [expectedDeliveryTimeText, setExpectedDeliveryTimeText] = useState(
    initialDraftFormState.expectedDeliveryTimeText,
  );
  const [valueAddedServiceIds, setValueAddedServiceIds] = useState<
    ValueAddedServiceOption['id'][]
  >(initialDraftFormState.valueAddedServiceIds);
  const [loadingWorkerCount, setLoadingWorkerCount] = useState(
    initialDraftFormState.loadingWorkerCount,
  );
  const [insuredValueText, setInsuredValueText] = useState(
    initialDraftFormState.insuredValueText,
  );
  const [pricingMode, setPricingMode] = useState<PricingMode>(
    initialDraftFormState.pricingMode,
  );
  const [priceText, setPriceText] = useState(
    initialDraftFormState.priceText,
  );
  const [selectedCouponId, setSelectedCouponId] = useState(
    initialDraftFormState.selectedCouponId,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initialDraftFormState.paymentMethod,
  );
  const [notice, setNotice] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(
    initialDraftFormState.editingOrderId,
  );
  const prefillCouponId = initialDraftFormState.selectedCouponId;
  const [prefillNoticeText, setPrefillNoticeText] = useState(
    initialDraftFormState.noticeText,
  );
  const [reorderSourceOrderId, setReorderSourceOrderId] = useState(
    initialDraftFormState.reorderSourceOrderId,
  );
  const [hasResolvedDraftConflict, setHasResolvedDraftConflict] =
    useState(false);
  const usableCoupons = useMemo(
    () =>
      getProfileLocalState().coupons.filter(
        item => item.statusText === '可使用' || item.id === prefillCouponId,
      ),
    [prefillCouponId],
  );
  const { selectedCoupon, couponAdjustment } = useMemo(
    () =>
      createDraftCouponState({
        pricingMode,
        selectedCouponId,
        usableCoupons,
        priceText,
      }),
    [priceText, pricingMode, selectedCouponId, usableCoupons],
  );
  const draftFormState = useMemo<DraftOrderFormState>(
    () =>
      createDraftFormState({
        cargoType,
        weightText,
        volumeText,
        quantityText,
        cargoDescription: descriptionText,
        cargoPhotoCount,
        cargoPhotoFiles,
        pickupAddress,
        pickupNoteText,
        pickupContact,
        pickupPhone,
        deliveryAddress,
        deliveryNoteText,
        deliveryContact,
        deliveryPhone,
        vehicleRequirement,
        vehicleLengthRequirement,
        needTailboard,
        needTarp,
        pickupTimeText,
        expectedDeliveryTimeText,
        valueAddedServiceIds,
        loadingWorkerCount,
        insuredValueText,
        pricingMode,
        priceText,
        paymentMethod,
        selectedCouponId,
        couponAdjustment,
        editingOrderId,
        noticeText: prefillNoticeText,
        reorderSourceOrderId,
      }),
    [
      cargoPhotoCount,
      cargoPhotoFiles,
      cargoType,
      deliveryAddress,
      deliveryContact,
      deliveryNoteText,
      deliveryPhone,
      descriptionText,
      editingOrderId,
      expectedDeliveryTimeText,
      insuredValueText,
      loadingWorkerCount,
      needTailboard,
      needTarp,
      paymentMethod,
      pickupAddress,
      pickupContact,
      pickupNoteText,
      pickupPhone,
      pickupTimeText,
      priceText,
      pricingMode,
      prefillNoticeText,
      quantityText,
      reorderSourceOrderId,
      selectedCouponId,
      couponAdjustment,
      valueAddedServiceIds,
      vehicleLengthRequirement,
      vehicleRequirement,
      volumeText,
      weightText,
    ],
  );
  const conflictFieldDifferences = useMemo(
    () =>
      conflictPlatformDraft && !hasResolvedDraftConflict
        ? createDraftFieldDifferences(
            createDraftChangeSnapshot(draftFormState),
            conflictPlatformDraft,
          )
        : [],
    [conflictPlatformDraft, draftFormState, hasResolvedDraftConflict],
  );
  const visiblePrefillNoticeText = hasResolvedDraftConflict
    ? prefillNoticeText
    : draftConflictNoticeText || prefillNoticeText;

  useEffect(() => {
    if (conflictPlatformDraft) {
      setHasResolvedDraftConflict(false);
    }
  }, [conflictPlatformDraft]);

  useEffect(() => {
    onDraftChange?.(createDraftChangeSnapshot(draftFormState));
  }, [draftFormState, onDraftChange]);

  useEffect(() => {
    if (
      pickupAddressPreview &&
      pickupAddress.trim() !== pickupAddressPreview.resolvedAddressText.trim()
    ) {
      setPickupAddressPreview(undefined);
    }
  }, [pickupAddress, pickupAddressPreview]);

  useEffect(() => {
    if (
      deliveryAddressPreview &&
      deliveryAddress.trim() !== deliveryAddressPreview.resolvedAddressText.trim()
    ) {
      setDeliveryAddressPreview(undefined);
    }
  }, [deliveryAddress, deliveryAddressPreview]);

  const saveDraft = () => {
    onSaveDraft?.(createDraftChangeSnapshot(draftFormState));
    setNotice(getSaveDraftNotice(weightText));
  };

  const previewDraft = () => {
    const draftPreviewState = createDraftPreviewState(draftFormState, {
      now,
      selectedCoupon,
    });
    setNotice(draftPreviewState.notice);
    setIsConfirming(draftPreviewState.isConfirming);
  };

  const confirmPublish = () => {
    onPublish(createDraftPublishInput(draftFormState));
  };

  const selectedCargoLabel =
    cargoTypeOptions.find(option => option.id === cargoType)?.label ?? '其他';
  const draftConfirmationDisplay = useMemo(
    () =>
      createDraftConfirmationDisplay(draftFormState, {
        vehicleRequirementOptions,
        vehicleLengthRequirementOptions,
        valueAddedServiceOptions,
        paymentMethodOptions,
      }),
    [draftFormState],
  );
  const draftValueAddedServiceEstimate = useMemo(
    () => createLocalValueAddedServiceEstimate(draftFormState),
    [draftFormState],
  );

  const toggleValueAddedService = (serviceId: ValueAddedServiceOption['id']) => {
    setValueAddedServiceIds(currentServiceIds =>
      toggleDraftValueAddedService(currentServiceIds, serviceId),
    );
  };

  const addCargoPhotoVoucher = async () => {
    const cargoPhotoChange = createAddCargoPhotoVoucherChange(
      cargoPhotoCountRef.current,
    );
    const nextCargoPhotoCount = cargoPhotoChange.cargoPhotoCount;
    setNotice(cargoPhotoChange.notice);

    if (nextCargoPhotoCount === cargoPhotoCountRef.current) {
      return;
    }

    cargoPhotoCountRef.current = nextCargoPhotoCount;
    setCargoPhotoCount(nextCargoPhotoCount);

    if (!platformFileApi) {
      return;
    }

    const fileName = `货物图片凭证${nextCargoPhotoCount}.png`;

    try {
      const intent = await platformFileApi.createUploadIntent({
        purpose: 'cargo',
        fileName,
        contentType: 'image/png',
        byteSize: 2048,
      });
      const uploadedFile = await confirmPlatformFileUploadIntent(
        platformFileApi,
        intent,
      );

      setCargoPhotoFiles(currentFiles => [
        ...currentFiles.slice(0, nextCargoPhotoCount - 1),
        mapPlatformFileToAttachmentRef(uploadedFile, fileName),
      ]);
      setNotice('货物图片凭证已关联平台文件对象。');
    } catch {
      setNotice('货物图片凭证上传失败，已保留本地占位。');
    }
  };

  const removeLatestCargoPhotoVoucher = () => {
    const cargoPhotoChange = createRemoveLatestCargoPhotoVoucherChange(
      cargoPhotoCountRef.current,
    );
    cargoPhotoCountRef.current = cargoPhotoChange.cargoPhotoCount;
    setNotice(cargoPhotoChange.notice);
    setCargoPhotoFiles(currentFiles =>
      currentFiles.slice(0, cargoPhotoChange.cargoPhotoCount),
    );
    setCargoPhotoCount(cargoPhotoChange.cargoPhotoCount);
  };

  const previewAddress = async ({
    addressLabel,
    addressText,
    setPreview,
    onAddressChange,
    setIsResolving,
  }: {
    addressLabel: '装货地址' | '卸货地址';
    addressText: string;
    setPreview: (preview?: DraftAddressPreview) => void;
    onAddressChange: (value: string) => void;
    setIsResolving: (value: boolean) => void;
  }) => {
    const validation = validateDraftAddressPreviewInput(
      addressLabel,
      addressText,
    );

    if (validation.notice || !validation.trimmedAddress) {
      setNotice(validation.notice);
      return;
    }

    setIsResolving(true);

    if (!platformMapsApi) {
      setPreview(createLocalDraftAddressPreview(validation.trimmedAddress));
      setNotice(getDraftAddressPreviewSuccessNotice(addressLabel, 'local'));
      setIsResolving(false);
      return;
    }

    try {
      const geocodeResult = await platformMapsApi.geocode(
        validation.trimmedAddress,
      );
      const nextPreview = createPlatformDraftAddressPreview(geocodeResult);

      setPreview(nextPreview);
      onAddressChange(nextPreview.resolvedAddressText);
      setNotice(getDraftAddressPreviewSuccessNotice(addressLabel, 'platform'));
    } catch (error) {
      setNotice(getDraftAddressPreviewErrorNotice(addressLabel, error));
    } finally {
      setIsResolving(false);
    }
  };

  const applyDraftPrefill = (nextPrefill: DraftOrderPrefill) => {
    const nextDraftFormState = createDraftInitialFormState(nextPrefill);

    setCargoType(nextDraftFormState.cargoType);
    setWeightText(nextDraftFormState.weightText);
    setVolumeText(nextDraftFormState.volumeText);
    setQuantityText(nextDraftFormState.quantityText);
    setDescriptionText(nextDraftFormState.cargoDescription);
    cargoPhotoCountRef.current = nextDraftFormState.cargoPhotoCount;
    setCargoPhotoCount(nextDraftFormState.cargoPhotoCount);
    setCargoPhotoFiles(nextDraftFormState.cargoPhotoFiles);
    setPickupAddress(nextDraftFormState.pickupAddress);
    setPickupNoteText(nextDraftFormState.pickupNoteText);
    setPickupContact(nextDraftFormState.pickupContact);
    setPickupPhone(nextDraftFormState.pickupPhone);
    setDeliveryAddress(nextDraftFormState.deliveryAddress);
    setDeliveryNoteText(nextDraftFormState.deliveryNoteText);
    setDeliveryContact(nextDraftFormState.deliveryContact);
    setDeliveryPhone(nextDraftFormState.deliveryPhone);
    setVehicleRequirement(nextDraftFormState.vehicleRequirement);
    setVehicleLengthRequirement(nextDraftFormState.vehicleLengthRequirement);
    setNeedTailboard(nextDraftFormState.needTailboard);
    setNeedTarp(nextDraftFormState.needTarp);
    setPickupTimeText(nextDraftFormState.pickupTimeText);
    setExpectedDeliveryTimeText(nextDraftFormState.expectedDeliveryTimeText);
    setValueAddedServiceIds(nextDraftFormState.valueAddedServiceIds);
    setLoadingWorkerCount(nextDraftFormState.loadingWorkerCount);
    setInsuredValueText(nextDraftFormState.insuredValueText);
    setPricingMode(nextDraftFormState.pricingMode);
    setPriceText(nextDraftFormState.priceText);
    setSelectedCouponId(nextDraftFormState.selectedCouponId);
    setPaymentMethod(nextDraftFormState.paymentMethod);
    setEditingOrderId(nextDraftFormState.editingOrderId);
    setPrefillNoticeText(nextDraftFormState.noticeText);
    setReorderSourceOrderId(nextDraftFormState.reorderSourceOrderId);
    setNotice(nextDraftFormState.noticeText ?? '');
    setIsConfirming(false);
  };

  const useConflictPlatformDraft = () => {
    if (!conflictPlatformDraft) {
      return;
    }

    applyDraftPrefill(conflictPlatformDraft);
    setHasResolvedDraftConflict(true);
  };

  const keepLocalDraftOverPlatformDraft = () => {
    const keepLocalNotice = '已保留本地发单草稿并同步到服务端。';

    onSaveDraft?.({
      ...createDraftChangeSnapshot(draftFormState),
      noticeText: keepLocalNotice,
    });
    setNotice(keepLocalNotice);
    setHasResolvedDraftConflict(true);
    setIsConfirming(false);
  };

  const mergeMissingPlatformDraftFields = () => {
    if (!conflictPlatformDraft) {
      return;
    }

    applyDraftPrefill({
      ...mergeMissingDraftPrefillFields(
        createDraftChangeSnapshot(draftFormState),
        conflictPlatformDraft,
      ),
      noticeText: '已合并服务端草稿缺失字段，请确认后保存。',
    });
    setHasResolvedDraftConflict(true);
  };

  const applyPlatformDraftField = (fieldName: DraftConflictFieldName) => {
    if (!conflictPlatformDraft) {
      return;
    }

    const fieldLabel = getDraftConflictFieldLabel(fieldName);
    const nextDraftPrefill: DraftOrderPrefill = {
      ...createDraftChangeSnapshot(draftFormState),
      [fieldName]: conflictPlatformDraft[fieldName],
    };
    const hasRemainingFieldDifferences =
      createDraftFieldDifferences(nextDraftPrefill, conflictPlatformDraft)
        .length > 0;

    applyDraftPrefill({
      ...nextDraftPrefill,
      noticeText: hasRemainingFieldDifferences
        ? `已采用服务端草稿字段：${fieldLabel}。`
        : `已采用服务端草稿字段：${fieldLabel}，草稿冲突已处理完。`,
    });

    if (!hasRemainingFieldDifferences) {
      setHasResolvedDraftConflict(true);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.draftContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.draftTopBar}>
        <Pressable
          testID="draft-back"
          style={styles.draftBackButton}
          onPress={onBack}
        >
          <Text style={styles.draftBackText}>返回首页</Text>
        </Pressable>
        <View style={styles.draftTitleGroup}>
          <Text style={styles.draftKicker}>发布订单</Text>
          <Text style={styles.draftTitle}>货物信息</Text>
        </View>
        <View style={styles.draftBadge}>
          <Text style={styles.draftBadgeText}>本地发单</Text>
        </View>
      </View>

      <View style={styles.draftStepper}>
        {['货物', '地址', '车辆', '时间', '价格'].map(stepLabel => {
          return (
            <View
              key={stepLabel}
              style={[styles.draftStep, styles.draftStepActive]}
            >
              <Text style={[styles.draftStepText, styles.draftStepTextActive]}>
                {stepLabel}
              </Text>
            </View>
          );
        })}
      </View>

      {visiblePrefillNoticeText ? (
        <View style={styles.draftPrefillNotice}>
          <Text style={styles.draftPrefillNoticeText}>
            {visiblePrefillNoticeText}
          </Text>
          {conflictPlatformDraft && !hasResolvedDraftConflict ? (
            <>
              {conflictFieldDifferences.map(difference => (
                <View
                  key={difference.fieldName}
                  style={styles.draftPrefillNoticeAction}
                >
                  <Text style={styles.draftPrefillNoticeText}>
                    {difference.label}
                  </Text>
                  <Text style={styles.detailMeta}>
                    {`本地：${difference.localValue}`}
                  </Text>
                  <Text style={styles.detailMeta}>
                    {`服务端：${difference.platformValue}`}
                  </Text>
                  <Pressable
                    testID={`draft-use-platform-field-${difference.fieldName}`}
                    style={[
                      styles.draftSecondaryButton,
                      styles.draftPrefillNoticeAction,
                    ]}
                    onPress={() =>
                      applyPlatformDraftField(difference.fieldName)
                    }
                  >
                    <Text style={styles.draftSecondaryButtonText}>
                      使用服务端字段
                    </Text>
                  </Pressable>
                </View>
              ))}
              <Pressable
                testID="draft-merge-platform-draft"
                style={[
                  styles.draftSecondaryButton,
                  styles.draftPrefillNoticeAction,
                ]}
                onPress={mergeMissingPlatformDraftFields}
              >
                <Text style={styles.draftSecondaryButtonText}>
                  合并缺失字段
                </Text>
              </Pressable>
              <Pressable
                testID="draft-keep-local-draft"
                style={[
                  styles.draftSecondaryButton,
                  styles.draftPrefillNoticeAction,
                ]}
                onPress={keepLocalDraftOverPlatformDraft}
              >
                <Text style={styles.draftSecondaryButtonText}>
                  保留本地草稿
                </Text>
              </Pressable>
              <Pressable
                testID="draft-use-platform-draft"
                style={[
                  styles.draftSecondaryButton,
                  styles.draftPrefillNoticeAction,
                ]}
                onPress={useConflictPlatformDraft}
              >
                <Text style={styles.draftSecondaryButtonText}>
                  使用服务端草稿
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}

      {isConfirming ? (
        <PublishConfirmationCard
          pickupAddress={pickupAddress}
          deliveryAddress={deliveryAddress}
          selectedCargoLabel={selectedCargoLabel}
          weightText={weightText}
          quantityText={quantityText}
          volumeText={volumeText}
          selectedVehicleRequirementText={
            draftConfirmationDisplay.selectedVehicleRequirementText
          }
          pickupTimeText={pickupTimeText}
          pickupNoteText={pickupNoteText}
          deliveryNoteText={deliveryNoteText}
          expectedDeliveryTimeText={expectedDeliveryTimeText}
          selectedServiceLabels={draftConfirmationDisplay.selectedServiceLabels}
          serviceEstimate={draftValueAddedServiceEstimate}
          previewPriceText={draftConfirmationDisplay.previewPriceText}
          couponAdjustment={couponAdjustment}
          selectedPaymentMethodLabel={
            draftConfirmationDisplay.selectedPaymentMethodLabel
          }
          descriptionText={descriptionText}
          cargoPhotoCount={cargoPhotoCount}
          onConfirmPublish={confirmPublish}
          onEdit={() => setIsConfirming(false)}
        />
      ) : (
        <>
          <CargoSection
            cargoType={cargoType}
            onCargoTypeChange={setCargoType}
            weightText={weightText}
            onWeightTextChange={setWeightText}
            volumeText={volumeText}
            onVolumeTextChange={setVolumeText}
            quantityText={quantityText}
            onQuantityTextChange={setQuantityText}
            descriptionText={descriptionText}
            onDescriptionTextChange={setDescriptionText}
            cargoPhotoCount={cargoPhotoCount}
            cargoPhotoFiles={cargoPhotoFiles}
            onAddCargoPhotoVoucher={addCargoPhotoVoucher}
            onRemoveLatestCargoPhotoVoucher={removeLatestCargoPhotoVoucher}
          />

          <AddressSection
            pickupAddress={pickupAddress}
            onPickupAddressChange={setPickupAddress}
            pickupNoteText={pickupNoteText}
            onPickupNoteTextChange={setPickupNoteText}
            pickupContact={pickupContact}
            onPickupContactChange={setPickupContact}
            pickupPhone={pickupPhone}
            onPickupPhoneChange={setPickupPhone}
            pickupAddressPreview={pickupAddressPreview}
            isResolvingPickupAddress={isResolvingPickupAddress}
            onPreviewPickupAddress={addressText => {
              previewAddress({
                addressLabel: '装货地址',
                addressText,
                setPreview: setPickupAddressPreview,
                onAddressChange: setPickupAddress,
                setIsResolving: setIsResolvingPickupAddress,
              }).catch(() => undefined);
            }}
            deliveryAddress={deliveryAddress}
            onDeliveryAddressChange={setDeliveryAddress}
            deliveryNoteText={deliveryNoteText}
            onDeliveryNoteTextChange={setDeliveryNoteText}
            deliveryContact={deliveryContact}
            onDeliveryContactChange={setDeliveryContact}
            deliveryPhone={deliveryPhone}
            onDeliveryPhoneChange={setDeliveryPhone}
            deliveryAddressPreview={deliveryAddressPreview}
            isResolvingDeliveryAddress={isResolvingDeliveryAddress}
            onPreviewDeliveryAddress={addressText => {
              previewAddress({
                addressLabel: '卸货地址',
                addressText,
                setPreview: setDeliveryAddressPreview,
                onAddressChange: setDeliveryAddress,
                setIsResolving: setIsResolvingDeliveryAddress,
              }).catch(() => undefined);
            }}
            platformMapsApi={platformMapsApi}
          />

          <VehicleTimeSection
            vehicleRequirement={vehicleRequirement}
            onVehicleRequirementChange={setVehicleRequirement}
            vehicleLengthRequirement={vehicleLengthRequirement}
            onVehicleLengthRequirementChange={setVehicleLengthRequirement}
            needTailboard={needTailboard}
            onNeedTailboardToggle={() =>
              setNeedTailboard(currentNeedTailboard => !currentNeedTailboard)
            }
            needTarp={needTarp}
            onNeedTarpToggle={() =>
              setNeedTarp(currentNeedTarp => !currentNeedTarp)
            }
            pickupTimeText={pickupTimeText}
            onPickupTimeTextChange={setPickupTimeText}
            expectedDeliveryTimeText={expectedDeliveryTimeText}
            onExpectedDeliveryTimeTextChange={setExpectedDeliveryTimeText}
          />

          <ValueAddedServicesSection
            valueAddedServiceIds={valueAddedServiceIds}
            onToggleValueAddedService={toggleValueAddedService}
            loadingWorkerCount={loadingWorkerCount}
            onLoadingWorkerCountChange={setLoadingWorkerCount}
            insuredValueText={insuredValueText}
            onInsuredValueTextChange={setInsuredValueText}
            serviceEstimate={draftValueAddedServiceEstimate}
          />

          <PriceSection
            pricingMode={pricingMode}
            onPricingModeChange={setPricingMode}
            priceText={priceText}
            onPriceTextChange={setPriceText}
            coupons={usableCoupons}
            selectedCouponId={selectedCouponId}
            onSelectedCouponChange={setSelectedCouponId}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            usesPlatformOrderApi={usesPlatformOrderApi}
          />

          <DraftPublishActionsCard
            notice={notice}
            draftSyncState={draftSyncState}
            onRetryDraftSync={onRetryDraftSync}
            onMarkDraftSyncFailed={onMarkDraftSyncFailed}
            onSaveDraft={saveDraft}
            onPreviewDraft={previewDraft}
          />
        </>
      )}
    </ScrollView>
  );
}
