import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthField } from '../../components/AuthField';
import { MapPicker } from '../../components/MapPicker';
import { colors, styles } from '../../styles';
import type { DraftAddressPreview } from '../../utils/orderDraftAddress';
import { MAX_LOCAL_ADDRESS_NOTE_LENGTH } from '../../utils/order';
import {
  getProfileLocalState,
  type AddressItem,
  type ContactItem,
} from '../../utils/profileLocalState';
import type { PlatformGeocodeResult } from '../../services/platformMapsApi';

export function AddressSection({
  pickupAddress,
  onPickupAddressChange,
  pickupNoteText,
  onPickupNoteTextChange,
  pickupContact,
  onPickupContactChange,
  pickupPhone,
  onPickupPhoneChange,
  pickupAddressPreview,
  isResolvingPickupAddress,
  onPreviewPickupAddress,
  deliveryAddress,
  onDeliveryAddressChange,
  deliveryNoteText,
  onDeliveryNoteTextChange,
  deliveryContact,
  onDeliveryContactChange,
  deliveryPhone,
  onDeliveryPhoneChange,
  deliveryAddressPreview,
  isResolvingDeliveryAddress,
  onPreviewDeliveryAddress,
  platformMapsApi,
}: {
  pickupAddress: string;
  onPickupAddressChange: (value: string) => void;
  pickupNoteText: string;
  onPickupNoteTextChange: (value: string) => void;
  pickupContact: string;
  onPickupContactChange: (value: string) => void;
  pickupPhone: string;
  onPickupPhoneChange: (value: string) => void;
  pickupAddressPreview?: DraftAddressPreview;
  isResolvingPickupAddress?: boolean;
  onPreviewPickupAddress?: (addressText: string) => void;
  deliveryAddress: string;
  onDeliveryAddressChange: (value: string) => void;
  deliveryNoteText: string;
  onDeliveryNoteTextChange: (value: string) => void;
  deliveryContact: string;
  onDeliveryContactChange: (value: string) => void;
  deliveryPhone: string;
  onDeliveryPhoneChange: (value: string) => void;
  deliveryAddressPreview?: DraftAddressPreview;
  isResolvingDeliveryAddress?: boolean;
  onPreviewDeliveryAddress?: (addressText: string) => void;
  platformMapsApi?: { geocode: (address: string) => Promise<PlatformGeocodeResult> } | undefined;
}) {
  const {
    addresses: addressSuggestions,
    contacts: contactSuggestions,
    syncState,
  } = getProfileLocalState();
  const hasPlatformAddressBookSnapshot = Boolean(
    syncState?.platformUpdatedAtIso,
  );
  const platformAddressIds = syncState?.platformAddressIds ?? [];
  const platformContactIds = syncState?.platformContactIds ?? [];
  const applyPickupAddressSuggestion = (addressItem: AddressItem) => {
    const contactInfo = parseLocalAddressContact(addressItem.contactText);

    onPickupAddressChange(addressItem.address);
    onPickupContactChange(contactInfo.name);
    onPickupPhoneChange(contactInfo.phone);
    onPreviewPickupAddress?.(addressItem.address);
  };
  const applyDeliveryAddressSuggestion = (addressItem: AddressItem) => {
    const contactInfo = parseLocalAddressContact(addressItem.contactText);

    onDeliveryAddressChange(addressItem.address);
    onDeliveryContactChange(contactInfo.name);
    onDeliveryPhoneChange(contactInfo.phone);
    onPreviewDeliveryAddress?.(addressItem.address);
  };
  const applyPickupContactSuggestion = (contactItem: ContactItem) => {
    onPickupContactChange(contactItem.name);
    onPickupPhoneChange(contactItem.phoneText);
  };
  const applyDeliveryContactSuggestion = (contactItem: ContactItem) => {
    onDeliveryContactChange(contactItem.name);
    onDeliveryPhoneChange(contactItem.phoneText);
  };

  return (
    <View style={styles.draftCard}>
      <Text style={styles.draftSectionTitle}>装卸地址</Text>
      <View style={styles.draftInlineSection}>
        <Text style={styles.draftFieldLabel}>常用地址建议</Text>
        <Text style={styles.detailMeta}>
          {hasPlatformAddressBookSnapshot
            ? '当前建议来自个人中心地址簿，平台地址簿快照已同步到当前列表。'
            : '当前建议来自个人中心本地地址簿，登录平台后可同步地址簿快照。'}
        </Text>
        <View style={styles.draftChoiceGrid}>
          {addressSuggestions.map(addressItem => (
            <SuggestionButton
              key={`pickup-${addressItem.id}`}
              testID={`draft-pickup-address-suggestion-${addressItem.id}`}
              title={`装货：${addressItem.name}`}
              detailLines={[
                addressItem.address,
                addressItem.contactText
                  ? `联系人：${addressItem.contactText}`
                  : undefined,
                addressItem.tagText ? `标签：${addressItem.tagText}` : undefined,
                `来源：${
                  platformAddressIds.includes(addressItem.id)
                    ? '平台地址簿快照'
                    : '本地地址簿'
                }`,
              ]}
              onPress={() => applyPickupAddressSuggestion(addressItem)}
            />
          ))}
        </View>
        <View style={styles.draftChoiceGrid}>
          {addressSuggestions.map(addressItem => (
            <SuggestionButton
              key={`delivery-${addressItem.id}`}
              testID={`draft-delivery-address-suggestion-${addressItem.id}`}
              title={`卸货：${addressItem.name}`}
              detailLines={[
                addressItem.address,
                addressItem.contactText
                  ? `联系人：${addressItem.contactText}`
                  : undefined,
                addressItem.tagText ? `标签：${addressItem.tagText}` : undefined,
                `来源：${
                  platformAddressIds.includes(addressItem.id)
                    ? '平台地址簿快照'
                    : '本地地址簿'
                }`,
              ]}
              onPress={() => applyDeliveryAddressSuggestion(addressItem)}
            />
          ))}
        </View>
        <Text style={styles.detailMeta}>
          当前地址建议会同步展示联系人和标签；常用地址可直接回填并生成标准地址预览，地图选点仍未接入。
        </Text>
      </View>
      <View style={styles.draftInlineSection}>
        <Text style={styles.draftFieldLabel}>常用联系人建议</Text>
        <Text style={styles.detailMeta}>
          {hasPlatformAddressBookSnapshot
            ? '当前建议来自个人中心地址簿联系人，平台地址簿快照已同步到当前列表。'
            : '当前建议来自个人中心本地联系人，登录平台后可同步地址簿快照。'}
        </Text>
        <View style={styles.draftChoiceGrid}>
          {contactSuggestions.map(contactItem => (
            <SuggestionButton
              key={`pickup-${contactItem.id}`}
              testID={`draft-pickup-contact-suggestion-${contactItem.id}`}
              title={`装货：${contactItem.name}`}
              detailLines={[
                contactItem.roleText
                  ? `角色：${contactItem.roleText}`
                  : undefined,
                `电话：${contactItem.phoneText}`,
                contactItem.noteText ? `备注：${contactItem.noteText}` : undefined,
                `来源：${
                  platformContactIds.includes(contactItem.id)
                    ? '平台地址簿快照'
                    : '本地联系人'
                }`,
              ]}
              onPress={() => applyPickupContactSuggestion(contactItem)}
            />
          ))}
        </View>
        <View style={styles.draftChoiceGrid}>
          {contactSuggestions.map(contactItem => (
            <SuggestionButton
              key={`delivery-${contactItem.id}`}
              testID={`draft-delivery-contact-suggestion-${contactItem.id}`}
              title={`卸货：${contactItem.name}`}
              detailLines={[
                contactItem.roleText
                  ? `角色：${contactItem.roleText}`
                  : undefined,
                `电话：${contactItem.phoneText}`,
                contactItem.noteText ? `备注：${contactItem.noteText}` : undefined,
                `来源：${
                  platformContactIds.includes(contactItem.id)
                    ? '平台地址簿快照'
                    : '本地联系人'
                }`,
              ]}
              onPress={() => applyDeliveryContactSuggestion(contactItem)}
            />
          ))}
        </View>
        <Text style={styles.detailMeta}>
          {hasPlatformAddressBookSnapshot
            ? '当前联系人建议已包含平台地址簿快照中的角色、电话和备注，可直接回填装卸联系人。'
            : '当前可直接使用本地联系人建议回填装卸联系人，角色和备注会同步展示。'}
        </Text>
      </View>
      <AuthField
        testID="draft-pickup-address"
        label="装货地址"
        placeholder="例如 宝安区福永物流园"
        value={pickupAddress}
        onChangeText={onPickupAddressChange}
      />
      <MapPicker
        testID="draft-pickup-map"
        platformMapsApi={platformMapsApi}
        initialAddress={pickupAddress}
        placeholder="搜索装货地址"
        onSelect={result => {
          onPickupAddressChange(result.formattedAddress);
          onPreviewPickupAddress?.(result.formattedAddress);
        }}
      />
      <Pressable
        testID="draft-pickup-address-preview"
        style={styles.detailSecondaryButton}
        onPress={() => onPreviewPickupAddress?.(pickupAddress)}
      >
        <Text style={styles.detailSecondaryButtonText}>
          {isResolvingPickupAddress ? '解析中...' : '生成装货地址预览'}
        </Text>
      </Pressable>
      {pickupAddressPreview ? (
        <AddressPreviewCard
          title="装货地址预览"
          preview={pickupAddressPreview}
        />
      ) : null}
      <AuthField
        testID="draft-pickup-note"
        label="装货备注"
        placeholder="例如 仓库在 3 号门"
        value={pickupNoteText}
        onChangeText={onPickupNoteTextChange}
        maxLength={MAX_LOCAL_ADDRESS_NOTE_LENGTH}
      />
      <AuthField
        testID="draft-pickup-contact"
        label="装货联系人"
        placeholder="例如 赵经理"
        value={pickupContact}
        onChangeText={onPickupContactChange}
      />
      <AuthField
        testID="draft-pickup-phone"
        label="装货联系电话"
        placeholder="请输入 11 位手机号"
        value={pickupPhone}
        onChangeText={onPickupPhoneChange}
        keyboardType="phone-pad"
        maxLength={11}
      />
      <AuthField
        testID="draft-delivery-address"
        label="卸货地址"
        placeholder="例如 南山区科技园门店"
        value={deliveryAddress}
        onChangeText={onDeliveryAddressChange}
      />
      <MapPicker
        testID="draft-delivery-map"
        platformMapsApi={platformMapsApi}
        initialAddress={deliveryAddress}
        placeholder="搜索卸货地址"
        onSelect={result => {
          onDeliveryAddressChange(result.formattedAddress);
          onPreviewDeliveryAddress?.(result.formattedAddress);
        }}
      />
      <Pressable
        testID="draft-delivery-address-preview"
        style={styles.detailSecondaryButton}
        onPress={() => onPreviewDeliveryAddress?.(deliveryAddress)}
      >
        <Text style={styles.detailSecondaryButtonText}>
          {isResolvingDeliveryAddress ? '解析中...' : '生成卸货地址预览'}
        </Text>
      </Pressable>
      {deliveryAddressPreview ? (
        <AddressPreviewCard
          title="卸货地址预览"
          preview={deliveryAddressPreview}
        />
      ) : null}
      <AuthField
        testID="draft-delivery-note"
        label="卸货备注"
        placeholder="例如 停靠西侧货梯"
        value={deliveryNoteText}
        onChangeText={onDeliveryNoteTextChange}
        maxLength={MAX_LOCAL_ADDRESS_NOTE_LENGTH}
      />
      <AuthField
        testID="draft-delivery-contact"
        label="卸货联系人"
        placeholder="例如 钱店长"
        value={deliveryContact}
        onChangeText={onDeliveryContactChange}
      />
      <AuthField
        testID="draft-delivery-phone"
        label="卸货联系电话"
        placeholder="请输入 11 位手机号"
        value={deliveryPhone}
        onChangeText={onDeliveryPhoneChange}
        keyboardType="phone-pad"
        maxLength={11}
      />
    </View>
  );
}

