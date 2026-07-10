import {
  PlatformApiError,
  platformGet,
  platformPut,
  type PlatformApiConfig,
} from './platformApiClient';

export type PlatformFrequentRoute = {
  id: string;
  name: string;
  from: string;
  to: string;
  lastUsedText: string;
  lastUsedIso?: string;
};

export type PlatformSaveFrequentRoutesRequest = {
  routes: PlatformFrequentRoute[];
  clientUpdatedAtIso?: string;
  baseUpdatedAtIso?: string;
};

export type PlatformFrequentRoutes = PlatformSaveFrequentRoutesRequest & {
  shipperId: string;
  updatedAtIso: string;
};

export function createPlatformFrequentRoutesApi(config: PlatformApiConfig) {
  return {
    getFrequentRoutes() {
      return platformGet<PlatformFrequentRoutes | null>(
        config,
        '/shipper/profile/frequent-routes',
      );
    },
    async saveFrequentRoutes(request: PlatformSaveFrequentRoutesRequest) {
      const normalizedRequest = normalizeSaveFrequentRoutesRequest(request);

      return platformPut<
        PlatformSaveFrequentRoutesRequest,
        PlatformFrequentRoutes
      >(config, '/shipper/profile/frequent-routes', normalizedRequest);
    },
  };
}

function normalizeSaveFrequentRoutesRequest(
  request: PlatformSaveFrequentRoutesRequest,
): PlatformSaveFrequentRoutesRequest {
  if (!isPlainObject(request)) {
    throwInvalidFrequentRoutesRequest(
      'Frequent routes request must be an object',
    );
  }

  const { routes, clientUpdatedAtIso, baseUpdatedAtIso } = request;

  if (!Array.isArray(routes) || routes.length > 20) {
    throwInvalidFrequentRoutesRequest('Frequent routes are invalid');
  }

  const normalizedRequest: PlatformSaveFrequentRoutesRequest = {
    routes: routes.map(normalizeFrequentRoute),
  };
  const normalizedClientUpdatedAtIso = normalizeOptionalIsoString(
    clientUpdatedAtIso,
    'Frequent routes client updated time is invalid',
  );
  const normalizedBaseUpdatedAtIso = normalizeOptionalIsoString(
    baseUpdatedAtIso,
    'Frequent routes base updated time is invalid',
  );

  if (normalizedClientUpdatedAtIso !== undefined) {
    normalizedRequest.clientUpdatedAtIso = normalizedClientUpdatedAtIso;
  }

  if (normalizedBaseUpdatedAtIso !== undefined) {
    normalizedRequest.baseUpdatedAtIso = normalizedBaseUpdatedAtIso;
  }

  return normalizedRequest;
}

function normalizeFrequentRoute(route: PlatformFrequentRoute) {
  if (!isPlainObject(route)) {
    throwInvalidFrequentRoutesRequest('Frequent route must be an object');
  }

  const normalizedRoute: PlatformFrequentRoute = {
    id: normalizeRequiredString(route.id, 80, 'Frequent route id is invalid'),
    name: normalizeRequiredString(
      route.name,
      40,
      'Frequent route name is invalid',
    ),
    from: normalizeRequiredString(
      route.from,
      80,
      'Frequent route origin is invalid',
    ),
    to: normalizeRequiredString(
      route.to,
      80,
      'Frequent route destination is invalid',
    ),
    lastUsedText: normalizeRequiredString(
      route.lastUsedText,
      30,
      'Frequent route last used text is invalid',
    ),
  };
  const lastUsedIso = normalizeOptionalIsoString(
    route.lastUsedIso,
    'Frequent route last used time is invalid',
  );

  if (lastUsedIso !== undefined) {
    normalizedRoute.lastUsedIso = lastUsedIso;
  }

  return normalizedRoute;
}

function normalizeRequiredString(
  value: unknown,
  maxLength: number,
  message: string,
) {
  if (typeof value !== 'string') {
    throwInvalidFrequentRoutesRequest(message);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > maxLength) {
    throwInvalidFrequentRoutesRequest(message);
  }

  return normalizedValue;
}

function normalizeOptionalTrimmedString(value: unknown, message: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throwInvalidFrequentRoutesRequest(message);
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
    throwInvalidFrequentRoutesRequest(message);
  }

  return normalizedValue;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwInvalidFrequentRoutesRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_FREQUENT_ROUTES_REQUEST_INVALID',
    0,
  );
}
