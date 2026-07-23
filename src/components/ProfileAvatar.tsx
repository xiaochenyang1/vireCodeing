import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '../styles';

type ProfileAvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const avatarDimensions: Record<
  ProfileAvatarSize,
  {
    size: number;
    fontSize: number;
  }
> = {
  xs: {
    size: 20,
    fontSize: 10,
  },
  sm: {
    size: 28,
    fontSize: 12,
  },
  md: {
    size: 44,
    fontSize: 18,
  },
  lg: {
    size: 72,
    fontSize: 28,
  },
};

export function ProfileAvatar({
  initial,
  publicUrl,
  size = 'md',
  imageTestID,
  textTestID,
}: {
  initial: string;
  publicUrl?: string;
  size?: ProfileAvatarSize;
  imageTestID?: string;
  textTestID?: string;
}) {
  const avatarSize = avatarDimensions[size];
  const avatarStyle = {
    width: avatarSize.size,
    height: avatarSize.size,
    borderRadius: avatarSize.size / 2,
  } as const;

  return (
    <View style={[styles.avatar, avatarStyle]}>
      {publicUrl ? (
        <Image
          testID={imageTestID}
          source={{ uri: publicUrl }}
          style={styles.avatarImage}
        />
      ) : (
        <Text
          testID={textTestID}
          style={[styles.avatarText, { fontSize: avatarSize.fontSize }]}
        >
          {initial}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealSoft,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: colors.tealDark,
    fontWeight: '800',
  },
});
