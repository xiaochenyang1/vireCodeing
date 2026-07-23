import { Pressable, Text, View } from 'react-native';

import { styles } from '../../styles';

export function SupportTopBar({
  title,
  subtitle,
  onBackHome,
  modeBadgeText = '本地版',
}: {
  title: string;
  subtitle: string;
  onBackHome: () => void;
  modeBadgeText?: string;
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
        <Text style={styles.draftBadgeText}>{modeBadgeText}</Text>
      </View>
    </View>
  );
}
