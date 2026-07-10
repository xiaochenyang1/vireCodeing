import { Pressable, Text, View } from 'react-native';

import { styles } from '../../styles';

type CouponAdjustmentSummary = {
  couponTitleText: string;
  couponDiscountText: string;
  payablePriceText: string;
};

export function PublishConfirmationCard({
  pickupAddress,
  deliveryAddress,
  selectedCargoLabel,
  weightText,
  quantityText,
  volumeText,
  selectedVehicleRequirementText,
  pickupTimeText,
  pickupNoteText,
  deliveryNoteText,
  expectedDeliveryTimeText,
  selectedServiceLabels,
  previewPriceText,
  couponAdjustment,
  selectedPaymentMethodLabel,
  descriptionText,
  cargoPhotoCount,
  onConfirmPublish,
  onEdit,
}: {
  pickupAddress: string;
  deliveryAddress: string;
  selectedCargoLabel: string;
  weightText: string;
  quantityText: string;
  volumeText: string;
  selectedVehicleRequirementText: string;
  pickupTimeText: string;
  pickupNoteText: string;
  deliveryNoteText: string;
  expectedDeliveryTimeText: string;
  selectedServiceLabels: string[];
  previewPriceText: string;
  couponAdjustment?: CouponAdjustmentSummary;
  selectedPaymentMethodLabel: string;
  descriptionText: string;
  cargoPhotoCount: number;
  onConfirmPublish: () => void;
  onEdit: () => void;
}) {
  return (
    <View style={styles.draftCard}>
      <Text style={styles.draftSectionTitle}>确认发布订单</Text>
      <Text style={styles.draftNotice}>
        请确认货物、路线、装货时间和价格，确认后订单会进入待接单状态。
      </Text>
      <Text style={styles.draftSectionTitle}>
        {pickupAddress.trim()} → {deliveryAddress.trim()}
      </Text>
      <Text style={styles.draftNotice}>
        {selectedCargoLabel} · {weightText.trim()} · {quantityText.trim()}
      </Text>
      {volumeText.trim() ? (
        <Text style={styles.draftNotice}>{`体积：${volumeText.trim()}`}</Text>
      ) : null}
      <Text style={styles.draftNotice}>
        {`车辆要求：${selectedVehicleRequirementText}`}
      </Text>
      <Text style={styles.draftNotice}>装货时间：{pickupTimeText.trim()}</Text>
      {pickupNoteText.trim() ? (
        <Text style={styles.draftNotice}>
          {`装货备注：${pickupNoteText.trim()}`}
        </Text>
      ) : null}
      {deliveryNoteText.trim() ? (
        <Text style={styles.draftNotice}>
          {`卸货备注：${deliveryNoteText.trim()}`}
        </Text>
      ) : null}
      {expectedDeliveryTimeText.trim() ? (
        <Text style={styles.draftNotice}>
          期望送达：{expectedDeliveryTimeText.trim()}
        </Text>
      ) : null}
      {selectedServiceLabels.length > 0 ? (
        <Text style={styles.draftNotice}>
          增值服务：{selectedServiceLabels.join('、')}
        </Text>
      ) : null}
      <Text style={styles.draftNotice}>价格：{previewPriceText}</Text>
      {couponAdjustment ? (
        <>
          <Text style={styles.draftNotice}>
            {`优惠券：${couponAdjustment.couponTitleText}`}
          </Text>
          <Text style={styles.draftNotice}>
            {`优惠金额：${couponAdjustment.couponDiscountText}`}
          </Text>
          <Text style={styles.draftNotice}>
            {`实付金额：${couponAdjustment.payablePriceText}`}
          </Text>
        </>
      ) : null}
      <Text
        style={styles.draftNotice}
      >{`支付方式：${selectedPaymentMethodLabel}`}</Text>
      {descriptionText.trim() ? (
        <Text style={styles.draftNotice}>
          货物描述：{descriptionText.trim()}
        </Text>
      ) : null}
      {cargoPhotoCount > 0 ? (
        <Text style={styles.draftNotice}>{`货物图片凭证 ${cargoPhotoCount} 张`}</Text>
      ) : null}

      <Pressable
        testID="draft-confirm-publish"
        style={({ pressed }) => [
          styles.draftPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={onConfirmPublish}
      >
        <Text style={styles.draftPrimaryButtonText}>确认发布</Text>
      </Pressable>

      <Pressable
        testID="draft-edit"
        style={styles.draftSecondaryButton}
        onPress={onEdit}
      >
        <Text style={styles.draftSecondaryButtonText}>返回修改</Text>
      </Pressable>
    </View>
  );
}
