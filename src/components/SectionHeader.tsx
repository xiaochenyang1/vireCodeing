import { Alert, Pressable, Text, View } from 'react-native';

import { styles } from '../styles';

type SectionHeaderProps = {
  title: string;
  actionLabel: string;
  actionTestID?: string;
  onActionPress?: () => void;
};

export function showUnavailable(featureName: string) {
  Alert.alert('暂未开放', `${featureName}将在下一阶段接入`);
}

export function SectionHeader({
  title,
  actionLabel,
  actionTestID,
  onActionPress,
}: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable
        testID={actionTestID}
        onPress={onActionPress ?? (() => showUnavailable(actionLabel))}
      >
        <Text style={styles.sectionAction}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}
