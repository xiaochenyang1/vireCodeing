import { Text, View } from 'react-native';

import { ProfileAvatar } from '../../components/ProfileAvatar';
import { styles } from '../../styles';

export function ProfileOverviewPanel({
  avatarInitial,
  avatarPhotoCount,
  avatarPublicUrl,
  displayName,
  accountTypeLabel,
  maskedPhone,
  verificationLabel,
  enterpriseVerificationLabel,
  creditScore,
  monthlyOrderCount,
  unreadMessageCount,
}: {
  avatarInitial: string;
  avatarPhotoCount: number;
  avatarPublicUrl?: string;
  displayName: string;
  accountTypeLabel: string;
  maskedPhone: string;
  verificationLabel: string;
  enterpriseVerificationLabel: string;
  creditScore: number;
  monthlyOrderCount: number;
  unreadMessageCount: number;
}) {
  return (
    <View style={styles.verificationPanel}>
      <View style={styles.panelHeader}>
        <View style={styles.profileIdentityRow}>
          <ProfileAvatar
            initial={avatarInitial}
            publicUrl={avatarPublicUrl}
            size="md"
            imageTestID="profile-avatar-image"
          />
          <View>
            <Text style={styles.greeting}>{displayName}</Text>
            <Text style={styles.subtleText}>
              {`${accountTypeLabel} · 手机号：${maskedPhone}`}
            </Text>
            <Text style={styles.subtleText}>
              {avatarPublicUrl
                ? '头像：平台已同步'
                : avatarPhotoCount > 0
                  ? '头像凭证：本地已保存'
                  : `头像占位：${avatarInitial}`}
            </Text>
          </View>
        </View>
        <View style={styles.profileBadgeColumn}>
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedBadgeText}>
              {`实名认证：${verificationLabel}`}
            </Text>
          </View>
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedBadgeText}>
              {`企业认证：${enterpriseVerificationLabel}`}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.metricRow}>
        <MetricItem label="综合信用" value={`${creditScore} 分`} />
        <MetricItem label="本月发单" value={`${monthlyOrderCount} 单`} />
        <MetricItem label="未读消息" value={`${unreadMessageCount} 条`} />
      </View>
    </View>
  );
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}
