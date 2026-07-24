import { Pressable, Text, View } from 'react-native';
import { useState } from 'react';

import { styles } from '../../styles';
import {
  createUsedCouponChanges,
  filterCoupons,
  type CouponFilter,
} from '../../utils/profileCoupons';
import type { CouponItem } from '../../utils/profileLocalState';

export function CouponRecords({
  coupons,
  canRefresh = false,
  isRefreshing = false,
  notice,
  onRefresh,
  onUpdateCoupons,
}: {
  coupons: CouponItem[];
  canRefresh?: boolean;
  isRefreshing?: boolean;
  notice?: string;
  onRefresh?: () => void;
  onUpdateCoupons: (coupons: CouponItem[]) => void;
}) {
  const [filter, setFilter] = useState<CouponFilter>('all');
  const [actionNotice, setActionNotice] = useState('');
  const filterOptions: Array<{
    id: CouponFilter;
    label: string;
    testID: string;
  }> = [
    { id: 'all', label: '全部', testID: 'coupon-filter-all' },
    { id: 'usable', label: '可使用', testID: 'coupon-filter-usable' },
    { id: 'used', label: '已使用', testID: 'coupon-filter-used' },
    { id: 'expired', label: '已过期', testID: 'coupon-filter-expired' },
  ];
  const filteredCoupons = filterCoupons(coupons, filter);
  const noticeText = notice || actionNotice;

  const markCouponUsed = (couponId: string) => {
    const changes = createUsedCouponChanges(coupons, couponId);

    if (!changes) {
      return;
    }

    onUpdateCoupons(changes.coupons);
    setActionNotice(changes.noticeText);
  };

  return (
    <View style={styles.detailCard}>
      {canRefresh ? (
        <View style={styles.routeHeader}>
          <Text style={styles.routeName}>平台券包</Text>
          <Pressable
            testID="coupon-manual-refresh"
            disabled={isRefreshing || !onRefresh}
            style={({ pressed }) => [
              styles.detailSecondaryButton,
              (isRefreshing || !onRefresh) && styles.buttonDisabled,
              pressed && !isRefreshing && onRefresh && styles.pressedButton,
            ]}
            onPress={onRefresh}
          >
            <Text style={styles.detailSecondaryButtonText}>
              {isRefreshing ? '刷新中...' : '手动刷新'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {noticeText ? <Text style={styles.draftNotice}>{noticeText}</Text> : null}
      <Text style={styles.draftSectionTitle}>优惠券筛选</Text>
      <View style={styles.draftChoiceGrid}>
        {filterOptions.map(option => {
          const active = option.id === filter;

          return (
            <Pressable
              key={option.id}
              testID={option.testID}
              style={[
                styles.draftChoiceButton,
                active && styles.draftChoiceButtonActive,
              ]}
              onPress={() => setFilter(option.id)}
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
      <Text style={styles.draftSectionTitle}>优惠券明细</Text>
      {filteredCoupons.map(item => (
        <View key={item.id} style={styles.driverInfoCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeName}>{item.title}</Text>
            <Text style={styles.routeAction}>{item.statusText}</Text>
          </View>
          <Text style={styles.detailMeta}>{item.conditionText}</Text>
          <Text style={styles.routeMeta}>{item.validUntilText}</Text>
          <Text style={styles.routeMeta}>{item.sourceText}</Text>
          {item.statusText === '可使用' ? (
            <Pressable
              testID={`coupon-use-${item.id}`}
              style={({ pressed }) => [
                styles.detailPrimaryButton,
                pressed && styles.pressedButton,
              ]}
              onPress={() => markCouponUsed(item.id)}
            >
              <Text style={styles.detailPrimaryButtonText}>标记使用</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}
