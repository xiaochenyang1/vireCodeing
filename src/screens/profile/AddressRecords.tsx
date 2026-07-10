import { Pressable, Text, View } from 'react-native';
import { useState } from 'react';

import { AuthField } from '../../components/AuthField';
import { styles } from '../../styles';
import {
  createAddressDeleteConfirmation,
  createAddressInput,
  type AddressInput,
} from '../../utils/profileAddressBook';
import type { AddressItem } from '../../utils/profileLocalState';

export function AddressRecords({
  addresses,
  onAddAddress,
  onDeleteAddress,
  onUpdateAddress,
}: {
  addresses: AddressItem[];
  onAddAddress: (address: AddressInput) => void;
  onDeleteAddress: (addressId: string) => void;
  onUpdateAddress: (addressId: string, changes: AddressInput) => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [tag, setTag] = useState('');
  const [editingAddressId, setEditingAddressId] = useState<string>();
  const [pendingDeleteAddressId, setPendingDeleteAddressId] =
    useState<string>();
  const [notice, setNotice] = useState('');

  const submit = () => {
    setPendingDeleteAddressId(undefined);
    const result = createAddressInput({
      name,
      address,
      contact,
      tag,
      addressCount: addresses.length,
      isEditing: Boolean(editingAddressId),
    });

    if (!result.address) {
      setNotice(result.noticeText);
      return;
    }

    if (editingAddressId) {
      onUpdateAddress(editingAddressId, result.address);
      setNotice('常用地址已更新');
    } else {
      onAddAddress(result.address);
      setNotice('常用地址已添加');
    }

    setName('');
    setAddress('');
    setContact('');
    setTag('');
    setEditingAddressId(undefined);
  };

  const editAddress = (item: AddressItem) => {
    setName(item.name);
    setAddress(item.address);
    setContact(item.contactText);
    setTag(item.tagText);
    setEditingAddressId(item.id);
    setPendingDeleteAddressId(undefined);
    setNotice(`正在编辑：${item.name}`);
  };

  const requestDeleteAddress = (item: AddressItem) => {
    const confirmation = createAddressDeleteConfirmation({
      addressId: item.id,
      addressName: item.name,
      pendingDeleteAddressId,
    });

    if (confirmation.confirmed) {
      onDeleteAddress(item.id);
      setPendingDeleteAddressId(confirmation.pendingDeleteAddressId);
      setNotice(confirmation.noticeText);
      return;
    }

    setPendingDeleteAddressId(confirmation.pendingDeleteAddressId);
    setNotice(confirmation.noticeText);
  };

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>新增常用地址</Text>
      <AuthField
        testID="profile-address-name"
        label="地址名称"
        placeholder="例如 龙华临时仓"
        value={name}
        onChangeText={setName}
      />
      <AuthField
        testID="profile-address-detail"
        label="详细地址"
        placeholder="例如 龙华区临时中转仓"
        value={address}
        onChangeText={setAddress}
      />
      <AuthField
        testID="profile-address-contact"
        label="联系人"
        placeholder="例如 吴主管 13900139001"
        value={contact}
        onChangeText={setContact}
      />
      <AuthField
        testID="profile-address-tag"
        label="地址标签"
        placeholder="例如 备用装货地"
        value={tag}
        onChangeText={setTag}
      />
      {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}
      <Pressable
        testID="profile-address-submit"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={submit}
      >
        <Text style={styles.detailPrimaryButtonText}>
          {editingAddressId ? '保存地址' : '添加地址'}
        </Text>
      </Pressable>

      <Text style={styles.draftSectionTitle}>地址列表</Text>
      {addresses.map(item => (
        <View key={item.id} style={styles.driverInfoCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeName}>{item.name}</Text>
            <Text style={styles.routeAction}>{item.tagText}</Text>
          </View>
          <Text style={styles.detailMeta}>{item.address}</Text>
          <Text style={styles.routeMeta}>{item.contactText}</Text>
          <Pressable
            testID={`profile-address-edit-${item.id}`}
            style={styles.detailSecondaryButton}
            onPress={() => editAddress(item)}
          >
            <Text style={styles.detailSecondaryButtonText}>编辑地址</Text>
          </Pressable>
          <Pressable
            testID={`profile-address-delete-${item.id}`}
            style={styles.detailSecondaryButton}
            onPress={() => requestDeleteAddress(item)}
          >
            <Text style={styles.detailSecondaryButtonText}>
              {pendingDeleteAddressId === item.id ? '确认删除' : '删除地址'}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
