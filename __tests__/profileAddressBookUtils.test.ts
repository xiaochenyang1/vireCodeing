import {
  createLocalProfileAddress,
  createLocalProfileContact,
  createAddressDeleteConfirmation,
  createAddressInput,
  createContactInput,
  deleteProfileAddress,
  deleteProfileContact,
  hasValidPhoneInText,
  updateProfileAddress,
  updateProfileContact,
} from '../src/utils/profileAddressBook';
import type { AddressItem, ContactItem } from '../src/utils/profileLocalState';

const profileAddresses: AddressItem[] = [
  {
    id: 'address-1',
    name: '宝安仓',
    address: '宝安区航城仓库',
    contactText: '王主管 13900139001',
    tagText: '装货地',
  },
  {
    id: 'address-local-4',
    name: '龙华临时仓',
    address: '龙华区临时中转仓',
    contactText: '吴主管 13900139002',
    tagText: '备用装货地',
  },
  {
    id: 'address-local-2',
    name: '南山门店',
    address: '南山区科技园门店',
    contactText: '李店长 13900139003',
    tagText: '卸货地',
  },
];

const profileContacts: ContactItem[] = [
  {
    id: 'contact-1',
    name: '王主管',
    roleText: '装货负责人',
    phoneText: '13900139001',
    noteText: '宝安仓',
  },
  {
    id: 'contact-local-6',
    name: '吴主管',
    roleText: '备用装货负责人',
    phoneText: '13900139002',
    noteText: '龙华临时仓',
  },
  {
    id: 'contact-local-3',
    name: '李店长',
    roleText: '收货负责人',
    phoneText: '13900139003',
    noteText: '南山门店',
  },
];

test('detects a valid mobile phone embedded in address contact text', () => {
  expect(hasValidPhoneInText('吴主管 13900139001')).toBe(true);
  expect(hasValidPhoneInText('电话 1390013900')).toBe(false);
  expect(hasValidPhoneInText('编号A13900139001B')).toBe(true);
  expect(hasValidPhoneInText('9139001390012')).toBe(false);
});

test('validates and normalizes local profile address input', () => {
  expect(
    createAddressInput({
      name: '',
      address: '龙华区临时中转仓',
      contact: '吴主管 13900139001',
      tag: '备用装货地',
      addressCount: 0,
      isEditing: false,
    }),
  ).toEqual({ noticeText: '请补齐地址名称、详细地址、联系人和标签' });
  expect(
    createAddressInput({
      name: ' 龙华临时仓 ',
      address: ' 龙华区临时中转仓 ',
      contact: ' 吴主管 13900139001 ',
      tag: ' 备用装货地 ',
      addressCount: 0,
      isEditing: false,
    }),
  ).toEqual({
    address: {
      name: '龙华临时仓',
      address: '龙华区临时中转仓',
      contactText: '吴主管 13900139001',
      tagText: '备用装货地',
    },
    noticeText: '',
  });
});

test('blocks invalid address phone and add-only address limit', () => {
  expect(
    createAddressInput({
      name: '龙华临时仓',
      address: '龙华区临时中转仓',
      contact: '吴主管 12345',
      tag: '备用装货地',
      addressCount: 0,
      isEditing: false,
    }),
  ).toEqual({ noticeText: '请填写正确的常用地址联系人电话' });
  expect(
    createAddressInput({
      name: '龙华临时仓',
      address: '龙华区临时中转仓',
      contact: '吴主管 13900139001',
      tag: '备用装货地',
      addressCount: 20,
      isEditing: false,
    }),
  ).toEqual({ noticeText: '最多保存 20 个常用地址' });
  expect(
    createAddressInput({
      name: '龙华临时仓',
      address: '龙华区临时中转仓',
      contact: '吴主管 13900139001',
      tag: '备用装货地',
      addressCount: 20,
      isEditing: true,
    }).address,
  ).toEqual({
    name: '龙华临时仓',
    address: '龙华区临时中转仓',
    contactText: '吴主管 13900139001',
    tagText: '备用装货地',
  });
});

test('creates address delete confirmation state before deleting', () => {
  expect(
    createAddressDeleteConfirmation({
      addressId: 'address-1',
      addressName: '龙华临时仓',
      pendingDeleteAddressId: undefined,
    }),
  ).toEqual({
    confirmed: false,
    pendingDeleteAddressId: 'address-1',
    noticeText: '再次确认删除地址：龙华临时仓',
  });
  expect(
    createAddressDeleteConfirmation({
      addressId: 'address-1',
      addressName: '龙华临时仓',
      pendingDeleteAddressId: 'address-1',
    }),
  ).toEqual({
    confirmed: true,
    pendingDeleteAddressId: undefined,
    noticeText: '常用地址已删除',
  });
});

