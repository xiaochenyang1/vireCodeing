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
  pricingModeOptions,
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
  createDraftPreviewState,
  createDraftPublishInput,
  createRemoveLatestCargoPhotoVoucherChange,
  getSaveDraftNotice,
  toggleDraftValueAddedService,
  type DraftOrderFormState,
} from '../utils/orderDraft';
import {
  getProfileLocalState,
} from '../utils/profileLocalState';

type DraftPlatformFileApi = PlatformFileUploadConfirmationApi &
  Pick<
  ReturnType<typeof createPlatformFileApi>,
    'createUploadIntent'
  >;

function mapPlatformFileToAttachmentRef(
  file: PlatformFileUploadRecord,
  fileName: string,
): FileAttachmentRef {
  return {
    fileId: file.id,
    fileName,
    purpose: file.purpose,
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
            deliveryAddress={deliveryAddress}
            onDeliveryAddressChange={setDeliveryAddress}
            deliveryNoteText={deliveryNoteText}
            onDeliveryNoteTextChange={setDeliveryNoteText}
            deliveryContact={deliveryContact}
            onDeliveryContactChange={setDeliveryContact}
            deliveryPhone={deliveryPhone}
            onDeliveryPhoneChange={setDeliveryPhone}
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

type DraftStringFieldName =
  | 'weightText'
  | 'volumeText'
  | 'quantityText'
  | 'cargoDescription'
  | 'pickupAddress'
  | 'pickupNoteText'
  | 'pickupContact'
  | 'pickupPhone'
  | 'deliveryAddress'
  | 'deliveryNoteText'
  | 'deliveryContact'
  | 'deliveryPhone'
  | 'pickupTimeText'
  | 'expectedDeliveryTimeText'
  | 'insuredValueText'
  | 'priceText';

type DraftBooleanFieldName = 'needTailboard' | 'needTarp';

type DraftEnumFieldName =
  | 'cargoType'
  | 'vehicleRequirement'
  | 'vehicleLengthRequirement'
  | 'pricingMode'
  | 'paymentMethod';

type DraftArrayFieldName = 'valueAddedServiceIds';

type DraftNumberFieldName = 'cargoPhotoCount' | 'loadingWorkerCount';

type DraftConflictFieldName =
  | DraftStringFieldName
  | DraftBooleanFieldName
  | DraftEnumFieldName
  | DraftArrayFieldName
  | DraftNumberFieldName;

type DraftConflictFieldDifference = {
  fieldName: DraftConflictFieldName;
  label: string;
  localValue: string;
  platformValue: string;
};

const draftStringFieldConfigs: Array<{
  fieldName: DraftStringFieldName;
  label: string;
}> = [
  { fieldName: 'weightText', label: '货物重量' },
  { fieldName: 'volumeText', label: '货物体积' },
  { fieldName: 'quantityText', label: '货物数量' },
  { fieldName: 'cargoDescription', label: '货物描述' },
  { fieldName: 'pickupAddress', label: '装货地址' },
  { fieldName: 'pickupNoteText', label: '装货备注' },
  { fieldName: 'pickupContact', label: '装货联系人' },
  { fieldName: 'pickupPhone', label: '装货联系电话' },
  { fieldName: 'deliveryAddress', label: '卸货地址' },
  { fieldName: 'deliveryNoteText', label: '卸货备注' },
  { fieldName: 'deliveryContact', label: '卸货联系人' },
  { fieldName: 'deliveryPhone', label: '卸货联系电话' },
  { fieldName: 'pickupTimeText', label: '装货时间' },
  { fieldName: 'expectedDeliveryTimeText', label: '期望送达时间' },
  { fieldName: 'insuredValueText', label: '保价货值' },
  { fieldName: 'priceText', label: '一口价金额' },
];

const draftBooleanFieldConfigs: Array<{
  fieldName: DraftBooleanFieldName;
  label: string;
}> = [
  { fieldName: 'needTailboard', label: '需要尾板' },
  { fieldName: 'needTarp', label: '需要篷布' },
];

const draftEnumFieldConfigs: Array<{
  fieldName: DraftEnumFieldName;
  label: string;
  options: Array<{ id: string; label: string }>;
}> = [
  { fieldName: 'cargoType', label: '货物类型', options: cargoTypeOptions },
  {
    fieldName: 'vehicleRequirement',
    label: '车型要求',
    options: vehicleRequirementOptions,
  },
  {
    fieldName: 'vehicleLengthRequirement',
    label: '车长要求',
    options: vehicleLengthRequirementOptions,
  },
  { fieldName: 'pricingMode', label: '计价方式', options: pricingModeOptions },
  { fieldName: 'paymentMethod', label: '支付方式', options: paymentMethodOptions },
];

const draftArrayFieldConfigs: Array<{
  fieldName: DraftArrayFieldName;
  label: string;
  options: Array<{ id: string; label: string }>;
}> = [
  {
    fieldName: 'valueAddedServiceIds',
    label: '增值服务',
    options: valueAddedServiceOptions,
  },
];

const draftNumberFieldConfigs: Array<{
  fieldName: DraftNumberFieldName;
  label: string;
  unit: string;
}> = [
  { fieldName: 'cargoPhotoCount', label: '货物图片凭证', unit: '张' },
  { fieldName: 'loadingWorkerCount', label: '装卸工人数', unit: '人' },
];

function createDraftFieldDifferences(
  localDraft: DraftOrderPrefill,
  platformDraft: DraftOrderPrefill,
): DraftConflictFieldDifference[] {
  const stringDifferences = draftStringFieldConfigs.flatMap(fieldConfig => {
    const localValue = localDraft[fieldConfig.fieldName];
    const platformValue = platformDraft[fieldConfig.fieldName];

    if (
      typeof localValue !== 'string' ||
      typeof platformValue !== 'string' ||
      !platformValue.trim() ||
      localValue.trim() === platformValue.trim()
    ) {
      return [];
    }

    return [
      {
        ...fieldConfig,
        localValue: localValue.trim() || '空',
        platformValue: platformValue.trim(),
      },
    ];
  });

  const booleanDifferences = draftBooleanFieldConfigs.flatMap(fieldConfig => {
    const localValue = localDraft[fieldConfig.fieldName];
    const platformValue = platformDraft[fieldConfig.fieldName];

    if (
      typeof localValue !== 'boolean' ||
      typeof platformValue !== 'boolean' ||
      localValue === platformValue
    ) {
      return [];
    }

    return [
      {
        ...fieldConfig,
        localValue: formatDraftBooleanDifference(localValue),
        platformValue: formatDraftBooleanDifference(platformValue),
      },
    ];
  });

  const enumDifferences = draftEnumFieldConfigs.flatMap(fieldConfig => {
    const localValue = localDraft[fieldConfig.fieldName];
    const platformValue = platformDraft[fieldConfig.fieldName];

    if (
      typeof platformValue !== 'string' ||
      !platformValue.trim() ||
      localValue === platformValue
    ) {
      return [];
    }

    return [
      {
        fieldName: fieldConfig.fieldName,
        label: fieldConfig.label,
        localValue:
          typeof localValue === 'string'
            ? formatDraftEnumDifference(fieldConfig.options, localValue)
            : '未选择',
        platformValue: formatDraftEnumDifference(
          fieldConfig.options,
          platformValue,
        ),
      },
    ];
  });

  const arrayDifferences = draftArrayFieldConfigs.flatMap(fieldConfig => {
    const localValue = localDraft[fieldConfig.fieldName];
    const platformValue = platformDraft[fieldConfig.fieldName];

    if (!Array.isArray(platformValue)) {
      return [];
    }

    const localValues = normalizeDraftArrayValues(localValue);
    const platformValues = normalizeDraftArrayValues(platformValue);

    if (areDraftArrayValuesEqual(localValues, platformValues)) {
      return [];
    }

    return [
      {
        fieldName: fieldConfig.fieldName,
        label: fieldConfig.label,
        localValue: formatDraftArrayDifference(
          fieldConfig.options,
          localValues,
        ),
        platformValue: formatDraftArrayDifference(
          fieldConfig.options,
          platformValues,
        ),
      },
    ];
  });

  const numberDifferences = draftNumberFieldConfigs.flatMap(fieldConfig => {
    const localValue = localDraft[fieldConfig.fieldName];
    const platformValue = platformDraft[fieldConfig.fieldName];

    if (
      typeof platformValue !== 'number' ||
      !Number.isFinite(platformValue) ||
      localValue === platformValue
    ) {
      return [];
    }

    return [
      {
        fieldName: fieldConfig.fieldName,
        label: fieldConfig.label,
        localValue:
          typeof localValue === 'number' && Number.isFinite(localValue)
            ? formatDraftNumberDifference(localValue, fieldConfig.unit)
            : '未设置',
        platformValue: formatDraftNumberDifference(
          platformValue,
          fieldConfig.unit,
        ),
      },
    ];
  });

  return [
    ...stringDifferences,
    ...booleanDifferences,
    ...enumDifferences,
    ...arrayDifferences,
    ...numberDifferences,
  ];
}

function getDraftConflictFieldLabel(fieldName: DraftConflictFieldName) {
  return (
    [
      ...draftStringFieldConfigs,
      ...draftBooleanFieldConfigs,
      ...draftEnumFieldConfigs,
      ...draftArrayFieldConfigs,
      ...draftNumberFieldConfigs,
    ].find(
      fieldConfig => fieldConfig.fieldName === fieldName,
    )
      ?.label ?? '草稿字段'
  );
}

function formatDraftBooleanDifference(value: boolean) {
  return value ? '是' : '否';
}

function formatDraftEnumDifference(
  options: Array<{ id: string; label: string }>,
  value: string,
) {
  return options.find(option => option.id === value)?.label ?? value;
}

function normalizeDraftArrayValues(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter((item): item is string => typeof item === 'string'),
    ),
  ).sort();
}

