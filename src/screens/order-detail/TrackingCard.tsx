import { Text, View, Pressable } from 'react-native';
import { useEffect, useState } from 'react';

import { styles } from '../../styles';
import type { DriverInfo, RecentOrder } from '../../types';
import type {
  createPlatformMapsApi,
  PlatformDriverLocationSnapshot,
} from '../../services/platformMapsApi';
import { PlatformApiError } from '../../services/platformApiClient';
import {
  buildExternalNavigationUrls,
  formatCoordinateText,
} from '../../utils/mapsNavigation';

const TRACKING_REFRESH_INTERVAL_MS = 30 * 1000;

type TrackingState = {
  locationText: string;
  detailText: string;
  sourceText: string;
  notice: string;
  hasPlatformSnapshot: boolean;
};

function createLocalTrackingState(
  from: string,
  to: string,
  updatedAtText: string,
): TrackingState {
  return {
    locationText: `当前位置：${from} → ${to}途中`,
    detailText: `预计到达：${updatedAtText}`,
    sourceText: '本地轨迹',
    notice: '本地演示：真实定位、路线规划和轨迹刷新后续接入地图服务。',
    hasPlatformSnapshot: false,
  };
}

function createPlatformTrackingFallbackState(
  localTrackingState: TrackingState,
  notice: string,
): TrackingState {
  return {
    ...localTrackingState,
    sourceText: '定位兜底',
    notice,
  };
}

function createPlatformTrackingLoadingState(
  trackingState: TrackingState,
  mode: 'initial' | 'timer',
): TrackingState {
  if (mode === 'initial') {
    return {
      locationText: '司机位置：等待平台定位',
      detailText: '正在读取最新上报位置...',
      sourceText: '定位同步',
      notice: '正在读取司机最新上报位置。',
      hasPlatformSnapshot: false,
    };
  }

  return trackingState.hasPlatformSnapshot
    ? {
        ...trackingState,
        notice: '正在刷新司机最新上报位置，当前保留上一条平台位置。',
      }
    : {
        ...trackingState,
        notice: '正在重试读取司机最新上报位置，当前展示路线兜底位置。',
      };
}

function createPlatformTrackingState(
  snapshot: PlatformDriverLocationSnapshot,
  coordinateText: string,
  notice: string,
  formattedAddress?: string,
): TrackingState {
  return {
    locationText: formattedAddress
      ? `司机位置：${formattedAddress}`
      : `司机位置：${coordinateText}`,
    detailText: formattedAddress
      ? `坐标：${coordinateText} · 更新时间：${snapshot.recordedAtIso}`
      : `更新时间：${snapshot.recordedAtIso}`,
    sourceText: getTrackingSourceText(snapshot.source),
    notice,
    hasPlatformSnapshot: true,
  };
}

function createTrackingErrorState(
  error: unknown,
  trackingState: TrackingState,
  localTrackingState: TrackingState,
) {
  if (trackingState.hasPlatformSnapshot) {
    return {
      ...trackingState,
      notice:
        error instanceof PlatformApiError &&
        error.code === 'DRIVER_LOCATION_NOT_FOUND'
          ? '司机暂未继续上报位置，当前保留上一条平台位置。'
          : '司机位置刷新失败，当前保留上一条平台位置。',
    };
  }

  return createPlatformTrackingFallbackState(
    localTrackingState,
    error instanceof PlatformApiError &&
      error.code === 'DRIVER_LOCATION_NOT_FOUND'
      ? '司机尚未上报平台位置，当前展示路线兜底位置。'
      : '司机位置加载失败，当前展示路线兜底位置。',
  );
}

function unrefTimer(timer: ReturnType<typeof setInterval> | undefined) {
  const nodeTimer = timer as { unref?: () => void } | undefined;

  if (typeof nodeTimer?.unref === 'function') {
    nodeTimer.unref();
  }
}

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
  > &
    Partial<
      Pick<ReturnType<typeof createPlatformMapsApi>, 'reverseGeocode'>
    >;
  onOpenNavigation?: (url: string) => void;
}) {
  const [trackingState, setTrackingState] = useState<TrackingState>(() =>
    createLocalTrackingState(order.from, order.to, order.updatedAtText),
  );

  useEffect(() => {
    const localTrackingState = createLocalTrackingState(
      order.from,
      order.to,
      order.updatedAtText,
    );
    const platformOrderId = order.platformOrderId;

    if (!platformMapsApi || !platformOrderId) {
      setTrackingState(localTrackingState);
      return;
    }

    let active = true;
    let isRefreshing = false;
    let refreshTimer: ReturnType<typeof setInterval> | undefined;

    const syncTracking = async (mode: 'initial' | 'timer') => {
      if (!active || isRefreshing) {
        return;
      }

      isRefreshing = true;

      if (mode === 'initial') {
        setTrackingState(
          createPlatformTrackingLoadingState(localTrackingState, mode),
        );
      } else {
        setTrackingState(currentState =>
          createPlatformTrackingLoadingState(currentState, mode),
        );
      }

      try {
        const snapshot = await platformMapsApi.getShipperDriverLocation(
          platformOrderId,
        );

        if (!active) {
          return;
        }

        const coordinateText = formatCoordinateText(
          snapshot.latitude,
          snapshot.longitude,
        );
        const successNotice =
          mode === 'initial'
            ? '已读取司机最新上报位置，30 秒自动刷新中。'
            : '已同步司机最新位置，30 秒自动刷新中。';

        if (!platformMapsApi.reverseGeocode) {
          setTrackingState(
            createPlatformTrackingState(
              snapshot,
              coordinateText,
              successNotice,
            ),
          );
          return;
        }

        try {
          const geocode = await platformMapsApi.reverseGeocode({
            latitude: snapshot.latitude,
            longitude: snapshot.longitude,
          });

          if (!active) {
            return;
          }

          setTrackingState(
            createPlatformTrackingState(
              snapshot,
              coordinateText,
              successNotice,
              geocode.formattedAddress,
            ),
          );
        } catch {
          if (!active) {
            return;
          }

          setTrackingState(
            createPlatformTrackingState(
              snapshot,
              coordinateText,
              '司机位置地址解析失败，仍展示坐标。',
            ),
          );
        }
      } catch (error) {
        if (!active) {
          return;
        }

        setTrackingState(currentState =>
          createTrackingErrorState(error, currentState, localTrackingState),
        );
      } finally {
        isRefreshing = false;
      }
    };

    syncTracking('initial').catch(() => undefined);
    refreshTimer = setInterval(() => {
      syncTracking('timer').catch(() => undefined);
    }, TRACKING_REFRESH_INTERVAL_MS);
    unrefTimer(refreshTimer);

    return () => {
      active = false;
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };
  }, [
    order.id,
    order.from,
    order.platformOrderId,
    order.to,
    order.updatedAtText,
    platformMapsApi,
  ]);

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
            <Text testID="order-tracking-source" style={styles.driverRatingText}>
              {trackingState.sourceText}
            </Text>
          </View>
        </View>
        <Text style={styles.detailMeta}>{trackingState.locationText}</Text>
        <Text style={styles.detailMeta}>{trackingState.detailText}</Text>
        <Text style={styles.routeMeta}>{trackingState.notice}</Text>
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

function getTrackingSourceText(source: 'manual' | 'device' | 'sandbox') {
  if (source === 'device') {
    return '设备定位';
  }

  if (source === 'manual') {
    return '人工上报';
  }

  return '沙箱位置';
}