function parseLocalAddressContact(contactText: string) {
  const phoneMatch = contactText.match(/1\d{10}/);
  const phone = phoneMatch?.[0] ?? '';
  const name = contactText.replace(phone, '').trim();

  return {
    name,
    phone,
  };
}

function SuggestionButton({
  testID,
  title,
  detailLines,
  onPress,
}: {
  testID: string;
  title: string;
  detailLines: Array<string | undefined>;
  onPress: () => void;
}) {
  const renderedDetailLines = detailLines.filter(
    (line): line is string => Boolean(line),
  );

  return (
    <Pressable
      testID={testID}
      style={[styles.draftChoiceButton, suggestionStyles.button]}
      onPress={onPress}
    >
      <Text style={styles.draftChoiceText}>{title}</Text>
      {renderedDetailLines.map((line, index) => (
        <Text
          key={`${testID}-${index}`}
          style={[
            suggestionStyles.detailText,
            line.startsWith('来源：') ? suggestionStyles.sourceText : null,
          ]}
        >
          {line}
        </Text>
      ))}
    </Pressable>
  );
}

function AddressPreviewCard({
  title,
  preview,
}: {
  title: string;
  preview: DraftAddressPreview;
}) {
  return (
    <View style={styles.driverInfoCard}>
      <Text style={styles.routeName}>{title}</Text>
      <Text style={styles.detailMeta}>
        {`标准地址：${preview.formattedAddress}`}
      </Text>
      <Text style={styles.detailMeta}>{`来源：${preview.sourceText}`}</Text>
      {preview.coordinateText ? (
        <Text style={styles.detailMeta}>{`坐标：${preview.coordinateText}`}</Text>
      ) : null}
      <Text style={styles.routeMeta}>{preview.statusText}</Text>
    </View>
  );
}

const suggestionStyles = StyleSheet.create({
  button: {
    flexBasis: '48%',
    flexGrow: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingVertical: 10,
    gap: 4,
  },
  detailText: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  sourceText: {
    color: colors.teal,
    fontWeight: '700',
  },
});
