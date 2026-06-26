export const ApiErrorCode = {
  AUTH_CODE_EXPIRED: 'AUTH_CODE_EXPIRED',
  AUTH_CODE_INVALID: 'AUTH_CODE_INVALID',
  AUTH_REFRESH_TOKEN_INVALID: 'AUTH_REFRESH_TOKEN_INVALID',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export class BusinessError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}
