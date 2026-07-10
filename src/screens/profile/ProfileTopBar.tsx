import { Pressable, Text, View } from 'react-native';

import { styles } from '../../styles';

export function ProfileTopBar({
  title,
  subtitle,
  onBack,
  backTestID,
  backText,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  backTestID: string;
  backText: string;
}) {
  return (
    <View style={styles.detailTopBar}>
      <Pressable
        testID={backTestID}
        style={styles.draftBackButton}
        onPress={onBack}
      >
        <Text style={styles.draftBackText}>{backText}</Text>
      </Pressable>
      <View style={styles.detailTitleGroup}>
        <Text style={styles.draftKicker}>{subtitle}</Text>
        <Text style={styles.detailTitle}>{title}</Text>
      </View>
      <View style={styles.draftBadge}>
        <Text style={styles.draftBadgeText}>本地版</Text>
      </View>
    </View>
  );
}
