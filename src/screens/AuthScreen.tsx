import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useState } from 'react';

import { AuthField } from '../components/AuthField';
import { colors, styles } from '../styles';
import type { AuthMode } from '../types';
import {
  createLocalCodeSession,
  getCodeCooldownRemainingSeconds,
  getCodeSendButtonText,
  getCodeSessionError,
  hasReachedCodeHourlyLimit,
  isMatchingLocalCode,
  LOCAL_DEMO_CODE,
  type AuthCodeSession,
} from '../utils/authCode';
import { getAuthErrorMessage } from '../utils/authMessages';
import {
  isStrongPassword,
  isValidCode,
  isValidPhone,
  maskPhone,
} from '../utils/order';
import type {
  PlatformAuthenticatedUser,
  PlatformAuthTokens,
  PlatformMobileUserType,
  createPlatformAuthApi,
} from '../services/platformAuthApi';

type PlatformAuthApi = Pick<
  ReturnType<typeof createPlatformAuthApi>,
  'sendCode' | 'login'
> & {
  passwordLogin?: ReturnType<typeof createPlatformAuthApi>['passwordLogin'];
  register?: ReturnType<typeof createPlatformAuthApi>['register'];
  resetPassword?: ReturnType<typeof createPlatformAuthApi>['resetPassword'];
};

type LoginMethod = 'code' | 'password';
type AuthSubMode = 'auth' | 'reset-password';

