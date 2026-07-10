import { Pressable, Text, View } from 'react-native';

import { styles } from '../../styles';

export function SupportTopBar({
  title,
  subtitle,
  onBackHome,
}: {
  title: string;
  subtitle: string;
  onBackHome: () => void;
}) {
  return (
    <View style={styles.detailTopBar}>
      <Pressable
        testID="support-back-home"
        style={styles.draftBackButton}
        onPress={onBackHome}
      >
        <Text style={styles.draftBackText}>返回首页</Text>
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
