import { Pressable, Text, View } from 'react-native';

import { styles } from '../../styles';
import {
  createSyncedProfileSyncState,
  type ProfileSyncState,
} from '../../utils/profileLocalState';

export function ProfileSyncStatusCard({
  syncState,
  onRetry,
  onMarkFailed,
  onAdoptConflictAddress,
  onAdoptConflictAddressField,
  onAdoptConflictDeletedAddress,
  onAdoptConflictContact,
  onAdoptConflictContactField,
  onAdoptConflictDeletedContact,
}: {
  syncState?: ProfileSyncState;
  onRetry: () => void;
  onMarkFailed: () => void;
  onAdoptConflictAddress?: (addressId: string) => void;
  onAdoptConflictAddressField?: (fieldId: string) => void;
  onAdoptConflictDeletedAddress?: (addressId: string) => void;
  onAdoptConflictContact?: (contactId: string) => void;
  onAdoptConflictContactField?: (fieldId: string) => void;
  onAdoptConflictDeletedContact?: (contactId: string) => void;
}) {
  const effectiveSyncState =
    syncState ??
    createSyncedProfileSyncState('本地资料已初始化，等待真实账号中心 API 接入。');
  const canRetry =
    effectiveSyncState.status === 'pending' ||
    effectiveSyncState.status === 'failed';
  const canMarkFailed = effectiveSyncState.status === 'pending';
  const queueItems = effectiveSyncState.queueItems ?? [];
  const conflictAddressItems = effectiveSyncState.conflictAddressItems ?? [];
  const conflictAddressFieldItems =
    effectiveSyncState.conflictAddressFieldItems ?? [];
  const conflictDeletedAddressItems =
    effectiveSyncState.conflictDeletedAddressItems ?? [];
  const conflictContactItems = effectiveSyncState.conflictContactItems ?? [];
  const conflictContactFieldItems =
    effectiveSyncState.conflictContactFieldItems ?? [];
  const conflictDeletedContactItems =
    effectiveSyncState.conflictDeletedContactItems ?? [];

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>资料同步</Text>
      <Text style={styles.detailMeta}>
        {`资料同步：${getProfileSyncStatusText(effectiveSyncState.status)}`}
      </Text>
      <Text style={styles.detailMeta}>
        {`同步说明：${effectiveSyncState.message}`}
      </Text>
      <Text style={styles.detailMeta}>
        {`同步时间：${effectiveSyncState.updatedAtText}`}
      </Text>
      {effectiveSyncState.conflictSummaryText ? (
        <Text style={styles.detailMeta}>
          {effectiveSyncState.conflictSummaryText}
        </Text>
      ) : null}
      {conflictAddressItems.length > 0 ||
      conflictAddressFieldItems.length > 0 ||
      conflictDeletedAddressItems.length > 0 ||
      conflictContactFieldItems.length > 0 ||
      conflictDeletedContactItems.length > 0 ||
      conflictContactItems.length > 0 ? (
        <View>
          <Text style={styles.draftSectionTitle}>服务端地址簿差异</Text>
          {conflictDeletedAddressItems.map(address => (
            <View key={address.id} style={styles.driverInfoCard}>
              <Text style={styles.detailMeta}>
                {`服务端已删除地址：${address.name}`}
              </Text>
              <Pressable
                testID={`profile-sync-adopt-conflict-deleted-address-${address.id}`}
                style={styles.detailSecondaryButton}
                onPress={() => onAdoptConflictDeletedAddress?.(address.id)}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  采用服务端删除
                </Text>
              </Pressable>
            </View>
          ))}
          {conflictDeletedContactItems.map(contact => (
            <View key={contact.id} style={styles.driverInfoCard}>
              <Text style={styles.detailMeta}>
                {`服务端已删除联系人：${contact.name}`}
              </Text>
              <Pressable
                testID={`profile-sync-adopt-conflict-deleted-contact-${contact.id}`}
                style={styles.detailSecondaryButton}
                onPress={() => onAdoptConflictDeletedContact?.(contact.id)}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  采用服务端删除
                </Text>
              </Pressable>
            </View>
          ))}
          {conflictAddressFieldItems.map(fieldItem => (
            <View key={fieldItem.id} style={styles.driverInfoCard}>
              <Text style={styles.detailMeta}>
                {`${fieldItem.fieldLabel}：${fieldItem.localValue} -> ${fieldItem.platformValue}`}
              </Text>
              <Pressable
                testID={`profile-sync-adopt-conflict-address-field-${fieldItem.addressId}-${fieldItem.fieldKey}`}
                style={styles.detailSecondaryButton}
                onPress={() => onAdoptConflictAddressField?.(fieldItem.id)}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  采用服务端字段
                </Text>
              </Pressable>
            </View>
          ))}
          {conflictContactFieldItems.map(fieldItem => (
            <View key={fieldItem.id} style={styles.driverInfoCard}>
              <Text style={styles.detailMeta}>
                {`${fieldItem.fieldLabel}：${fieldItem.localValue} -> ${fieldItem.platformValue}`}
              </Text>
              <Pressable
                testID={`profile-sync-adopt-conflict-contact-field-${fieldItem.contactId}-${fieldItem.fieldKey}`}
                style={styles.detailSecondaryButton}
                onPress={() => onAdoptConflictContactField?.(fieldItem.id)}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  采用服务端字段
                </Text>
              </Pressable>
            </View>
          ))}
          {conflictAddressItems.map(address => (
            <View key={address.id} style={styles.driverInfoCard}>
              <Text style={styles.routeName}>{address.name}</Text>
              <Text style={styles.detailMeta}>{address.address}</Text>
              <Text style={styles.detailMeta}>{address.contactText}</Text>
              <Pressable
                testID={`profile-sync-adopt-conflict-address-${address.id}`}
                style={styles.detailSecondaryButton}
                onPress={() => onAdoptConflictAddress?.(address.id)}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  采用服务端地址
                </Text>
              </Pressable>
            </View>
          ))}
          {conflictContactItems.map(contact => (
            <View key={contact.id} style={styles.driverInfoCard}>
              <Text style={styles.routeName}>{contact.name}</Text>
              <Text style={styles.detailMeta}>{contact.roleText}</Text>
              <Text style={styles.detailMeta}>{contact.phoneText}</Text>
              <Text style={styles.detailMeta}>{contact.noteText}</Text>
              <Pressable
                testID={`profile-sync-adopt-conflict-contact-${contact.id}`}
                style={styles.detailSecondaryButton}
                onPress={() => onAdoptConflictContact?.(contact.id)}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  采用服务端联系人
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={styles.draftSectionTitle}>资料同步队列</Text>
      {queueItems.length > 0 ? (
        queueItems.map(queueItem => (
          <View key={queueItem.id} style={styles.driverInfoCard}>
            <Text style={styles.detailMeta}>
              {`${queueItem.titleText}：${queueItem.statusText}`}
            </Text>
            <Text style={styles.detailMeta}>
              {`队列时间：${queueItem.updatedAtText}`}
            </Text>
            <Text style={styles.detailMeta}>{queueItem.noteText}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.detailMeta}>暂无待同步资料</Text>
      )}
      {canMarkFailed ? (
        <Pressable
          testID="profile-sync-mark-failed"
          style={styles.detailSecondaryButton}
          onPress={onMarkFailed}
        >
          <Text style={styles.detailSecondaryButtonText}>本地标记失败</Text>
        </Pressable>
      ) : null}
      {canRetry ? (
        <Pressable
          testID="profile-sync-retry"
          style={styles.detailSecondaryButton}
          onPress={onRetry}
        >
          <Text style={styles.detailSecondaryButtonText}>重试同步</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function getProfileSyncStatusText(status: ProfileSyncState['status']) {
  if (status === 'synced') {
    return '已同步';
  }

  if (status === 'failed') {
    return '同步失败';
  }

  return '待同步';
}
