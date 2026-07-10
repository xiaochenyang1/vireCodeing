const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AUTH_CODE_DELIVERY_FAILED: '短信服务暂不可用，请稍后重试',
  AUTH_CODE_RATE_LIMITED: '获取验证码过于频繁，请稍后再试',
  NETWORK_ERROR: '网络连接不可用，请检查网络后重试',
  AUTH_USER_DISABLED: '账号已禁用，请联系客服处理',
  AUTH_PASSWORD_INVALID: '手机号或密码错误',
  AUTH_PASSWORD_RESET_INVALID: '手机号或验证码错误',
};

type ErrorWithCode = Error & {
  code?: unknown;
};

export function getAuthErrorMessage(
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof Error) {
    const code = (error as ErrorWithCode).code;

    if (typeof code === 'string' && AUTH_ERROR_MESSAGES[code]) {
      return AUTH_ERROR_MESSAGES[code];
    }

    if (error.message) {
      return error.message;
    }
  }

  return fallbackMessage;
}
