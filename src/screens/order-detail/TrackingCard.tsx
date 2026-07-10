import { Text, View } from 'react-native';

import { styles } from '../../styles';
import type { DriverInfo, RecentOrder } from '../../types';

export function TrackingCard({
  order,
  driver,
}: {
  order: RecentOrder;
  driver: DriverInfo;
}) {
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
        <Text style={styles.detailMeta}>
          {`当前位置：${order.from} → ${order.to}途中`}
        </Text>
        <Text style={styles.detailMeta}>{`预计到达：${order.updatedAtText}`}</Text>
        <Text style={styles.routeMeta}>
          本地演示：真实定位、路线规划和轨迹刷新后续接入地图服务。
        </Text>
      </View>
    </View>
  );
}
