import { Pressable, Text, View } from 'react-native';

import { ImageCredentialCard } from '../../components/ImageCredentialCard';
import { styles } from '../../styles';
import type { RecentOrder } from '../../types';
import { maskPhone } from '../../utils/order';

export function OrderCargoContactCard({
  order,
  vehicleRequirementText,
  onCallContact,
  supportsPlatformPaymentFlow = false,
}: {
  order: RecentOrder;
  vehicleRequirementText: string;
  onCallContact: (
    contactType: '装货联系人' | '卸货联系人',
    contactName?: string,
    phone?: string,
  ) => void;
  supportsPlatformPaymentFlow?: boolean;
}) {
  const paymentHintText = getOnlinePaymentHintText(
    order,
    supportsPlatformPaymentFlow,
  );

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
          <>
            <Text style={styles.detailMeta}>
              {`货物图片凭证 ${order.cargoPhotoCount} 张`}
            </Text>
            {order.cargoPhotoFiles?.map((file, index) => (
              <ImageCredentialCard
                key={file.fileId}
                title={`货物图片凭证 ${index + 1}：${file.fileName}`}
                publicUrl={file.publicUrl}
                placeholderLabel="货物图片"
                metaLines={[
                  `来源：平台文件对象（${file.status === 'uploaded' ? '已上传' : file.status === 'pending' ? '待上传' : '已驳回'}）`,
                  `文件 ID：${file.fileId}`,
                  ...(file.publicUrl
                    ? ['已生成预览地址。']
                    : file.objectKey
                      ? ['已写入平台对象存储。']
                      : []),
                ]}
                imageTestID={`order-cargo-photo-image-${index + 1}`}
                placeholderTestID={`order-cargo-photo-placeholder-${index + 1}`}
              />
            ))}
          </>
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
        {paymentHintText ? (
          <Text style={styles.detailMeta}>{paymentHintText}</Text>
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

function getOnlinePaymentHintText(
  order: RecentOrder,
  supportsPlatformPaymentFlow: boolean,
) {
  if (order.paymentMethodText !== '在线支付') {
    return undefined;
  }

  if (!order.paymentStatus) {
    if (supportsPlatformPaymentFlow && order.platformOrderId) {
      return '当前尚未创建支付单，可在资金状态卡选择渠道后发起支付。';
    }

    if (supportsPlatformPaymentFlow) {
      return '当前订单还未同步到平台，在线支付需待平台订单创建后发起。';
    }

    return '当前仍是本地演示订单，切到平台模式后可在订单页继续在线支付。';
  }

  switch (order.paymentStatus) {
    case 'pending':
      return '平台待确认支付结果，可在资金状态卡继续支付或刷新状态。';
    case 'escrowed':
      return '平台已确认收款并托管，运输完成后会按服务端结算快照分账。';
    case 'settled':
      return '平台已完成结算，可在消费记录和发票页查看资金结果。';
    case 'failed':
      return '支付未完成，可重新发起支付。';
    case 'cancelled':
      return '当前支付单已关闭。';
    case 'refund_pending':
      return '平台已受理退款，请勿重复取消订单。';
    case 'refunded':
      return '平台已确认原路退款完成。';
    case 'refund_failed':
      return '退款暂未完成，平台会继续处理。';
    case 'legacy_unverified':
      return '历史订单资金待人工核验。';
    case 'not_required':
      return undefined;
  }
}
