import { Pressable, Text, View } from 'react-native';

import { AuthField } from '../../components/AuthField';
import {
  paymentMethodOptions,
  pricingModeOptions,
} from '../../data/mockData';
import { styles } from '../../styles';
import type { PaymentMethod, PricingMode } from '../../types';
import type { CouponItem } from '../../utils/profileLocalState';

export function PriceSection({
  pricingMode,
  onPricingModeChange,
  priceText,
  onPriceTextChange,
  coupons,
  selectedCouponId,
  onSelectedCouponChange,
  paymentMethod,
  onPaymentMethodChange,
}: {
  pricingMode: PricingMode;
  onPricingModeChange: (value: PricingMode) => void;
  priceText: string;
  onPriceTextChange: (value: string) => void;
  coupons: CouponItem[];
  selectedCouponId?: string;
  onSelectedCouponChange: (value: string | undefined) => void;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (value: PaymentMethod) => void;
}) {
  return (
    <>
      <View style={styles.draftCard}>
        <Text style={styles.draftSectionTitle}>价格设置</Text>
        <View style={styles.draftChoiceGrid}>
          {pricingModeOptions.map(option => {
            const isActive = pricingMode === option.id;

            return (
              <Pressable
                key={option.id}
                testID={`draft-pricing-${option.id}`}
                style={[
                  styles.draftChoiceButton,
                  isActive && styles.draftChoiceButtonActive,
                ]}
                onPress={() => onPricingModeChange(option.id)}
              >
                <Text
                  style={[
                    styles.draftChoiceText,
                    isActive && styles.draftChoiceTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {pricingMode === 'fixed' ? (
          <AuthField
            testID="draft-price"
            label="一口价"
            placeholder="例如 760"
            value={priceText}
            onChangeText={onPriceTextChange}
            keyboardType="number-pad"
          />
        ) : (
          <Text style={styles.draftNotice}>
            议价模式发布后，司机可在待接单阶段提交报价。
          </Text>
        )}
      </View>

      <View style={styles.draftCard}>
        <Text style={styles.draftSectionTitle}>本地优惠券</Text>
        <Text style={styles.draftNotice}>
          仅做本地计价预览，真实优惠券核销和支付抵扣后续接入。
        </Text>
        {pricingMode === 'fixed' && coupons.length > 0 ? (
          <>
            <View style={styles.draftChoiceGrid}>
              {coupons.map(item => {
                const isActive = selectedCouponId === item.id;

                return (
                  <Pressable
                    key={item.id}
                    testID={`draft-coupon-${item.id}`}
                    style={[
                      styles.draftChoiceButton,
                      isActive && styles.draftChoiceButtonActive,
                    ]}
                    onPress={() =>
                      onSelectedCouponChange(isActive ? undefined : item.id)
                    }
                  >
                    <Text
                      style={[
                        styles.draftChoiceText,
                        isActive && styles.draftChoiceTextActive,
                      ]}
                    >
                      {item.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              testID="draft-coupon-clear"
              style={styles.draftSecondaryButton}
              onPress={() => onSelectedCouponChange(undefined)}
            >
              <Text style={styles.draftSecondaryButtonText}>不使用优惠券</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.draftNotice}>
            {pricingMode === 'fixed'
              ? '暂无可用本地优惠券。'
              : '议价订单暂不使用优惠券，等待司机报价后再接入真实计价。'}
          </Text>
        )}
      </View>

      <View style={styles.draftCard}>
        <Text style={styles.draftSectionTitle}>支付方式</Text>
        <Text style={styles.draftNotice}>
          当前只记录本地选择，真实微信/支付宝支付后续接入。
        </Text>
        <View style={styles.draftChoiceGrid}>
          {paymentMethodOptions.map(option => {
            const isActive = paymentMethod === option.id;

            return (
              <Pressable
                key={option.id}
                testID={`draft-payment-${option.id}`}
                style={[
                  styles.draftChoiceButton,
                  isActive && styles.draftChoiceButtonActive,
                ]}
                onPress={() => onPaymentMethodChange(option.id)}
              >
                <Text
                  style={[
                    styles.draftChoiceText,
                    isActive && styles.draftChoiceTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </>
  );
}
