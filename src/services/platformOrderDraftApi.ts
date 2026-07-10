import {
  PlatformApiError,
  platformGet,
  platformPut,
  type PlatformApiConfig,
} from './platformApiClient';

export type PlatformOrderDraftSnapshot = Record<string, unknown>;

export type PlatformSaveOrderDraftRequest = {
  draftSnapshot: PlatformOrderDraftSnapshot;
  clientUpdatedAtIso?: string;
  baseUpdatedAtIso?: string;
};

export type PlatformOrderDraft = PlatformSaveOrderDraftRequest & {
  shipperId: string;
  updatedAtIso: string;
};

export function createPlatformOrderDraftApi(config: PlatformApiConfig) {
  return {
    getDraft() {
      return platformGet<PlatformOrderDraft | null>(
        config,
        '/shipper/order-draft',
      );
    },
    async saveDraft(request: PlatformSaveOrderDraftRequest) {
      const normalizedRequest = normalizeSaveOrderDraftRequest(request);

      return platformPut<PlatformSaveOrderDraftRequest, PlatformOrderDraft>(
        config,
        '/shipper/order-draft',
        normalizedRequest,
      );
    },
  };
}

function normalizeSaveOrderDraftRequest(
  request: PlatformSaveOrderDraftRequest,
): PlatformSaveOrderDraftRequest {
  if (!isPlainObject(request)) {
    throwInvalidOrderDraftRequest('Order draft request must be an object');
  }

  const { draftSnapshot, clientUpdatedAtIso, baseUpdatedAtIso } = request;

  if (!isPlainObject(draftSnapshot)) {
    throwInvalidOrderDraftRequest('Order draft snapshot must be an object');
  }

  const normalizedRequest: PlatformSaveOrderDraftRequest = {
    draftSnapshot,
  };
  const normalizedClientUpdatedAtIso = normalizeOptionalIsoString(
    clientUpdatedAtIso,
    'Order draft client updated time is invalid',
  );
  const normalizedBaseUpdatedAtIso = normalizeOptionalIsoString(
    baseUpdatedAtIso,
    'Order draft base updated time is invalid',
  );

  if (normalizedClientUpdatedAtIso !== undefined) {
    normalizedRequest.clientUpdatedAtIso = normalizedClientUpdatedAtIso;
  }

  if (normalizedBaseUpdatedAtIso !== undefined) {
    normalizedRequest.baseUpdatedAtIso = normalizedBaseUpdatedAtIso;
  }

  return normalizedRequest;
}

function normalizeOptionalTrimmedString(value: unknown, message: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throwInvalidOrderDraftRequest(message);
  }

  const normalizedValue = value.trim();

  return normalizedValue === '' ? undefined : normalizedValue;
}

function normalizeOptionalIsoString(value: unknown, message: string) {
  const normalizedValue = normalizeOptionalTrimmedString(value, message);

  if (
    normalizedValue !== undefined &&
    Number.isNaN(Date.parse(normalizedValue))
  ) {
    throwInvalidOrderDraftRequest(message);
  }

  return normalizedValue;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwInvalidOrderDraftRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_ORDER_DRAFT_REQUEST_INVALID',
    0,
  );
}
