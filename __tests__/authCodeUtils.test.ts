import {
  createLocalCodeSession,
  getCodeCooldownRemainingSeconds,
  getCodeSendButtonText,
  getCodeSentAtListWithinHourlyWindow,
  getCodeSessionError,
  hasReachedCodeHourlyLimit,
  isMatchingLocalCode,
  LOCAL_CODE_HOURLY_LIMIT_MS,
  LOCAL_CODE_RESEND_COOLDOWN_MS,
  LOCAL_CODE_TTL_MS,
  LOCAL_DEMO_CODE,
  type AuthCodeSession,
} from '../src/utils/authCode';
import { getAuthErrorMessage } from '../src/utils/authMessages';

describe('auth code utils', () => {
  const phone = '13800138000';
  const now = 10_000_000;

  it('creates a trimmed local code session and keeps only hourly sends for the same phone', () => {
    const priorSession: AuthCodeSession = {
      phone,
      code: '000000',
      expiresAt: now,
      cooldownUntil: now,
      sentAtList: [
        now - LOCAL_CODE_HOURLY_LIMIT_MS,
        now - LOCAL_CODE_HOURLY_LIMIT_MS + 1,
        now - 10_000,
      ],
    };

    expect(createLocalCodeSession(` ${phone} `, now, priorSession)).toEqual({
      phone,
      code: LOCAL_DEMO_CODE,
      expiresAt: now + LOCAL_CODE_TTL_MS,
      cooldownUntil: now + LOCAL_CODE_RESEND_COOLDOWN_MS,
      sentAtList: [
        now - LOCAL_CODE_HOURLY_LIMIT_MS + 1,
        now - 10_000,
        now,
      ],
    });
  });

  it('does not reuse sent history or cooldowns across phone numbers', () => {
    const priorSession: AuthCodeSession = {
      phone,
      code: LOCAL_DEMO_CODE,
      expiresAt: now + LOCAL_CODE_TTL_MS,
      cooldownUntil: now + LOCAL_CODE_RESEND_COOLDOWN_MS,
      sentAtList: [now - 1_000],
    };

    expect(
      getCodeSentAtListWithinHourlyWindow(priorSession, '13900139000', now),
    ).toEqual([]);
    expect(
      getCodeCooldownRemainingSeconds(priorSession, '13900139000', now),
    ).toBe(0);
  });

  it('detects the hourly send limit inside the current phone window', () => {
    const limitedSession: AuthCodeSession = {
      phone,
      code: LOCAL_DEMO_CODE,
      expiresAt: now + LOCAL_CODE_TTL_MS,
      cooldownUntil: now,
      sentAtList: [now - 1, now - 2, now - 3, now - 4, now - 5],
    };
    const availableSession: AuthCodeSession = {
      ...limitedSession,
      sentAtList: [
        now - LOCAL_CODE_HOURLY_LIMIT_MS,
        now - 1,
        now - 2,
        now - 3,
        now - 4,
      ],
    };

    expect(hasReachedCodeHourlyLimit(limitedSession, phone, now)).toBe(true);
    expect(hasReachedCodeHourlyLimit(availableSession, phone, now)).toBe(false);
    expect(
      hasReachedCodeHourlyLimit(limitedSession, '13900139000', now),
    ).toBe(false);
  });

  it('returns rounded cooldown seconds and matching button text', () => {
    const session: AuthCodeSession = {
      phone,
      code: LOCAL_DEMO_CODE,
      expiresAt: now + LOCAL_CODE_TTL_MS,
      cooldownUntil: now + 1001,
      sentAtList: [now],
    };

    expect(getCodeCooldownRemainingSeconds(session, phone, now)).toBe(2);
    expect(getCodeSendButtonText(session, phone, now)).toBe('2 秒后重试');
    expect(
      getCodeSendButtonText({...session, cooldownUntil: now}, phone, now),
    ).toBe('重新获取');
    expect(getCodeSendButtonText(undefined, phone, now)).toBe('获取验证码');
  });

  it('returns actionable session validation errors', () => {
    const session: AuthCodeSession = {
      phone,
      code: LOCAL_DEMO_CODE,
      expiresAt: now + 1,
      cooldownUntil: now,
      sentAtList: [now],
    };

    expect(getCodeSessionError(undefined, phone, now)).toBe('请先获取验证码');
    expect(
      getCodeSessionError({...session, phone: '13900139000'}, phone, now),
    ).toBe('请先获取验证码');
    expect(getCodeSessionError({...session, expiresAt: now}, phone, now)).toBe(
      '验证码已过期，请重新获取',
    );
    expect(getCodeSessionError(session, phone, now)).toBe('');
  });

  it('matches the local demo verification code after trimming input', () => {
    const session: AuthCodeSession = {
      phone,
      code: LOCAL_DEMO_CODE,
      expiresAt: now + LOCAL_CODE_TTL_MS,
      cooldownUntil: now,
      sentAtList: [now],
    };

    expect(isMatchingLocalCode(session, ` ${LOCAL_DEMO_CODE} `)).toBe(true);
    expect(isMatchingLocalCode(session, '000000')).toBe(false);
    expect(isMatchingLocalCode(undefined, LOCAL_DEMO_CODE)).toBe(false);
  });
});

describe('auth error messages', () => {
  it.each([
    ['AUTH_CODE_DELIVERY_FAILED', '短信服务暂不可用，请稍后重试'],
    ['AUTH_CODE_RATE_LIMITED', '获取验证码过于频繁，请稍后再试'],
    ['NETWORK_ERROR', '网络连接不可用，请检查网络后重试'],
    ['AUTH_USER_DISABLED', '账号已禁用，请联系客服处理'],
    ['AUTH_PASSWORD_INVALID', '手机号或密码错误'],
    ['AUTH_PASSWORD_RESET_INVALID', '手机号或验证码错误'],
  ])('maps platform error code %s to a user-facing message', (code, message) => {
    const error = Object.assign(new Error('raw platform message'), {code});

    expect(getAuthErrorMessage(error, '兜底文案')).toBe(message);
  });

  it('falls back to error message text and then the provided fallback', () => {
    expect(getAuthErrorMessage(new Error('服务开小差了'), '兜底文案')).toBe(
      '服务开小差了',
    );
    expect(getAuthErrorMessage({code: 'NETWORK_ERROR'}, '兜底文案')).toBe(
      '兜底文案',
    );
    expect(getAuthErrorMessage(undefined, '兜底文案')).toBe('兜底文案');
  });
});
