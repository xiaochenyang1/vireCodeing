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
  onUpdateCoupons,
}: {
  coupons: CouponItem[];
  onUpdateCoupons: (coupons: CouponItem[]) => void;
}) {
  const [filter, setFilter] = useState<CouponFilter>('all');
  const [notice, setNotice] = useState('');
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

  const markCouponUsed = (couponId: string) => {
    const changes = createUsedCouponChanges(coupons, couponId);

    if (!changes) {
      return;
    }

    onUpdateCoupons(changes.coupons);
    setNotice(changes.noticeText);
  };

  return (
    <View style={styles.detailCard}>
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

      {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}
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
