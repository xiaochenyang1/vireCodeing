import { Pressable, Text, View } from 'react-native';
import { useState } from 'react';

import { AuthField } from '../../components/AuthField';
import { SectionHeader } from '../../components/SectionHeader';
import { styles } from '../../styles';
import type { FrequentRoute } from '../../types';
import {
  createSyncedHomeSyncState,
  type HomeSyncState,
} from '../../utils/homeLocalState';

export function FrequentRoutesSection({
  routes,
  syncState,
  onRetrySync,
  onMarkSyncFailed,
  onOpenManager,
  onAddRoute,
  onUpdateRoute,
  onMoveRoute,
  onDeleteRoute,
  onReuseRoute,
  onAdoptConflictRoute,
  onAdoptConflictRouteField,
  onAdoptConflictDeletedRoute,
}: {
  routes: FrequentRoute[];
  syncState?: HomeSyncState;
  onRetrySync: () => void;
  onMarkSyncFailed: () => void;
  onOpenManager?: () => void;
  onAddRoute: (
    route: Omit<FrequentRoute, 'id' | 'lastUsedText' | 'lastUsedIso'>,
  ) => void;
  onUpdateRoute: (
    routeId: string,
    route: Omit<FrequentRoute, 'id' | 'lastUsedText' | 'lastUsedIso'>,
  ) => void;
  onMoveRoute: (routeId: string, direction: 'up' | 'down') => void;
  onDeleteRoute: (routeId: string) => void;
  onReuseRoute: (route: FrequentRoute) => void;
  onAdoptConflictRoute?: (routeId: string) => void;
  onAdoptConflictRouteField?: (fieldId: string) => void;
  onAdoptConflictDeletedRoute?: (routeId: string) => void;
}) {
  const [showManager, setShowManager] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState('');
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notice, setNotice] = useState('');

  const resetRouteForm = () => {
    setEditingRouteId('');
    setName('');
    setFrom('');
    setTo('');
  };

  const submitRoute = () => {
    if (!name.trim() || !from.trim() || !to.trim()) {
      setNotice('请补齐路线名称、装货地和卸货地');
      return;
    }

    const routeValues = {
      name: name.trim(),
      from: from.trim(),
      to: to.trim(),
    };

    if (editingRouteId) {
      onUpdateRoute(editingRouteId, routeValues);
      resetRouteForm();
      setNotice('常用路线已更新');
      return;
    }

    onAddRoute(routeValues);
    resetRouteForm();
    setNotice('常用路线已添加');
  };

  const editRoute = (route: FrequentRoute) => {
    setEditingRouteId(route.id);
    setName(route.name);
    setFrom(route.from);
    setTo(route.to);
    setNotice(`正在编辑：${route.name}`);
  };

  const deleteRoute = (routeId: string) => {
    onDeleteRoute(routeId);
    if (editingRouteId === routeId) {
      resetRouteForm();
    }
    setNotice('常用路线已删除');
  };

  const moveRoute = (routeId: string, direction: 'up' | 'down') => {
    onMoveRoute(routeId, direction);
    setNotice('常用路线顺序已更新');
  };

  const toggleManager = () => {
    setShowManager(current => {
      const nextShowManager = !current;

      if (nextShowManager) {
        onOpenManager?.();
      }

      return nextShowManager;
    });
  };

  return (
    <View style={styles.section}>
      <SectionHeader
        title="常用路线"
        actionLabel="管理"
        actionTestID="home-routes-manage"
        onActionPress={toggleManager}
      />
      {showManager ? (
        <View style={styles.detailCard}>
          <Text style={styles.draftSectionTitle}>管理常用路线</Text>
          <RouteSyncStatusCard
            syncState={syncState}
            onRetry={onRetrySync}
            onMarkFailed={onMarkSyncFailed}
            onAdoptConflictRoute={onAdoptConflictRoute}
            onAdoptConflictRouteField={onAdoptConflictRouteField}
            onAdoptConflictDeletedRoute={onAdoptConflictDeletedRoute}
          />
          <AuthField
            testID="route-name"
            label="路线名称"
            placeholder="例如 番禺仓库 → 天河门店"
            value={name}
            onChangeText={setName}
          />
          <AuthField
            testID="route-from"
            label="装货地"
            placeholder="例如 番禺区南村仓库"
            value={from}
            onChangeText={setFrom}
          />
          <AuthField
            testID="route-to"
            label="卸货地"
            placeholder="例如 天河区体育西门店"
            value={to}
            onChangeText={setTo}
          />
          {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}
          <Pressable
            testID="route-submit"
            style={({ pressed }) => [
              styles.detailPrimaryButton,
              pressed && styles.pressedButton,
            ]}
            onPress={submitRoute}
          >
            <Text style={styles.detailPrimaryButtonText}>
              {editingRouteId ? '保存路线' : '添加路线'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.routeList}>
        {routes.map(route => (
          <Pressable
            key={route.id}
            testID={`route-reuse-${route.id}`}
            style={({ pressed }) => [
              styles.routeCard,
              pressed && styles.pressedCard,
            ]}
            onPress={() => onReuseRoute(route)}
          >
            <View style={styles.routeHeader}>
              <Text style={styles.routeName}>{route.name}</Text>
              <Text style={styles.routeAction}>快速发单</Text>
            </View>
            <Text style={styles.routeAddress}>{route.from}</Text>
            <Text style={styles.routeAddress}>{route.to}</Text>
            <Text style={styles.routeMeta}>{route.lastUsedText}</Text>
            {showManager ? (
              <View>
                <Pressable
                  testID={`route-move-up-${route.id}`}
                  style={styles.detailSecondaryButton}
                  onPress={() => moveRoute(route.id, 'up')}
                >
                  <Text style={styles.detailSecondaryButtonText}>上移</Text>
                </Pressable>
                <Pressable
                  testID={`route-move-down-${route.id}`}
                  style={styles.detailSecondaryButton}
                  onPress={() => moveRoute(route.id, 'down')}
                >
                  <Text style={styles.detailSecondaryButtonText}>下移</Text>
                </Pressable>
                <Pressable
                  testID={`route-edit-${route.id}`}
                  style={styles.detailSecondaryButton}
                  onPress={() => editRoute(route)}
                >
                  <Text style={styles.detailSecondaryButtonText}>编辑路线</Text>
                </Pressable>
                <Pressable
                  testID={`route-delete-${route.id}`}
                  style={styles.detailSecondaryButton}
                  onPress={() => deleteRoute(route.id)}
                >
                  <Text style={styles.detailSecondaryButtonText}>删除路线</Text>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function RouteSyncStatusCard({
  syncState,
  onRetry,
  onMarkFailed,
  onAdoptConflictRoute,
  onAdoptConflictRouteField,
  onAdoptConflictDeletedRoute,
}: {
  syncState?: HomeSyncState;
  onRetry: () => void;
  onMarkFailed: () => void;
  onAdoptConflictRoute?: (routeId: string) => void;
  onAdoptConflictRouteField?: (fieldId: string) => void;
  onAdoptConflictDeletedRoute?: (routeId: string) => void;
}) {
  const effectiveSyncState =
    syncState ??
    createSyncedHomeSyncState('本地常用路线已初始化，等待真实路线 API 接入。');
  const canRetry =
    effectiveSyncState.status === 'pending' ||
    effectiveSyncState.status === 'failed';
  const canMarkFailed = effectiveSyncState.status === 'pending';
  const queueItems = effectiveSyncState.queueItems ?? [];
  const conflictRouteItems = effectiveSyncState.conflictRouteItems ?? [];
  const conflictRouteFieldItems =
    effectiveSyncState.conflictRouteFieldItems ?? [];
  const conflictDeletedRouteItems =
    effectiveSyncState.conflictDeletedRouteItems ?? [];
  const hasConflictItems =
    conflictRouteItems.length > 0 ||
    conflictRouteFieldItems.length > 0 ||
    conflictDeletedRouteItems.length > 0;

  return (
    <View style={styles.driverInfoCard}>
      <View style={styles.routeHeader}>
        <Text style={styles.routeName}>常用路线同步</Text>
        <Text style={styles.routeAction}>
          {getHomeSyncStatusText(effectiveSyncState.status)}
        </Text>
      </View>
      <Text style={styles.detailMeta}>
        {`常用路线同步：${getHomeSyncStatusText(effectiveSyncState.status)}`}
      </Text>
      <Text style={styles.detailMeta}>
        {`同步说明：${effectiveSyncState.message}`}
      </Text>
      <Text style={styles.routeMeta}>
        {`同步时间：${effectiveSyncState.updatedAtText}`}
      </Text>
      {effectiveSyncState.conflictSummaryText ? (
        <Text style={styles.detailMeta}>
          {effectiveSyncState.conflictSummaryText}
        </Text>
      ) : null}
      {hasConflictItems ? (
        <View>
          <Text style={styles.draftSectionTitle}>服务端常用路线差异</Text>
          {conflictRouteFieldItems.map(field => (
            <View key={field.id} style={styles.driverInfoCard}>
              <Text style={styles.detailMeta}>
                {`${field.fieldLabel}：${field.localValue} -> ${field.platformValue}`}
              </Text>
              <Pressable
                testID={`route-sync-adopt-conflict-route-field-${field.id}`}
                style={styles.detailSecondaryButton}
                onPress={() => onAdoptConflictRouteField?.(field.id)}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  采用服务端字段
                </Text>
              </Pressable>
            </View>
          ))}
          {conflictDeletedRouteItems.map(route => (
            <View key={route.id} style={styles.driverInfoCard}>
              <Text style={styles.detailMeta}>
                {`服务端已删除路线：${route.name}`}
              </Text>
              <Text style={styles.detailMeta}>{route.from}</Text>
              <Text style={styles.detailMeta}>{route.to}</Text>
              <Pressable
                testID={`route-sync-adopt-conflict-deleted-route-${route.id}`}
                style={styles.detailSecondaryButton}
                onPress={() => onAdoptConflictDeletedRoute?.(route.id)}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  采用服务端删除
                </Text>
              </Pressable>
            </View>
          ))}
          {conflictRouteItems.map(route => (
            <View key={route.id} style={styles.driverInfoCard}>
              <Text style={styles.routeName}>{route.name}</Text>
              <Text style={styles.detailMeta}>{route.from}</Text>
              <Text style={styles.detailMeta}>{route.to}</Text>
              <Pressable
                testID={`route-sync-adopt-conflict-route-${route.id}`}
                style={styles.detailSecondaryButton}
                onPress={() => onAdoptConflictRoute?.(route.id)}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  采用服务端路线
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={styles.draftSectionTitle}>常用路线同步队列</Text>
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
        <Text style={styles.detailMeta}>暂无待同步路线</Text>
      )}
      {canMarkFailed ? (
        <Pressable
          testID="route-sync-mark-failed"
          style={styles.detailSecondaryButton}
          onPress={onMarkFailed}
        >
          <Text style={styles.detailSecondaryButtonText}>本地标记失败</Text>
        </Pressable>
      ) : null}
      {canRetry ? (
        <Pressable
          testID="route-sync-retry"
          style={styles.detailSecondaryButton}
          onPress={onRetry}
        >
          <Text style={styles.detailSecondaryButtonText}>重试同步</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function getHomeSyncStatusText(status: HomeSyncState['status']) {
  if (status === 'synced') {
    return '已同步';
  }

  if (status === 'failed') {
    return '同步失败';
  }

  return '待同步';
}
