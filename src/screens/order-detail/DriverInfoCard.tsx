import { Text, View } from 'react-native';

import { styles } from '../../styles';
import type { DriverInfo } from '../../types';

export function DriverInfoCard({ driver }: { driver: DriverInfo }) {
  return (
    <View style={styles.driverInfoCard}>
      <View style={styles.driverInfoHeader}>
        <View>
          <Text style={styles.driverName}>{driver.driverName}</Text>
          <Text style={styles.driverMeta}>{driver.driverPhone}</Text>
        </View>
        <View style={styles.driverRatingPill}>
          <Text style={styles.driverRatingText}>{driver.ratingText}</Text>
        </View>
      </View>
      <View style={styles.driverInfoGrid}>
        <Text style={styles.driverMeta}>{driver.vehicleText}</Text>
        <Text style={styles.driverMeta}>{driver.plateNumber}</Text>
        <Text style={styles.driverMeta}>完成 {driver.completedOrdersText}</Text>
      </View>
    </View>
  );
}
