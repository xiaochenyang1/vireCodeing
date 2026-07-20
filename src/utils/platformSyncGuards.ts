import type { DraftOrderPrefill } from '../types';
import type { DraftSyncState } from './draftStorage';
import { PlatformApiError } from '../services/platformApiClient';

/**
 * 平台同步相关的纯守卫与草稿比较 helper。
 *
 * 原先散落在 App.tsx 顶部/底部：错误码判定、草稿新旧比较、草稿基线时间派生等。
 * 集中到这里便于独立单测，也让 App.tsx 只保留状态编排。
 */

export const orderDraftConflictErrorCode = 'ORDER_DRAFT_CONFLICT';
export const authAccessTokenMissingErrorCode = 'AUTH_ACCESS_TOKEN_MISSING';

export function shouldUsePlatformDraft(
  platformUpdatedAtIso: string,
  localUpdatedAtIso?: string,
) {
  if (!localUpdatedAtIso) {
    return true;
  }

  return Date.parse(platformUpdatedAtIso) > Date.parse(localUpdatedAtIso);
}

export function getPlatformDraftBaseUpdatedAtIso(syncState?: DraftSyncState) {
  return (
    syncState?.platformUpdatedAtIso ??
    (syncState?.status === 'synced' ? syncState.updatedAtIso : undefined)
  );
}

export function areDraftPrefillsEqual(
  left: DraftOrderPrefill,
  right: DraftOrderPrefill,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function isOrderDraftConflictError(error: unknown) {
  return (
    error instanceof PlatformApiError &&
    error.code === orderDraftConflictErrorCode
  );
}

export function isAuthAccessTokenMissingError(error: unknown) {
  return (
    error instanceof PlatformApiError &&
    error.code === authAccessTokenMissingErrorCode
  );
}

export function createDraftPrefillFromPlatformDraft(
  draftSnapshot: Record<string, unknown>,
): DraftOrderPrefill {
  return draftSnapshot as DraftOrderPrefill;
}
