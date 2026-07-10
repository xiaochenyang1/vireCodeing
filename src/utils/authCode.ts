export const LOCAL_CODE_TTL_MS = 5 * 60 * 1000;
export const LOCAL_CODE_RESEND_COOLDOWN_MS = 60 * 1000;
export const LOCAL_CODE_HOURLY_LIMIT_MS = 60 * 60 * 1000;
export const LOCAL_CODE_HOURLY_LIMIT_COUNT = 5;
export const LOCAL_DEMO_CODE = '123456';

export type AuthCodeSession = {
  phone: string;
  code: string;
  expiresAt: number;
  cooldownUntil: number;
  sentAtList: number[];
};

export function getCodeSentAtListWithinHourlyWindow(
  session: AuthCodeSession | undefined,
  phone: string,
  now: number,
) {
  if (!session || session.phone !== phone.trim()) {
    return [];
  }

  return session.sentAtList.filter(
    sentAt => now - sentAt < LOCAL_CODE_HOURLY_LIMIT_MS,
  );
}

export function hasReachedCodeHourlyLimit(
  session: AuthCodeSession | undefined,
  phone: string,
  now: number,
) {
  return (
    getCodeSentAtListWithinHourlyWindow(session, phone, now).length >=
    LOCAL_CODE_HOURLY_LIMIT_COUNT
  );
}

export function createLocalCodeSession(
  phone: string,
  now: number,
  priorSession?: AuthCodeSession,
): AuthCodeSession {
  const trimmedPhone = phone.trim();

  return {
    phone: trimmedPhone,
    code: LOCAL_DEMO_CODE,
    expiresAt: now + LOCAL_CODE_TTL_MS,
    cooldownUntil: now + LOCAL_CODE_RESEND_COOLDOWN_MS,
    sentAtList: [
      ...getCodeSentAtListWithinHourlyWindow(priorSession, trimmedPhone, now),
      now,
    ],
  };
}

export function getCodeCooldownRemainingSeconds(
  session: AuthCodeSession | undefined,
  phone: string,
  now: number,
) {
  if (!session || session.phone !== phone.trim()) {
    return 0;
  }

  return Math.max(0, Math.ceil((session.cooldownUntil - now) / 1000));
}

export function getCodeSendButtonText(
  session: AuthCodeSession | undefined,
  phone: string,
  now: number,
) {
  const cooldownSeconds = getCodeCooldownRemainingSeconds(session, phone, now);

  if (cooldownSeconds > 0) {
    return `${cooldownSeconds} 秒后重试`;
  }

  return session?.phone === phone.trim() ? '重新获取' : '获取验证码';
}

export function getCodeSessionError(
  session: AuthCodeSession | undefined,
  phone: string,
  now: number,
) {
  if (!session || session.phone !== phone.trim()) {
    return '请先获取验证码';
  }

  if (session.expiresAt <= now) {
    return '验证码已过期，请重新获取';
  }

  return '';
}

export function isMatchingLocalCode(
  session: AuthCodeSession | undefined,
  code: string,
) {
  return session?.code === code.trim();
}
