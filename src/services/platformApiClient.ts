export type PlatformApiConfig = {
  baseUrl: string;
  getAccessToken?: () => string | undefined;
};

export type PlatformApiResponse<T> = {
  code: 'OK';
  message: 'success';
  data: T;
  requestId: string;
  timestamp: string;
};

export async function platformPost<TRequest, TResponse>(
  config: PlatformApiConfig,
  path: string,
  body: TRequest,
): Promise<TResponse> {
  const accessToken = config.getAccessToken?.();
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Platform API request failed: ${response.status}`);
  }

  const payload = (await response.json()) as PlatformApiResponse<TResponse>;

  if (payload.code !== 'OK') {
    throw new Error(payload.message);
  }

  return payload.data;
}
