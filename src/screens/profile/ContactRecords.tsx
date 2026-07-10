import { Pressable, Text, View } from 'react-native';
import { useState } from 'react';

import { AuthField } from '../../components/AuthField';
import { styles } from '../../styles';
import {
  createContactInput,
  type ContactInput,
} from '../../utils/profileAddressBook';
import type { ContactItem } from '../../utils/profileLocalState';

export function ContactRecords({
  contacts,
  onAddContact,
  onDeleteContact,
  onUpdateContact,
}: {
  contacts: ContactItem[];
  onAddContact: (contact: ContactInput) => void;
  onDeleteContact: (contactId: string) => void;
  onUpdateContact: (contactId: string, changes: ContactInput) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [editingContactId, setEditingContactId] = useState<string>();
  const [notice, setNotice] = useState('');

  const submit = () => {
    const result = createContactInput({
      name,
      role,
      phone,
      note,
      contactCount: contacts.length,
      isEditing: Boolean(editingContactId),
    });

    if (!result.contact) {
      setNotice(result.noticeText);
      return;
    }

    if (editingContactId) {
      onUpdateContact(editingContactId, result.contact);
      setNotice('常用联系人已更新');
    } else {
      onAddContact(result.contact);
      setNotice('常用联系人已添加');
    }

    setName('');
    setRole('');
    setPhone('');
    setNote('');
    setEditingContactId(undefined);
  };

  const editContact = (item: ContactItem) => {
    setName(item.name);
    setRole(item.roleText);
    setPhone(item.phoneText);
    setNote(item.noteText);
    setEditingContactId(item.id);
    setNotice(`正在编辑：${item.name}`);
  };

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>新增常用联系人</Text>
      <AuthField
        testID="profile-contact-name"
        label="姓名"
        placeholder="例如 吴主管"
        value={name}
        onChangeText={setName}
      />
      <AuthField
        testID="profile-contact-role"
        label="角色"
        placeholder="例如 备用装货负责人"
        value={role}
        onChangeText={setRole}
      />
      <AuthField
        testID="profile-contact-phone"
        label="电话"
        placeholder="例如 13900139001"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <AuthField
        testID="profile-contact-note"
        label="备注"
        placeholder="例如 龙华临时仓"
        value={note}
        onChangeText={setNote}
      />
      {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}
      <Pressable
        testID="profile-contact-submit"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={submit}
      >
        <Text style={styles.detailPrimaryButtonText}>
          {editingContactId ? '保存联系人' : '添加联系人'}
        </Text>
      </Pressable>

      <Text style={styles.draftSectionTitle}>联系人列表</Text>
      {contacts.map(item => (
        <View key={item.id} style={styles.driverInfoCard}>
          <View style={styles.driverInfoHeader}>
            <View>
              <Text style={styles.driverName}>{item.name}</Text>
              <Text style={styles.driverMeta}>{item.roleText}</Text>
            </View>
            <View style={styles.driverRatingPill}>
              <Text style={styles.driverRatingText}>{item.phoneText}</Text>
            </View>
          </View>
          <Text style={styles.detailMeta}>{item.noteText}</Text>
          <Pressable
            testID={`profile-contact-edit-${item.id}`}
            style={styles.detailSecondaryButton}
            onPress={() => editContact(item)}
          >
            <Text style={styles.detailSecondaryButtonText}>编辑联系人</Text>
          </Pressable>
          <Pressable
            testID={`profile-contact-delete-${item.id}`}
            style={styles.detailSecondaryButton}
            onPress={() => onDeleteContact(item.id)}
          >
            <Text style={styles.detailSecondaryButtonText}>删除联系人</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
