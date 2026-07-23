import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProfileAvatar } from '../../components/ProfileAvatar';
import { styles } from '../../styles';
import { getProfileAvatarInitial } from '../../utils/profileOverview';
import type { SavedAccountSettings } from '../../utils/profileLocalState';

export function ProfileTopBar({
  title,
  subtitle,
  onBack,
  backTestID,
  backText,
  account,
  modeBadgeText = '本地版',
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  backTestID: string;
  backText: string;
  account?: Pick<SavedAccountSettings, 'displayName' | 'avatarPublicUrl'>;
  modeBadgeText?: string;
}) {
  const avatarInitial = getProfileAvatarInitial(account?.displayName ?? '');

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
      <View style={profileTopBarStyles.metaGroup}>
        {account ? (
          <ProfileAvatar
            initial={avatarInitial}
            publicUrl={account.avatarPublicUrl}
            size="sm"
            imageTestID="profile-top-bar-avatar-image"
            textTestID="profile-top-bar-avatar-text"
          />
        ) : null}
        <View style={styles.draftBadge}>
          <Text style={styles.draftBadgeText}>{modeBadgeText}</Text>
        </View>
      </View>
    </View>
  );
}

const profileTopBarStyles = StyleSheet.create({
  metaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