test('creates a local profile address with a non-colliding local id', () => {
  expect(
    createLocalProfileAddress(profileAddresses, {
      name: '东莞临时仓',
      address: '东莞市松山湖临时仓',
      contactText: '陈主管 13900139004',
      tagText: '备用装货地',
    }),
  ).toEqual({
    id: 'address-local-5',
    name: '东莞临时仓',
    address: '东莞市松山湖临时仓',
    contactText: '陈主管 13900139004',
    tagText: '备用装货地',
  });
});

test('updates and deletes profile addresses without touching other records', () => {
  expect(
    updateProfileAddress(profileAddresses, 'address-local-4', {
      name: '龙华临时仓 A 区',
      address: '龙华区临时中转仓 A 区',
      contactText: '吴主管 13900139002',
      tagText: '备用装货地',
    }),
  ).toEqual([
    profileAddresses[0],
    {
      ...profileAddresses[1],
      name: '龙华临时仓 A 区',
      address: '龙华区临时中转仓 A 区',
    },
    profileAddresses[2],
  ]);

  expect(deleteProfileAddress(profileAddresses, 'address-local-2')).toEqual([
    profileAddresses[0],
    profileAddresses[1],
  ]);
});

test('validates and normalizes local profile contact input', () => {
  expect(
    createContactInput({
      name: '',
      role: '备用装货负责人',
      phone: '13900139001',
      note: '龙华临时仓',
      contactCount: 0,
      isEditing: false,
    }),
  ).toEqual({ noticeText: '请补齐姓名、角色、电话和备注' });
  expect(
    createContactInput({
      name: ' 吴主管 ',
      role: ' 备用装货负责人 ',
      phone: ' 13900139001 ',
      note: ' 龙华临时仓 ',
      contactCount: 0,
      isEditing: false,
    }),
  ).toEqual({
    contact: {
      name: '吴主管',
      roleText: '备用装货负责人',
      phoneText: '13900139001',
      noteText: '龙华临时仓',
    },
    noticeText: '',
  });
});

test('blocks invalid contact phone and add-only contact limit', () => {
  expect(
    createContactInput({
      name: '吴主管',
      role: '备用装货负责人',
      phone: '12345',
      note: '龙华临时仓',
      contactCount: 0,
      isEditing: false,
    }),
  ).toEqual({ noticeText: '请输入正确的常用联系人电话' });
  expect(
    createContactInput({
      name: '吴主管',
      role: '备用装货负责人',
      phone: '13900139001',
      note: '龙华临时仓',
      contactCount: 50,
      isEditing: false,
    }),
  ).toEqual({ noticeText: '最多保存 50 个常用联系人' });
  expect(
    createContactInput({
      name: '吴主管',
      role: '备用装货负责人',
      phone: '13900139001',
      note: '龙华临时仓',
      contactCount: 50,
      isEditing: true,
    }).contact,
  ).toEqual({
    name: '吴主管',
    roleText: '备用装货负责人',
    phoneText: '13900139001',
    noteText: '龙华临时仓',
  });
});

test('creates a local profile contact with a non-colliding local id', () => {
  expect(
    createLocalProfileContact(profileContacts, {
      name: '陈主管',
      roleText: '备用收货负责人',
      phoneText: '13900139004',
      noteText: '东莞临时仓',
    }),
  ).toEqual({
    id: 'contact-local-7',
    name: '陈主管',
    roleText: '备用收货负责人',
    phoneText: '13900139004',
    noteText: '东莞临时仓',
  });
});

test('updates and deletes profile contacts without touching other records', () => {
  expect(
    updateProfileContact(profileContacts, 'contact-local-6', {
      name: '吴主管',
      roleText: '临时仓负责人',
      phoneText: '13900139002',
      noteText: '龙华临时仓 A 区',
    }),
  ).toEqual([
    profileContacts[0],
    {
      ...profileContacts[1],
      roleText: '临时仓负责人',
      noteText: '龙华临时仓 A 区',
    },
    profileContacts[2],
  ]);

  expect(deleteProfileContact(profileContacts, 'contact-local-3')).toEqual([
    profileContacts[0],
    profileContacts[1],
  ]);
});
