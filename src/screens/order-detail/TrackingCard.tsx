import { Text, View, Pressable } from 'react-native';
import { useEffect, useState } from 'react';

import { styles } from '../../styles';
import type { DriverInfo, RecentOrder } from '../../types';
import type { createPlatformMapsApi } from '../../services/platformMapsApi';
import { PlatformApiError } from '../../services/platformApiClient';
import {
  buildExternalNavigationUrls,
  formatCoordinateText,
} from '../../utils/mapsNavigation';

export function TrackingCard({
  order,
  driver,
  platformMapsApi,
  onOpenNavigation,
}: {
  order: RecentOrder;
  driver: DriverInfo;
  platformMapsApi?: Pick<
    ReturnType<typeof createPlatformMapsApi>,
    'getShipperDriverLocation'
  >;
  onOpenNavigation?: (url: string) => void;
}) {
  const [locationText, setLocationText] = useState(
    `当前位置：${order.from} → ${order.to}途中`,
  );
  const [updatedText, setUpdatedText] = useState(
    `预计到达：${order.updatedAtText}`,
  );
  const [notice, setNotice] = useState(
    '本地演示：真实定位、路线规划和轨迹刷新后续接入地图服务。',
  );

  useEffect(() => {
    if (!platformMapsApi || !order.platformOrderId) {
      return;
    }

    let active = true;
    platformMapsApi
      .getShipperDriverLocation(order.platformOrderId)
      .then(snapshot => {
        if (!active) {
          return;
        }

        setLocationText(
          `司机位置：${formatCoordinateText(
            snapshot.latitude,
            snapshot.longitude,
          )}`,
        );
        setUpdatedText(`更新时间：${snapshot.recordedAtIso}`);
        setNotice('已读取司机最新上报位置（sandbox/设备上报）。');
      })
      .catch(error => {
        if (!active) {
          return;
        }

        setNotice(
          error instanceof PlatformApiError &&
            error.code === 'DRIVER_LOCATION_NOT_FOUND'
            ? '司机尚未上报位置，仍展示本地演示轨迹。'
            : '司机位置加载失败，仍展示本地演示轨迹。',
        );
      });

    return () => {
      active = false;
    };
  }, [order.platformOrderId, platformMapsApi]);

  const openNavigation = () => {
    const urls = buildExternalNavigationUrls({
      label: '卸货点',
      address: order.to,
    });
    onOpenNavigation?.(urls.geo);
  };

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>位置跟踪</Text>
      <View style={styles.driverInfoCard}>
        <View style={styles.driverInfoHeader}>
          <View>
            <Text style={styles.driverName}>{driver.driverName}</Text>
            <Text style={styles.driverMeta}>{driver.vehicleText}</Text>
          </View>
          <View style={styles.driverRatingPill}>
            <Text style={styles.driverRatingText}>本地轨迹</Text>
          </View>
        </View>
        <Text style={styles.detailMeta}>{locationText}</Text>
        <Text style={styles.detailMeta}>{updatedText}</Text>
        <Text style={styles.routeMeta}>{notice}</Text>
        <Pressable
          testID="order-tracking-open-navigation"
          style={styles.detailSecondaryButton}
          onPress={openNavigation}
        >
          <Text style={styles.detailSecondaryButtonText}>外跳导航到卸货点</Text>
        </Pressable>
      </View>
    </View>
  );
}
