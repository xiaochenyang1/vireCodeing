import { Pressable, Text, View } from 'react-native';
import { useRef, useState } from 'react';

import { AuthField } from '../../components/AuthField';
import { appVersionInfo } from '../../data/mockData';
import { styles } from '../../styles';
import {
  createConfirmedPrivacySettings,
  createLocalPermissionDeniedStatuses,
  createUpdatedPasswordSettings,
  defaultPermissionStatuses,
  getNextSettingToggle,
  getPlatformAccountProfileErrorMessage,
  getPermissionDeniedGuideNotice,
  getPlatformPasswordChangeErrorMessage,
  getSettingDocumentState,
  isReadOnlySetting,
  localPermissionItems,
  type LocalPermissionId,
  validateAccountSettings,
  validatePasswordSettings,
} from '../../utils/profileSettings';
import type {
  SavedAccountSettings,
  SavedPasswordSettings,
  SettingItem,
} from '../../utils/profileLocalState';
import { getAuthSessionSnapshot } from '../../utils/authSession';
import type { createPlatformAuthApi } from '../../services/platformAuthApi';
import type { createPlatformProfileApi } from '../../services/platformProfileApi';

type SettingPlatformAuthApi = Pick<
  ReturnType<typeof createPlatformAuthApi>,
  'changePassword'
>;
type SettingPlatformProfileApi = Pick<
  ReturnType<typeof createPlatformProfileApi>,
  'saveAccountProfile'
>;

