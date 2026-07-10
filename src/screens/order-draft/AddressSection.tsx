import { Pressable, Text, View } from 'react-native';

import { AuthField } from '../../components/AuthField';
import { styles } from '../../styles';
import { MAX_LOCAL_ADDRESS_NOTE_LENGTH } from '../../utils/order';
import {
  getProfileLocalState,
  type AddressItem,
  type ContactItem,
} from '../../utils/profileLocalState';

export function AddressSection({
  pickupAddress,
  onPickupAddressChange,
  pickupNoteText,
  onPickupNoteTextChange,
  pickupContact,
  onPickupContactChange,
  pickupPhone,
  onPickupPhoneChange,
  deliveryAddress,
  onDeliveryAddressChange,
  deliveryNoteText,
  onDeliveryNoteTextChange,
  deliveryContact,
  onDeliveryContactChange,
  deliveryPhone,
  onDeliveryPhoneChange,
}: {
  pickupAddress: string;
  onPickupAddressChange: (value: string) => void;
  pickupNoteText: string;
  onPickupNoteTextChange: (value: string) => void;
  pickupContact: string;
  onPickupContactChange: (value: string) => void;
  pickupPhone: string;
  onPickupPhoneChange: (value: string) => void;
  deliveryAddress: string;
  onDeliveryAddressChange: (value: string) => void;
  deliveryNoteText: string;
  onDeliveryNoteTextChange: (value: string) => void;
  deliveryContact: string;
  onDeliveryContactChange: (value: string) => void;
  deliveryPhone: string;
  onDeliveryPhoneChange: (value: string) => void;
}) {
  const { addresses: addressSuggestions, contacts: contactSuggestions } =
    getProfileLocalState();
  const applyPickupAddressSuggestion = (addressItem: AddressItem) => {
    const contactInfo = parseLocalAddressContact(addressItem.contactText);

    onPickupAddressChange(addressItem.address);
    onPickupContactChange(contactInfo.name);
    onPickupPhoneChange(contactInfo.phone);
  };
  const applyDeliveryAddressSuggestion = (addressItem: AddressItem) => {
    const contactInfo = parseLocalAddressContact(addressItem.contactText);

    onDeliveryAddressChange(addressItem.address);
    onDeliveryContactChange(contactInfo.name);
    onDeliveryPhoneChange(contactInfo.phone);
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
        <Text style={styles.draftFieldLabel}>本地常用地址建议</Text>
        <View style={styles.draftChoiceGrid}>
          {addressSuggestions.map(addressItem => (
            <Pressable
              key={`pickup-${addressItem.id}`}
              testID={`draft-pickup-address-suggestion-${addressItem.id}`}
              style={styles.draftChoiceButton}
              onPress={() => applyPickupAddressSuggestion(addressItem)}
            >
              <Text style={styles.draftChoiceText}>
                {`装货：${addressItem.name}`}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.draftChoiceGrid}>
          {addressSuggestions.map(addressItem => (
            <Pressable
              key={`delivery-${addressItem.id}`}
              testID={`draft-delivery-address-suggestion-${addressItem.id}`}
              style={styles.draftChoiceButton}
              onPress={() => applyDeliveryAddressSuggestion(addressItem)}
            >
              <Text style={styles.draftChoiceText}>
                {`卸货：${addressItem.name}`}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.detailMeta}>
          仅复用本地常用地址，真实地图选点和地址搜索仍未接入。
        </Text>
      </View>
      <View style={styles.draftInlineSection}>
        <Text style={styles.draftFieldLabel}>本地常用联系人建议</Text>
        <View style={styles.draftChoiceGrid}>
          {contactSuggestions.map(contactItem => (
            <Pressable
              key={`pickup-${contactItem.id}`}
              testID={`draft-pickup-contact-suggestion-${contactItem.id}`}
              style={styles.draftChoiceButton}
              onPress={() => applyPickupContactSuggestion(contactItem)}
            >
              <Text style={styles.draftChoiceText}>
                {`装货：${contactItem.name}`}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.draftChoiceGrid}>
          {contactSuggestions.map(contactItem => (
            <Pressable
              key={`delivery-${contactItem.id}`}
              testID={`draft-delivery-contact-suggestion-${contactItem.id}`}
              style={styles.draftChoiceButton}
              onPress={() => applyDeliveryContactSuggestion(contactItem)}
            >
              <Text style={styles.draftChoiceText}>
                {`卸货：${contactItem.name}`}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.detailMeta}>
          仅复用个人中心本地常用联系人，真实通讯录和账号中心同步仍未接入。
        </Text>
      </View>
      <AuthField
        testID="draft-pickup-address"
        label="装货地址"
        placeholder="例如 宝安区福永物流园"
        value={pickupAddress}
        onChangeText={onPickupAddressChange}
      />
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