export function AuthScreen({
  now = Date.now(),
  onAuthenticated,
  platformAuthApi,
  deviceId = 'local-device',
}: {
  now?: number;
  onAuthenticated: (
    tokens?: PlatformAuthTokens,
    user?: PlatformAuthenticatedUser,
  ) => void;
  platformAuthApi?: PlatformAuthApi;
  deviceId?: string;
}) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [selectedUserType, setSelectedUserType] =
    useState<PlatformMobileUserType>('shipper');
  const [authSubMode, setAuthSubMode] = useState<AuthSubMode>('auth');
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('code');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginCodeSession, setLoginCodeSession] = useState<AuthCodeSession>();
  const [loginCode, setLoginCode] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [resetPhone, setResetPhone] = useState('');
  const [resetCodeSession, setResetCodeSession] = useState<AuthCodeSession>();
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerCodeSession, setRegisterCodeSession] =
    useState<AuthCodeSession>();
  const [registerCode, setRegisterCode] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerAgreementAccepted, setRegisterAgreementAccepted] =
    useState(false);
  const [notice, setNotice] = useState('');

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setAuthSubMode('auth');
    setNotice('');
  };

  const switchLoginMethod = (nextMethod: LoginMethod) => {
    setLoginMethod(nextMethod);
    setAuthSubMode('auth');
    setNotice('');
  };

  const openResetPassword = () => {
    setMode('login');
    setAuthSubMode('reset-password');
    setResetPhone(loginPhone.trim());
    setNotice('');
  };

  const backToPasswordLogin = (message = '') => {
    setMode('login');
    setLoginMethod('password');
    setAuthSubMode('auth');
    setNotice(message);
  };

  const sendLoginCode = async () => {
    if (!isValidPhone(loginPhone)) {
      setNotice('请输入11位手机号后再获取验证码');
      return;
    }

    const cooldownSeconds = getCodeCooldownRemainingSeconds(
      loginCodeSession,
      loginPhone,
      now,
    );

    if (cooldownSeconds > 0) {
      setNotice(`请 ${cooldownSeconds} 秒后重新获取验证码`);
      return;
    }

    const trimmedPhone = loginPhone.trim();
    if (hasReachedCodeHourlyLimit(loginCodeSession, trimmedPhone, now)) {
      setNotice('同一手机号 1 小时内最多获取 5 次验证码');
      return;
    }

    const nextSession = createLocalCodeSession(
      trimmedPhone,
      now,
      loginCodeSession,
    );

    if (platformAuthApi) {
      try {
        const result = await platformAuthApi.sendCode({
          phone: trimmedPhone,
          purpose: 'login',
        });

        setLoginCodeSession({
          ...nextSession,
          code: result.devCode ?? '',
          expiresAt: now + result.expireSeconds * 1000,
        });
        setNotice(`验证码已发送到 ${maskPhone(trimmedPhone)}，等待平台接口验证。`);
      } catch (error) {
        setNotice(getAuthErrorMessage(error, '验证码发送失败，请稍后重试'));
      }
      return;
    }

    setLoginCodeSession(nextSession);
    setNotice(
      `验证码已发送到 ${maskPhone(trimmedPhone)}，当前为本地演示页。本地验证码：${LOCAL_DEMO_CODE}。`,
    );
  };

  const sendRegisterCode = async () => {
    if (!isValidPhone(registerPhone)) {
      setNotice('请输入11位手机号后再获取验证码');
      return;
    }

    const cooldownSeconds = getCodeCooldownRemainingSeconds(
      registerCodeSession,
      registerPhone,
      now,
    );

    if (cooldownSeconds > 0) {
      setNotice(`请 ${cooldownSeconds} 秒后重新获取验证码`);
      return;
    }

    const trimmedPhone = registerPhone.trim();
    if (hasReachedCodeHourlyLimit(registerCodeSession, trimmedPhone, now)) {
      setNotice('同一手机号 1 小时内最多获取 5 次验证码');
      return;
    }

    const nextSession = createLocalCodeSession(
      trimmedPhone,
      now,
      registerCodeSession,
    );

    if (platformAuthApi?.register) {
      try {
        const result = await platformAuthApi.sendCode({
          phone: trimmedPhone,
          purpose: 'register',
        });

        setRegisterCodeSession({
          ...nextSession,
          code: result.devCode ?? '',
          expiresAt: now + result.expireSeconds * 1000,
        });
        setNotice(`验证码已发送到 ${maskPhone(trimmedPhone)}，等待平台接口验证。`);
      } catch (error) {
        setNotice(getAuthErrorMessage(error, '验证码发送失败，请稍后重试'));
      }
      return;
    }

    setRegisterCodeSession(nextSession);
    setNotice(
      `验证码已发送到 ${maskPhone(trimmedPhone)}，当前为本地演示页。本地验证码：${LOCAL_DEMO_CODE}。`,
    );
  };

  const sendResetCode = async () => {
    if (!platformAuthApi?.resetPassword) {
      return;
    }

    if (!isValidPhone(resetPhone)) {
      setNotice('请输入11位手机号后再获取验证码');
      return;
    }

    const cooldownSeconds = getCodeCooldownRemainingSeconds(
      resetCodeSession,
      resetPhone,
      now,
    );

    if (cooldownSeconds > 0) {
      setNotice(`请 ${cooldownSeconds} 秒后重新获取验证码`);
      return;
    }

    const trimmedPhone = resetPhone.trim();
    if (hasReachedCodeHourlyLimit(resetCodeSession, trimmedPhone, now)) {
      setNotice('同一手机号 1 小时内最多获取 5 次验证码');
      return;
    }

    const nextSession = createLocalCodeSession(
      trimmedPhone,
      now,
      resetCodeSession,
    );

    try {
      const result = await platformAuthApi.sendCode({
        phone: trimmedPhone,
        purpose: 'reset',
      });

      setResetCodeSession({
        ...nextSession,
        code: result.devCode ?? '',
        expiresAt: now + result.expireSeconds * 1000,
      });
      setNotice(`验证码已发送到 ${maskPhone(trimmedPhone)}，等待平台接口验证。`);
    } catch (error) {
      setNotice(getAuthErrorMessage(error, '验证码发送失败，请稍后重试'));
    }
  };

  const submitLogin = async () => {
    if (!isValidPhone(loginPhone)) {
      setNotice('请输入11位手机号');
      return;
    }

    if (loginMethod === 'password' && platformAuthApi?.passwordLogin) {
      if (!isStrongPassword(loginPassword)) {
        setNotice('密码需至少 6 位并包含字母和数字');
        return;
      }

      try {
        const result = await platformAuthApi.passwordLogin({
          phone: loginPhone.trim(),
          password: loginPassword,
          userType: selectedUserType,
          deviceId,
        });

        setNotice('');
        onAuthenticated(result.tokens, result.user);
      } catch (error) {
        setNotice(getAuthErrorMessage(error, '登录失败，请稍后重试'));
      }
      return;
    }

    const codeSessionError = getCodeSessionError(
      loginCodeSession,
      loginPhone,
      now,
    );

    if (codeSessionError) {
      setNotice(codeSessionError);
      return;
    }

    if (!isValidCode(loginCode)) {
      setNotice('请输入6位验证码');
      return;
    }

    if (!platformAuthApi && !isMatchingLocalCode(loginCodeSession, loginCode)) {
      setNotice('验证码不正确，请输入本地演示验证码');
      return;
    }

    if (platformAuthApi) {
      try {
        const result = await platformAuthApi.login({
          phone: loginPhone.trim(),
          code: loginCode.trim(),
          userType: selectedUserType,
          deviceId,
        });

        setNotice('');
        onAuthenticated(result.tokens, result.user);
      } catch (error) {
        setNotice(getAuthErrorMessage(error, '登录失败，请稍后重试'));
      }
      return;
    }

    setNotice('');
    onAuthenticated(undefined, {
      id: `local-${selectedUserType}`,
      phone: loginPhone.trim(),
      userType: selectedUserType,
    });
  };

  const submitRegister = async () => {
    if (!isValidPhone(registerPhone)) {
      setNotice('请输入11位手机号');
      return;
    }

    const codeSessionError = getCodeSessionError(
      registerCodeSession,
      registerPhone,
      now,
    );

    if (codeSessionError) {
      setNotice(codeSessionError);
      return;
    }

    if (!isValidCode(registerCode)) {
      setNotice('请输入6位验证码');
      return;
    }

    if (
      !platformAuthApi?.register &&
      !isMatchingLocalCode(registerCodeSession, registerCode)
    ) {
      setNotice('验证码不正确，请输入本地演示验证码');
      return;
    }

    if (!isStrongPassword(registerPassword)) {
      setNotice('密码需至少 6 位并包含字母和数字');
      return;
    }

    if (!registerAgreementAccepted) {
      setNotice('请先勾选用户协议和隐私政策');
      return;
    }

    if (platformAuthApi?.register) {
      try {
        const result = await platformAuthApi.register({
          phone: registerPhone.trim(),
          code: registerCode.trim(),
          userType: selectedUserType,
          deviceId,
          password: registerPassword,
        });

        setNotice('');
        onAuthenticated(result.tokens, result.user);
      } catch (error) {
        setNotice(getAuthErrorMessage(error, '注册失败，请稍后重试'));
      }
      return;
    }

    setNotice('');
    onAuthenticated(undefined, {
      id: `local-${selectedUserType}`,
      phone: registerPhone.trim(),
      userType: selectedUserType,
    });
  };

  const submitResetPassword = async () => {
    if (!platformAuthApi?.resetPassword) {
      return;
    }

    if (!isValidPhone(resetPhone)) {
      setNotice('请输入11位手机号');
      return;
    }

    const codeSessionError = getCodeSessionError(
      resetCodeSession,
      resetPhone,
      now,
    );

    if (codeSessionError) {
      setNotice(codeSessionError);
      return;
    }

    if (!isValidCode(resetCode)) {
      setNotice('请输入6位验证码');
      return;
    }

    if (!isStrongPassword(resetPassword)) {
      setNotice('密码需至少 6 位并包含字母和数字');
      return;
    }

    try {
      await platformAuthApi.resetPassword({
        phone: resetPhone.trim(),
        code: resetCode.trim(),
        password: resetPassword,
      });

      setLoginPhone(resetPhone.trim());
      setLoginPassword('');
      setResetCode('');
      setResetPassword('');
      setResetCodeSession(undefined);
      backToPasswordLogin('密码已重置，请使用新密码登录');
    } catch (error) {
      setNotice(getAuthErrorMessage(error, '密码重置失败，请稍后重试'));
    }
  };

  const loginCodeSendButtonText = getCodeSendButtonText(
    loginCodeSession,
    loginPhone,
    now,
  );
  const registerCodeSendButtonText = getCodeSendButtonText(
    registerCodeSession,
    registerPhone,
    now,
  );
  const resetCodeSendButtonText = getCodeSendButtonText(
    resetCodeSession,
    resetPhone,
    now,
  );
  const supportsPasswordLogin = Boolean(platformAuthApi?.passwordLogin);
  const supportsPasswordReset = Boolean(platformAuthApi?.resetPassword);
  const authDescription = platformAuthApi
    ? '先登录或注册，再进入首页发货。登录和注册已接入平台认证接口。'
    : '先登录或注册，再进入首页发货。当前版本只做本地演示，不接后端。';

  return (
    <KeyboardAvoidingView
      style={styles.authScreen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.authContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.authHero}>
          <Text style={styles.authKicker}>
            {selectedUserType === 'driver' ? '司机端' : '货主端'}
          </Text>
          <Text style={styles.authTitle}>账号验证</Text>
          <Text style={styles.authDescription}>{authDescription}</Text>
        </View>

        <View style={styles.authCard}>
          <View style={styles.authTabRow}>
            <Pressable
              testID="auth-user-type-shipper"
              style={[
                styles.authTabButton,
                selectedUserType === 'shipper' && styles.authTabButtonActive,
              ]}
              onPress={() => setSelectedUserType('shipper')}
            >
              <Text
                style={[
                  styles.authTabText,
                  selectedUserType === 'shipper' && styles.authTabTextActive,
                ]}
              >
                货主
              </Text>
            </Pressable>
            <Pressable
              testID="auth-user-type-driver"
              style={[
                styles.authTabButton,
                selectedUserType === 'driver' && styles.authTabButtonActive,
              ]}
              onPress={() => setSelectedUserType('driver')}
            >
              <Text
                style={[
                  styles.authTabText,
                  selectedUserType === 'driver' && styles.authTabTextActive,
                ]}
              >
                司机
              </Text>
            </Pressable>
          </View>

          <View style={styles.authTabRow}>
            <Pressable
              testID="auth-tab-login"
              style={[
                styles.authTabButton,
                mode === 'login' && styles.authTabButtonActive,
              ]}
              onPress={() => switchMode('login')}
            >
              <Text
                style={[
                  styles.authTabText,
                  mode === 'login' && styles.authTabTextActive,
                ]}
              >
                登录
              </Text>
            </Pressable>
            <Pressable
              testID="auth-tab-register"
              style={[
                styles.authTabButton,
                mode === 'register' && styles.authTabButtonActive,
              ]}
              onPress={() => switchMode('register')}
            >
              <Text
                style={[
                  styles.authTabText,
                  mode === 'register' && styles.authTabTextActive,
                ]}
              >
                注册
              </Text>
            </Pressable>
          </View>

          {mode === 'login' && authSubMode === 'reset-password' ? (
            <View style={styles.authForm}>
              <AuthField
                testID="auth-reset-phone"
                label="手机号"
                placeholder="请输入手机号"
                value={resetPhone}
                onChangeText={setResetPhone}
                keyboardType="phone-pad"
                maxLength={11}
              />
              <View style={styles.authField}>
                <Text style={styles.authLabel}>验证码</Text>
                <View style={styles.authInlineRow}>
                  <TextInput
                    testID="auth-reset-code"
                    style={[styles.authInput, styles.authInlineInput]}
                    placeholder="请输入 6 位验证码"
                    placeholderTextColor={colors.textMuted}
                    value={resetCode}
                    onChangeText={setResetCode}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <Pressable
                    testID="auth-reset-code-send"
                    style={styles.authInlineButton}
                    onPress={sendResetCode}
                  >
                    <Text style={styles.authInlineButtonText}>
                      {resetCodeSendButtonText}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <AuthField
                testID="auth-reset-password"
                label="新密码"
                placeholder="至少 6 位，包含字母和数字"
                value={resetPassword}
                onChangeText={setResetPassword}
                secureTextEntry
              />

              {notice ? <Text style={styles.authNotice}>{notice}</Text> : null}

              <Pressable
                testID="auth-reset-submit"
                style={({ pressed }) => [
                  styles.authPrimaryButton,
                  pressed && styles.pressedButton,
                ]}
                onPress={submitResetPassword}
              >
                <Text style={styles.authPrimaryButtonText}>重置密码</Text>
              </Pressable>
              <Pressable
                testID="auth-reset-back"
                style={styles.authInlineButton}
                onPress={() => backToPasswordLogin()}
              >
                <Text style={styles.authInlineButtonText}>返回密码登录</Text>
              </Pressable>
            </View>
          ) : mode === 'login' ? (
            <View style={styles.authForm}>
              {supportsPasswordLogin ? (
                <View style={styles.authTabRow}>
                  <Pressable
                    testID="auth-login-method-code"
                    style={[
                      styles.authTabButton,
                      loginMethod === 'code' && styles.authTabButtonActive,
                    ]}
                    onPress={() => switchLoginMethod('code')}
                  >
                    <Text
                      style={[
                        styles.authTabText,
                        loginMethod === 'code' && styles.authTabTextActive,
                      ]}
                    >
                      验证码登录
                    </Text>
                  </Pressable>
                  <Pressable
                    testID="auth-login-method-password"
                    style={[
                      styles.authTabButton,
                      loginMethod === 'password' && styles.authTabButtonActive,
                    ]}
                    onPress={() => switchLoginMethod('password')}
                  >
                    <Text
                      style={[
                        styles.authTabText,
                        loginMethod === 'password' && styles.authTabTextActive,
                      ]}
                    >
                      密码登录
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              <AuthField
                testID="auth-login-phone"
                label="手机号"
                placeholder="请输入手机号"
                value={loginPhone}
                onChangeText={setLoginPhone}
                keyboardType="phone-pad"
                maxLength={11}
              />
              {loginMethod === 'password' && supportsPasswordLogin ? (
                <View style={styles.authField}>
                  <Text style={styles.authLabel}>密码</Text>
                  <TextInput
                    testID="auth-login-password"
                    style={styles.authInput}
                    placeholder="请输入登录密码"
                    placeholderTextColor={colors.textMuted}
                    value={loginPassword}
                    onChangeText={setLoginPassword}
                    secureTextEntry
                  />
                </View>
              ) : (
                <View style={styles.authField}>
                  <Text style={styles.authLabel}>验证码</Text>
                  <View style={styles.authInlineRow}>
                    <TextInput
                      testID="auth-login-code"
                      style={[styles.authInput, styles.authInlineInput]}
                      placeholder="请输入 6 位验证码"
                      placeholderTextColor={colors.textMuted}
                      value={loginCode}
                      onChangeText={setLoginCode}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                    <Pressable
                      testID="auth-login-code-send"
                      style={styles.authInlineButton}
                      onPress={sendLoginCode}
                    >
                      <Text style={styles.authInlineButtonText}>
                        {loginCodeSendButtonText}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {notice ? <Text style={styles.authNotice}>{notice}</Text> : null}

              {supportsPasswordReset && supportsPasswordLogin ? (
                <Pressable
                  testID="auth-reset-password-link"
                  style={styles.authInlineButton}
                  onPress={openResetPassword}
                >
                  <Text style={styles.authInlineButtonText}>忘记密码</Text>
                </Pressable>
              ) : null}

              <Pressable
                testID="auth-login-submit"
                style={({ pressed }) => [
                  styles.authPrimaryButton,
                  pressed && styles.pressedButton,
                ]}
                onPress={submitLogin}
              >
                <Text style={styles.authPrimaryButtonText}>登录并进入首页</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.authForm}>
              <AuthField
                testID="auth-register-phone"
                label="手机号"
                placeholder="请输入手机号"
                value={registerPhone}
                onChangeText={setRegisterPhone}
                keyboardType="phone-pad"
                maxLength={11}
              />
              <View style={styles.authField}>
                <Text style={styles.authLabel}>验证码</Text>
                <View style={styles.authInlineRow}>
                  <TextInput
                    testID="auth-register-code"
                    style={[styles.authInput, styles.authInlineInput]}
                    placeholder="请输入 6 位验证码"
                    placeholderTextColor={colors.textMuted}
                    value={registerCode}
                    onChangeText={setRegisterCode}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <Pressable
                    testID="auth-register-code-send"
                    style={styles.authInlineButton}
                    onPress={sendRegisterCode}
                  >
                    <Text style={styles.authInlineButtonText}>
                      {registerCodeSendButtonText}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <AuthField
                testID="auth-register-password"
                label="密码"
                placeholder="至少 6 位"
                value={registerPassword}
                onChangeText={setRegisterPassword}
                secureTextEntry
              />

              <Pressable
                testID="auth-register-agreement"
                style={styles.authAgreementRow}
                onPress={() =>
                  setRegisterAgreementAccepted(current => !current)
                }
              >
                <View
                  style={[
                    styles.authCheckbox,
                    registerAgreementAccepted && styles.authCheckboxActive,
                  ]}
                >
                  {registerAgreementAccepted ? (
                    <Text style={styles.authCheckboxMark}>✓</Text>
                  ) : null}
                </View>
                <Text style={styles.authAgreementText}>
                  已阅读并同意用户协议和隐私政策
                </Text>
              </Pressable>

              {notice ? <Text style={styles.authNotice}>{notice}</Text> : null}

              <Pressable
                testID="auth-register-submit"
                style={({ pressed }) => [
                  styles.authPrimaryButton,
                  pressed && styles.pressedButton,
                ]}
                onPress={submitRegister}
              >
                <Text style={styles.authPrimaryButtonText}>注册并进入首页</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
