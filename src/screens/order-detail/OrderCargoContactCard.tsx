import { Pressable, Text, View } from 'react-native';

import { styles } from '../../styles';
import type { RecentOrder } from '../../types';
import { maskPhone } from '../../utils/order';

export function OrderCargoContactCard({
  order,
  vehicleRequirementText,
  onCallContact,
}: {
  order: RecentOrder;
  vehicleRequirementText: string;
  onCallContact: (
    contactType: '装货联系人' | '卸货联系人',
    contactName?: string,
    phone?: string,
  ) => void;
}) {
  return (
    <>
      <View style={styles.detailGrid}>
        <View style={styles.detailInfoCard}>
          <Text style={styles.detailInfoLabel}>货物</Text>
          <Text style={styles.detailInfoValue}>{order.cargoType}</Text>
          <Text style={styles.detailInfoHint}>{order.weightText}</Text>
        </View>
        <View style={styles.detailInfoCard}>
          <Text style={styles.detailInfoLabel}>车辆要求</Text>
          <Text style={styles.detailInfoValue}>{vehicleRequirementText}</Text>
          <Text style={styles.detailInfoHint}>{order.priceText}</Text>
        </View>
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.draftSectionTitle}>联系人</Text>
        <Text style={styles.detailMeta}>
          装货：{order.pickupContact ?? '待补充'}{' '}
          {order.pickupPhone ? maskPhone(order.pickupPhone) : ''}
        </Text>
        {order.pickupNoteText ? (
          <Text style={styles.detailMeta}>
            {`装货备注：${order.pickupNoteText}`}
          </Text>
        ) : null}
        <Text style={styles.detailMeta}>
          卸货：{order.deliveryContact ?? '待补充'}{' '}
          {order.deliveryPhone ? maskPhone(order.deliveryPhone) : ''}
        </Text>
        {order.deliveryNoteText ? (
          <Text style={styles.detailMeta}>
            {`卸货备注：${order.deliveryNoteText}`}
          </Text>
        ) : null}
        <View style={styles.draftChoiceGrid}>
          {order.pickupPhone ? (
            <Pressable
              testID="order-contact-call-pickup"
              style={styles.detailSecondaryButton}
              onPress={() =>
                onCallContact(
                  '装货联系人',
                  order.pickupContact,
                  order.pickupPhone,
                )
              }
            >
              <Text style={styles.detailSecondaryButtonText}>
                拨打装货联系人
              </Text>
            </Pressable>
          ) : null}
          {order.deliveryPhone ? (
            <Pressable
              testID="order-contact-call-delivery"
              style={styles.detailSecondaryButton}
              onPress={() =>
                onCallContact(
                  '卸货联系人',
                  order.deliveryContact,
                  order.deliveryPhone,
                )
              }
            >
              <Text style={styles.detailSecondaryButtonText}>
                拨打卸货联系人
              </Text>
            </Pressable>
          ) : null}
        </View>
        {order.quantityText ? (
          <Text style={styles.detailMeta}>数量：{order.quantityText}</Text>
        ) : null}
        {order.volumeText ? (
          <Text style={styles.detailMeta}>{`体积：${order.volumeText}`}</Text>
        ) : null}
        {order.cargoPhotoCount ? (
          <Text style={styles.detailMeta}>
            {`货物图片凭证 ${order.cargoPhotoCount} 张`}
          </Text>
        ) : null}
        {order.valueAddedServicesText ? (
          <Text style={styles.detailMeta}>
            增值服务：{order.valueAddedServicesText}
          </Text>
        ) : null}
        {order.paymentMethodText ? (
          <Text
            style={styles.detailMeta}
          >{`支付方式：${order.paymentMethodText}`}</Text>
        ) : null}
        {order.couponTitleText ? (
          <>
            {order.originalPriceText ? (
              <Text style={styles.detailMeta}>
                {`原价：${order.originalPriceText}`}
              </Text>
            ) : null}
            <Text style={styles.detailMeta}>
              {`优惠券：${order.couponTitleText}`}
            </Text>
            {order.couponDiscountText ? (
              <Text style={styles.detailMeta}>
                {`优惠金额：${order.couponDiscountText}`}
              </Text>
            ) : null}
            {order.payablePriceText ? (
              <Text style={styles.detailMeta}>
                {`实付金额：${order.payablePriceText}`}
              </Text>
            ) : null}
          </>
        ) : null}
        {order.paymentMethodText === '在线支付' ? (
          <Text style={styles.detailMeta}>
            本地演示暂不扣款，后续接入微信/支付宝。
          </Text>
        ) : null}
        {order.bonusText ? (
          <Text style={styles.detailMeta}>{`曝光赏金：${order.bonusText}`}</Text>
        ) : null}
        {order.reorderSource ? (
          <>
            <Text style={styles.detailMeta}>
              {`复制来源：${order.reorderSource.orderId}`}
            </Text>
            <Text style={styles.detailMeta}>
              {`来源记录：${order.reorderSource.noteText}`}
            </Text>
            <Text style={styles.routeMeta}>{order.reorderSource.copiedAtText}</Text>
          </>
        ) : null}
        {order.cargoDescription ? (
          <Text style={styles.detailMeta}>
            货物描述：{order.cargoDescription}
          </Text>
        ) : null}
      </View>
    </>
  );
}