export function SettingRecords({
  now,
  settings,
  account,
  password,
  platformAuthApi,
  platformProfileApi,
  onUpdateSettings,
  onUpdateAccount,
  onUpdatePassword,
  onLogout,
}: {
  now: number;
  settings: SettingItem[];
  account: SavedAccountSettings;
  password: SavedPasswordSettings;
  platformAuthApi?: SettingPlatformAuthApi;
  platformProfileApi?: SettingPlatformProfileApi;
  onUpdateSettings: (settings: SettingItem[]) => void;
  onUpdateAccount: (account: SavedAccountSettings) => void;
  onUpdatePassword: (password: SavedPasswordSettings) => void;
  onLogout: () => void;
}) {
  const [notice, setNotice] = useState('');
  const [displayName, setDisplayName] = useState(account.displayName);
  const [boundPhone, setBoundPhone] = useState(account.boundPhone);
  const [avatarPhotoCount, setAvatarPhotoCount] = useState(
    account.avatarPhotoCount,
  );
  const avatarPhotoCountRef = useRef(account.avatarPhotoCount);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPrivacyPanel, setShowPrivacyPanel] = useState(false);
  const [showPermissionPanel, setShowPermissionPanel] = useState(false);
  const [showSecurityCheckPanel, setShowSecurityCheckPanel] = useState(false);
  const [permissionStatuses, setPermissionStatuses] = useState(
    defaultPermissionStatuses,
  );
  const privacySetting = settings.find(item => item.id === 'setting-privacy');
  const isPrivacyConfirmed = privacySetting?.statusText === '已确认';
  const loginProtectionSetting = settings.find(
    item => item.id === 'setting-login-protection',
  );
  const loginProtectionStatusText =
    loginProtectionSetting?.statusText ?? '未配置';

  const toggleSetting = (settingId: string) => {
    const nextToggle = getNextSettingToggle(settings, settingId);

    if (!nextToggle) {
      return;
    }

    onUpdateSettings(nextToggle.settings);
    setNotice(nextToggle.notice);
  };

  const submitAccountSettings = async () => {
    const nextAvatarPhotoCount = avatarPhotoCountRef.current;
    const validation = validateAccountSettings({
      displayName,
      boundPhone,
      avatarPhotoCount: nextAvatarPhotoCount,
      currentAccount: account,
    });

    if (validation.notice || !validation.account) {
      setNotice(validation.notice);
      return;
    }

    if (platformProfileApi) {
      if (!getAuthSessionSnapshot()?.accessToken) {
        setNotice('平台登录已过期，请重新登录后再保存账号资料。');
        return;
      }

      try {
        const platformAccount = await platformProfileApi.saveAccountProfile({
          displayName: validation.account.displayName,
        });
        const syncedAccount = {
          ...validation.account,
          displayName: platformAccount.displayName,
          boundPhone: platformAccount.phone,
        };

        onUpdateAccount(syncedAccount);
        setDisplayName(platformAccount.displayName);
        setBoundPhone(platformAccount.phone);
        setNotice(
          syncedAccount.avatarPhotoCount > 0
            ? '昵称已同步到平台，头像凭证仍为本地演示状态。'
            : '昵称已同步到平台。',
        );
        return;
      } catch (error) {
        setNotice(getPlatformAccountProfileErrorMessage(error));
        return;
      }
    }

    onUpdateAccount(validation.account);
    setNotice('账号资料已更新，当前为本地演示状态。');
  };

  const submitPasswordSettings = async () => {
    const validationNotice = validatePasswordSettings({
      currentPassword,
      savedPassword: password.savedPassword,
      newPassword,
      confirmPassword,
      usesPlatformAuth: Boolean(platformAuthApi),
    });

    if (validationNotice) {
      setNotice(validationNotice);
      return;
    }

    if (platformAuthApi) {
      if (!getAuthSessionSnapshot()?.accessToken) {
        setNotice('平台登录已过期，请重新登录后再修改密码。');
        return;
      }

      try {
        await platformAuthApi.changePassword({
          currentPassword,
          newPassword,
        });
      } catch (error) {
        setNotice(getPlatformPasswordChangeErrorMessage(error));
        return;
      }

      onUpdatePassword(createUpdatedPasswordSettings(newPassword, now));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice('登录密码已通过平台更新。');
      return;
    }

    onUpdatePassword(createUpdatedPasswordSettings(newPassword, now));
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setNotice('登录密码已更新，当前为本地演示状态。');
  };

  const openSettingDocument = (settingId: string) => {
    const documentState = getSettingDocumentState(settingId, appVersionInfo);

    setShowPrivacyPanel(documentState.showPrivacyPanel);
    setShowPermissionPanel(documentState.showPermissionPanel);
    setShowSecurityCheckPanel(documentState.showSecurityCheckPanel);
    setNotice(documentState.notice);
  };

  const confirmPrivacyPolicy = () => {
    onUpdateSettings(createConfirmedPrivacySettings(settings, now));
    setNotice('隐私政策已确认，本地确认时间：刚刚。');
  };

  const runLocalPermissionCheck = () => {
    setPermissionStatuses(createLocalPermissionDeniedStatuses());
    setNotice('权限本地检查完成：真实系统权限弹窗尚未接入。');
  };

  const runLocalAccountSecurityCheck = () => {
    setShowPrivacyPanel(false);
    setShowPermissionPanel(false);
    setShowSecurityCheckPanel(true);
    setNotice('账号安全本地检查完成：真实异地登录风控尚未接入。');
  };

  const showDeniedGuide = (permissionId: LocalPermissionId) => {
    const deniedGuideNotice = getPermissionDeniedGuideNotice(permissionId);

    if (!deniedGuideNotice) {
      return;
    }

    setNotice(deniedGuideNotice);
  };

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>账号资料</Text>
      <Text style={styles.detailMeta}>{`昵称：${account.displayName}`}</Text>
      <Text style={styles.routeMeta}>
        {`绑定手机号：${account.boundPhone}`}
      </Text>
      <Text style={styles.routeMeta}>
        {`头像凭证 ${account.avatarPhotoCount} 张`}
      </Text>
      <AuthField
        testID="setting-display-name"
        label="修改昵称"
        placeholder="例如 晨星货主"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <AuthField
        testID="setting-bound-phone"
        label="手机号换绑"
        placeholder="例如 13900139999"
        value={boundPhone}
        onChangeText={setBoundPhone}
        keyboardType="phone-pad"
        maxLength={11}
        editable={!platformProfileApi}
      />
      {platformProfileApi ? (
        <Text style={styles.detailMeta}>
          平台模式下手机号换绑仍未接入，当前仅同步昵称。
        </Text>
      ) : null}
      <Pressable
        testID="setting-avatar-upload"
        style={styles.detailSecondaryButton}
        onPress={() => {
          const nextAvatarPhotoCount = 1;
          avatarPhotoCountRef.current = nextAvatarPhotoCount;
          setAvatarPhotoCount(nextAvatarPhotoCount);
          onUpdateAccount({
            ...account,
            avatarPhotoCount: nextAvatarPhotoCount,
          });
          setNotice('头像凭证已添加，本地版不会上传真实文件。');
        }}
      >
        <Text style={styles.detailSecondaryButtonText}>
          {avatarPhotoCount > 0 ? '已添加头像凭证' : '添加头像凭证'}
        </Text>
      </Pressable>
      <Pressable
        testID="setting-account-submit"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={submitAccountSettings}
      >
        <Text style={styles.detailPrimaryButtonText}>保存账号资料</Text>
      </Pressable>

      <Text style={styles.draftSectionTitle}>账号安全</Text>
      <Text style={styles.routeMeta}>
        {`密码更新时间：${password.updatedAt}`}
      </Text>
      <Text style={styles.routeMeta}>
        {`异地登录保护：${loginProtectionStatusText}`}
      </Text>
      <Text style={styles.detailMeta}>
        真实异地登录风控和多设备管理尚未接入。
      </Text>
      <Pressable
        testID="account-security-local-check"
        style={styles.detailSecondaryButton}
        onPress={runLocalAccountSecurityCheck}
      >
        <Text style={styles.detailSecondaryButtonText}>本地检查设备</Text>
      </Pressable>
      <AuthField
        testID="setting-current-password"
        label="当前密码"
        placeholder="请输入当前密码"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
      />
      <AuthField
        testID="setting-new-password"
        label="新密码"
        placeholder="至少 6 位，包含字母和数字"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
      />
      <AuthField
        testID="setting-confirm-password"
        label="确认新密码"
        placeholder="再次输入新密码"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />
      <Pressable
        testID="setting-password-submit"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={submitPasswordSettings}
      >
        <Text style={styles.detailPrimaryButtonText}>保存登录密码</Text>
      </Pressable>

      {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}
      {showSecurityCheckPanel ? (
        <View style={styles.driverInfoCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeName}>账号安全检查</Text>
            <Text style={styles.routeAction}>本地结果</Text>
          </View>
          <Text style={styles.detailMeta}>当前设备：本机演示设备</Text>
          <Text style={styles.detailMeta}>
            {`登录保护：${loginProtectionStatusText}`}
          </Text>
          <Text style={styles.detailMeta}>设备管理：本地占位</Text>
          <Text style={styles.detailMeta}>
            真实多端设备列表、异常登录拦截和强制下线仍未接入。
          </Text>
        </View>
      ) : null}
      {showPrivacyPanel ? (
        <View style={styles.driverInfoCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeName}>隐私政策确认</Text>
            <Text style={styles.routeAction}>
              {isPrivacyConfirmed ? '已确认' : '未确认'}
            </Text>
          </View>
          <Text style={styles.detailMeta}>
            {`确认状态：${isPrivacyConfirmed ? '已确认' : '未确认'}`}
          </Text>
          <Text style={styles.detailMeta}>
            真实隐私协议版本留痕和后端同步仍未接入。
          </Text>
          {isPrivacyConfirmed ? (
            <Text style={styles.routeMeta}>
              {`本地确认时间：${privacySetting?.confirmedAtText ?? '刚刚'}`}
            </Text>
          ) : null}
          <Pressable
            testID="privacy-policy-confirm"
            style={({ pressed }) => [
              styles.detailPrimaryButton,
              pressed && styles.pressedButton,
            ]}
            onPress={confirmPrivacyPolicy}
          >
            <Text style={styles.detailPrimaryButtonText}>确认隐私政策</Text>
          </Pressable>
        </View>
      ) : null}
      {showPermissionPanel ? (
        <View style={styles.driverInfoCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeName}>权限状态</Text>
            <Text style={styles.routeAction}>本地检查</Text>
          </View>
          <Text style={styles.detailMeta}>
            真实系统权限弹窗尚未接入，以下状态只用于本地演练。
          </Text>
          {localPermissionItems.map(permission => (
            <View key={permission.id} style={styles.driverInfoCard}>
              <View style={styles.routeHeader}>
                <Text style={styles.routeName}>
                  {`${permission.title}：${permissionStatuses[permission.id]}`}
                </Text>
                <Pressable
                  testID={`permission-denied-guide-${permission.id}`}
                  style={styles.detailSecondaryButton}
                  onPress={() => showDeniedGuide(permission.id)}
                >
                  <Text style={styles.detailSecondaryButtonText}>拒绝引导</Text>
                </Pressable>
              </View>
            </View>
          ))}
          <Pressable
            testID="permission-local-check"
            style={({ pressed }) => [
              styles.detailPrimaryButton,
              pressed && styles.pressedButton,
            ]}
            onPress={runLocalPermissionCheck}
          >
            <Text style={styles.detailPrimaryButtonText}>本地检查权限</Text>
          </Pressable>
        </View>
      ) : null}
      {settings.map(item => {
        const canToggle = !isReadOnlySetting(item.id);
        const settingCard = (
          <>
            <View style={styles.routeHeader}>
              <Text style={styles.routeName}>{item.title}</Text>
              <Text style={styles.routeAction}>{item.statusText}</Text>
            </View>
            <Text style={styles.detailMeta}>{item.description}</Text>
          </>
        );

        return canToggle ? (
          <Pressable
            key={item.id}
            testID={`setting-toggle-${item.id}`}
            style={({ pressed }) => [
              styles.driverInfoCard,
              pressed && styles.pressedCard,
            ]}
            onPress={() => toggleSetting(item.id)}
          >
            {settingCard}
          </Pressable>
        ) : (
          <Pressable
            key={item.id}
            testID={`setting-open-${item.id.replace('setting-', '')}`}
            style={({ pressed }) => [
              styles.driverInfoCard,
              pressed && styles.pressedCard,
            ]}
            onPress={() => openSettingDocument(item.id)}
          >
            {settingCard}
          </Pressable>
        );
      })}
      <Pressable
        testID="setting-logout"
        style={({ pressed }) => [
          styles.detailSecondaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={onLogout}
      >
        <Text style={styles.detailSecondaryButtonText}>退出登录</Text>
      </Pressable>
    </View>
  );
}
