import { PlatformApiError } from '../services/platformApiClient';
import type {
  OrderCreateIdempotencyContext,
  OrderMutationContext,
  OrderSyncOperation,
  RecentOrder,
} from '../types';
import { createFailedOrderSyncState } from './order';

export type OrderMutationFailureAction =
  | 'retry'
  | 'refresh'
  | 'reinitiate';

export type OrderCreateFailureAction =
  | 'retry'
  | 'refresh'
  | 'contract-error';

export function createOrderCreateContext(): OrderCreateIdempotencyContext {
  return { idempotencyKey: createUuidV4() };
}

export function createOrderMutationContext(
  baseUpdatedAtIso?: string,
): OrderMutationContext {
  return {
    idempotencyKey: createUuidV4(),
    baseUpdatedAtIso: normalizeOrderMutationBaseUpdatedAtIso(baseUpdatedAtIso),
  };
}

export function createFailedOrderMutationSyncState(
  message: string,
  operation: OrderSyncOperation,
  mutationContext: OrderMutationContext,
  now = Date.now(),
) {
  return createFailedOrderSyncState(message, operation, now, {
    mutationContext,
  });
}

export function getOrderMutationRetryContext(
  order: Pick<RecentOrder, 'createdAtIso' | 'updatedAtIso' | 'syncState'>,
): OrderMutationContext {
  const existingMutationContext = order.syncState?.mutationContext;

  if (isValidOrderMutationContext(existingMutationContext)) {
    return existingMutationContext;
  }

  return createOrderMutationContext(
    order.updatedAtIso ?? order.createdAtIso ?? new Date().toISOString(),
  );
}

export function getOrderMutationFailureAction(
  error: unknown,
): OrderMutationFailureAction {
  if (!(error instanceof PlatformApiError)) {
    return 'retry';
  }

  if (error.code === 'ORDER_CONFLICT') {
    return 'refresh';
  }

  if (
    error.code === 'IDEMPOTENCY_KEY_REUSED' ||
    error.code === 'IDEMPOTENCY_KEY_EXPIRED'
  ) {
    return 'reinitiate';
  }

  return 'retry';
}

export function getOrderCreateFailureAction(
  error: unknown,
): OrderCreateFailureAction {
  if (!(error instanceof PlatformApiError)) {
    return 'retry';
  }

  if (
    error.code === 'IDEMPOTENCY_KEY_REUSED' ||
    error.code === 'IDEMPOTENCY_KEY_EXPIRED'
  ) {
    return 'refresh';
  }

  if (error.code === 'ORDER_CONFLICT') {
    return 'contract-error';
  }

  return 'retry';
}

function isValidOrderMutationContext(
  mutationContext: OrderMutationContext | undefined,
): mutationContext is OrderMutationContext {
  return Boolean(
    mutationContext?.idempotencyKey?.trim() &&
      mutationContext.baseUpdatedAtIso?.trim(),
  );
}

function normalizeOrderMutationBaseUpdatedAtIso(baseUpdatedAtIso?: string) {
  const normalizedBaseUpdatedAtIso = baseUpdatedAtIso?.trim();

  if (normalizedBaseUpdatedAtIso) {
    return normalizedBaseUpdatedAtIso;
  }

  return new Date().toISOString();
}

function createUuidV4() {
  const cryptoApi = (
    globalThis as typeof globalThis & {
      crypto?: {
        randomUUID?: () => string;
      };
    }
  ).crypto;
  const randomUuid = cryptoApi?.randomUUID?.();

  if (randomUuid) {
    return randomUuid;
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, value => {
    const randomNibble = Math.floor(Math.random() * 16);
    const nibbleValue = value === 'x' ? randomNibble : 8 + (randomNibble % 4);

    return nibbleValue.toString(16);
  });
}
