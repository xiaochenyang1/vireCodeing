export type PlatformApiConfig = {
  baseUrl: string;
  getAccessToken?: () => string | undefined;
  getRequestId?: () => string | undefined;
};

export type PlatformApiResponse<T> = {
  code: 'OK';
  message: 'success';
  data: T;
  requestId: string;
  timestamp: string;
};

export type PlatformApiErrorBody = {
  code: string;
  message: string;
  requestId?: string;
  timestamp?: string;
};

export type PlatformApiRequestOptions = {
  includeAuth?: boolean;
  headers?: Record<string, string>;
};

export class PlatformApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

export async function platformPost<TRequest, TResponse>(
  config: PlatformApiConfig,
  path: string,
  body: TRequest,
  options: PlatformApiRequestOptions = {},
): Promise<TResponse> {
  return platformRequest<TResponse>(config, path, {
    method: 'POST',
    body: JSON.stringify(body),
  }, options);
}

export async function platformPut<TRequest, TResponse>(
  config: PlatformApiConfig,
  path: string,
  body: TRequest,
  options: PlatformApiRequestOptions = {},
): Promise<TResponse> {
  return platformRequest<TResponse>(config, path, {
    method: 'PUT',
    body: JSON.stringify(body),
  }, options);
}

export async function platformGet<TResponse>(
  config: PlatformApiConfig,
  path: string,
  options: PlatformApiRequestOptions = {},
): Promise<TResponse> {
  return platformRequest<TResponse>(config, path, {
    method: 'GET',
  }, options);
}

async function platformRequest<TResponse>(
  config: PlatformApiConfig,
  path: string,
  init: RequestInit,
  options: PlatformApiRequestOptions,
): Promise<TResponse> {
  const accessToken =
    options.includeAuth === false ? undefined : config.getAccessToken?.();
  const requestId = config.getRequestId?.();
  let response: Response;

  if (options.includeAuth !== false && !accessToken) {
    throw new PlatformApiError(
      'Platform API access token is missing',
      'AUTH_ACCESS_TOKEN_MISSING',
      0,
    );
  }

  try {
    response = await fetch(createPlatformRequestUrl(config.baseUrl, path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(requestId ? { 'x-request-id': requestId } : {}),
        ...(options.headers ?? {}),
        ...init.headers,
      },
    });
  } catch {
    throw new PlatformApiError(
      'Platform API network request failed',
      'NETWORK_ERROR',
      0,
    );
  }

  if (!response.ok) {
    throw await createPlatformApiError(response);
  }

  const payload = await parsePlatformResponseBody(response);

  if (isPlatformApiResponse<TResponse>(payload)) {
    return payload.data;
  }

  if (payload.code === 'OK') {
    throw createInvalidPlatformResponseError(response.status, payload.requestId);
  }

  const error = createPlatformApiErrorFromBody(payload, response.status);

  if (error) {
    throw error;
  }

  throw createInvalidPlatformResponseError(response.status, payload.requestId);
}

function createPlatformRequestUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function parsePlatformResponseBody<TResponse>(
  response: Response,
): Promise<PlatformApiResponse<TResponse> | PlatformApiErrorBody> {
  try {
    return (await response.json()) as
      | PlatformApiResponse<TResponse>
      | PlatformApiErrorBody;
  } catch {
    throw createInvalidPlatformResponseError(response.status);
  }
}

async function createPlatformApiError(response: Response) {
  try {
    const payload = (await response.json()) as PlatformApiErrorBody;

    const error = createPlatformApiErrorFromBody(payload, response.status);

    if (error) {
      return error;
    }
  } catch {
    // Fall through to the generic transport error below.
  }

  return new PlatformApiError(
    `Platform API request failed: ${response.status}`,
    'HTTP_ERROR',
    response.status,
  );
}

function createPlatformApiErrorFromBody(
  payload: Partial<PlatformApiErrorBody>,
  status: number,
) {
  if (payload.code && payload.message) {
    return new PlatformApiError(
      payload.message,
      payload.code,
      status,
      payload.requestId,
    );
  }

  return undefined;
}

function createInvalidPlatformResponseError(
  status: number,
  requestId?: string,
) {
  return new PlatformApiError(
    'Platform API response is invalid',
    'PLATFORM_RESPONSE_INVALID',
    status,
    requestId,
  );
}

function isPlatformApiResponse<TResponse>(
  payload: PlatformApiResponse<TResponse> | PlatformApiErrorBody,
): payload is PlatformApiResponse<TResponse> {
  return payload.code === 'OK' && 'data' in payload;
}