function areDraftArrayValuesEqual(
  firstValues: string[],
  secondValues: string[],
) {
  return (
    firstValues.length === secondValues.length &&
    firstValues.every((value, index) => value === secondValues[index])
  );
}

function formatDraftArrayDifference(
  options: Array<{ id: string; label: string }>,
  values: string[],
) {
  if (!values.length) {
    return '未选择';
  }

  const optionLabels = options
    .filter(option => values.includes(option.id))
    .map(option => option.label);
  const unknownValues = values.filter(
    value => !options.some(option => option.id === value),
  );

  return [...optionLabels, ...unknownValues].join('、');
}

function formatDraftNumberDifference(value: number, unit: string) {
  return `${value} ${unit}`;
}

function mergeMissingDraftPrefillFields(
  localDraft: DraftOrderPrefill,
  platformDraft: DraftOrderPrefill,
): DraftOrderPrefill {
  const mergedDraft: DraftOrderPrefill = { ...localDraft };

  draftStringFieldConfigs.forEach(({ fieldName }) => {
    const localValue = localDraft[fieldName];
    const platformValue = platformDraft[fieldName];

    if (
      isBlankDraftString(localValue) &&
      typeof platformValue === 'string' &&
      platformValue.trim()
    ) {
      Object.assign(mergedDraft, { [fieldName]: platformValue });
    }
  });

  if (
    (!localDraft.valueAddedServiceIds?.length) &&
    platformDraft.valueAddedServiceIds?.length
  ) {
    mergedDraft.valueAddedServiceIds = [...platformDraft.valueAddedServiceIds];
  }

  return mergedDraft;
}

function isBlankDraftString(value: unknown) {
  return typeof value !== 'string' || !value.trim();
}
