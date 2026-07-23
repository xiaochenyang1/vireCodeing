import { Pressable, Text, View } from 'react-native';

import { AuthField } from '../../components/AuthField';
import {
  paymentMethodOptions,
  pricingModeOptions,
} from '../../data/mockData';
import { styles } from '../../styles';
import type { PaymentMethod, PricingMode } from '../../types';
import type { CouponItem } from '../../utils/profileLocalState';
import { getDraftPricingCapabilityCopy } from '../../utils/orderDraft';

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
  usesPlatformOrderApi = false,
  onEstimatePrice,
  estimateBreakdown,
  isEstimating = false,
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
  usesPlatformOrderApi?: boolean;
  onEstimatePrice?: () => void;
  estimateBreakdown?: string[];
  isEstimating?: boolean;
}) {
  const pricingCopy = getDraftPricingCapabilityCopy(usesPlatformOrderApi);

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
          <>
            <AuthField
              testID="draft-price"
              label="一口价"
              placeholder="例如 760"
              value={priceText}
              onChangeText={onPriceTextChange}
              keyboardType="number-pad"
            />
            {onEstimatePrice ? (
              <Pressable
                testID="draft-smart-estimate-button"
                style={[styles.detailSecondaryButton, { marginTop: 8 }]}
                onPress={onEstimatePrice}
                disabled={isEstimating}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  {isEstimating ? '估价中...' : '智能估价'}
                </Text>
              </Pressable>
            ) : null}
            {estimateBreakdown && estimateBreakdown.length > 0 ? (
              <View
                style={[
                  styles.draftInlineSection,
                  { backgroundColor: '#F0F8FF', padding: 12, marginTop: 8 },
                ]}
              >
                <Text style={[styles.draftNotice, { fontWeight: '600' }]}>
                  智能估价明细：
                </Text>
                {estimateBreakdown.map((line, index) => (
                  <Text key={index} style={styles.draftNotice}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <Text style={styles.draftNotice}>
            议价模式发布后，司机可在待接单阶段提交报价。
          </Text>
        )}
      </View>

      <View style={styles.draftCard}>
        <Text style={styles.draftSectionTitle}>
          {pricingCopy.couponSectionTitle}
        </Text>
        <Text style={styles.draftNotice}>{pricingCopy.couponNotice}</Text>
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
              ? pricingCopy.fixedPricingEmptyCouponNotice
              : pricingCopy.negotiableCouponNotice}
          </Text>
        )}
      </View>

      <View style={styles.draftCard}>
        <Text style={styles.draftSectionTitle}>支付方式</Text>
        <Text style={styles.draftNotice}>{pricingCopy.paymentNotice}</Text>
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
