import { Pressable, Text, View } from 'react-native';

import { styles } from '../styles';

type SectionHeaderProps = {
  title: string;
  actionLabel: string;
  actionTestID?: string;
  onActionPress?: () => void;
};

export function SectionHeader({
  title,
  actionLabel,
  actionTestID,
  onActionPress,
}: SectionHeaderProps) {
  if (!onActionPress) {
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
    );
  }

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable testID={actionTestID} onPress={onActionPress}>
        <Text style={styles.sectionAction}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}
