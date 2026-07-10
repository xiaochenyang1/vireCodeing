import { isValidPhone } from './order';
import type { AddressItem, ContactItem } from './profileLocalState';

export type AddressInput = Omit<AddressItem, 'id'>;
export type ContactInput = Omit<ContactItem, 'id'>;

export type AddressFormInput = {
  name: string;
  address: string;
  contact: string;
  tag: string;
  addressCount: number;
  isEditing: boolean;
};

export type ContactFormInput = {
  name: string;
  role: string;
  phone: string;
  note: string;
  contactCount: number;
  isEditing: boolean;
};

export type AddressInputResult = {
  address?: AddressInput;
  noticeText: string;
};

export type ContactInputResult = {
  contact?: ContactInput;
  noticeText: string;
};

export type AddressDeleteConfirmationInput = {
  addressId: string;
  addressName: string;
  pendingDeleteAddressId?: string;
};

export type AddressDeleteConfirmationResult = {
  confirmed: boolean;
  pendingDeleteAddressId?: string;
  noticeText: string;
};

export function hasValidPhoneInText(text: string) {
  return Array.from(text.matchAll(/(?:^|\D)(1\d{10})(?=\D|$)/g)).some(
    match => isValidPhone(match[1]),
  );
}

export function createAddressInput({
  name,
  address,
  contact,
  tag,
  addressCount,
  isEditing,
}: AddressFormInput): AddressInputResult {
  const trimmedName = name.trim();
  const trimmedAddress = address.trim();
  const trimmedContact = contact.trim();
  const trimmedTag = tag.trim();

  if (!trimmedName || !trimmedAddress || !trimmedContact || !trimmedTag) {
    return { noticeText: '请补齐地址名称、详细地址、联系人和标签' };
  }

  if (!hasValidPhoneInText(trimmedContact)) {
    return { noticeText: '请填写正确的常用地址联系人电话' };
  }

  if (!isEditing && addressCount >= 20) {
    return { noticeText: '最多保存 20 个常用地址' };
  }

  return {
    address: {
      name: trimmedName,
      address: trimmedAddress,
      contactText: trimmedContact,
      tagText: trimmedTag,
    },
    noticeText: '',
  };
}

export function createLocalProfileAddress(
  addresses: AddressItem[],
  address: AddressInput,
): AddressItem {
  return {
    ...address,
    id: createNextLocalProfileItemId(addresses, 'address-local'),
  };
}

export function updateProfileAddress(
  addresses: AddressItem[],
  addressId: string,
  changes: AddressInput,
) {
  return addresses.map(address =>
    address.id === addressId ? { ...address, ...changes } : address,
  );
}

export function deleteProfileAddress(
  addresses: AddressItem[],
  addressId: string,
) {
  return addresses.filter(address => address.id !== addressId);
}

export function createAddressDeleteConfirmation({
  addressId,
  addressName,
  pendingDeleteAddressId,
}: AddressDeleteConfirmationInput): AddressDeleteConfirmationResult {
  if (pendingDeleteAddressId === addressId) {
    return {
      confirmed: true,
      pendingDeleteAddressId: undefined,
      noticeText: '常用地址已删除',
    };
  }

  return {
    confirmed: false,
    pendingDeleteAddressId: addressId,
    noticeText: `再次确认删除地址：${addressName}`,
  };
}

export function createLocalProfileContact(
  contacts: ContactItem[],
  contact: ContactInput,
): ContactItem {
  return {
    ...contact,
    id: createNextLocalProfileItemId(contacts, 'contact-local'),
  };
}

export function updateProfileContact(
  contacts: ContactItem[],
  contactId: string,
  changes: ContactInput,
) {
  return contacts.map(contact =>
    contact.id === contactId ? { ...contact, ...changes } : contact,
  );
}

export function deleteProfileContact(
  contacts: ContactItem[],
  contactId: string,
) {
  return contacts.filter(contact => contact.id !== contactId);
}

export function createContactInput({
  name,
  role,
  phone,
  note,
  contactCount,
  isEditing,
}: ContactFormInput): ContactInputResult {
  const trimmedName = name.trim();
  const trimmedRole = role.trim();
  const trimmedPhone = phone.trim();
  const trimmedNote = note.trim();

  if (!trimmedName || !trimmedRole || !trimmedPhone || !trimmedNote) {
    return { noticeText: '请补齐姓名、角色、电话和备注' };
  }

  if (!isValidPhone(trimmedPhone)) {
    return { noticeText: '请输入正确的常用联系人电话' };
  }

  if (!isEditing && contactCount >= 50) {
    return { noticeText: '最多保存 50 个常用联系人' };
  }

  return {
    contact: {
      name: trimmedName,
      roleText: trimmedRole,
      phoneText: trimmedPhone,
      noteText: trimmedNote,
    },
    noticeText: '',
  };
}

function createNextLocalProfileItemId(
  items: Array<{ id: string }>,
  localIdPrefix: 'address-local' | 'contact-local',
) {
  const localIndexes = items
    .map(item => item.id.match(new RegExp(`^${localIdPrefix}-(\\d+)$`))?.[1])
    .filter((value): value is string => Boolean(value))
    .map(value => Number(value));
  const nextIndexFromLocalIds =
    localIndexes.length > 0 ? Math.max(...localIndexes) + 1 : 1;
  const nextIndex = Math.max(items.length + 1, nextIndexFromLocalIds);

  return `${localIdPrefix}-${nextIndex}`;
}
