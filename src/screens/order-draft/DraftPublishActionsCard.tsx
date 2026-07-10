import { Pressable, Text, View } from 'react-native';

import { styles } from '../../styles';
import type { DraftSyncState } from '../../utils/draftStorage';
import { DraftSyncStatusCard } from './DraftSyncStatusCard';

export function DraftPublishActionsCard({
  notice,
  draftSyncState,
  onRetryDraftSync,
  onMarkDraftSyncFailed,
  onSaveDraft,
  onPreviewDraft,
}: {
  notice: string;
  draftSyncState?: DraftSyncState;
  onRetryDraftSync?: () => void;
  onMarkDraftSyncFailed?: () => void;
  onSaveDraft: () => void;
  onPreviewDraft: () => void;
}) {
  return (
    <View style={styles.draftCard}>
      <Text style={styles.draftSectionTitle}>确认发布</Text>
      <Text style={styles.draftNotice}>
        发布前会进入确认页，确认后订单进入待接单状态。
      </Text>

      {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}

      <DraftSyncStatusCard
        syncState={draftSyncState}
        onRetry={onRetryDraftSync}
        onMarkFailed={onMarkDraftSyncFailed}
      />

      <Pressable
        testID="draft-save"
        style={({ pressed }) => [
          styles.draftPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={onSaveDraft}
      >
        <Text style={styles.draftPrimaryButtonText}>保存草稿</Text>
      </Pressable>

      <Pressable
        testID="draft-publish"
        style={styles.draftSecondaryButton}
        onPress={onPreviewDraft}
      >
        <Text style={styles.draftSecondaryButtonText}>预览并发布</Text>
      </Pressable>
    </View>
  );
}
