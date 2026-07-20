import {
  createAddressBookConflictSummary,
  createAddressConflictFieldItems,
  createContactConflictFieldItems,
  createResolvedAddressBookConflictSyncState,
  getProfileItemIds,
  isValidPlatformAccountProfile,
  isValidPlatformIdentityVerification,
  isValidPlatformSpendingSnapshot,
  mapPlatformAddressBookToLocalState,
  mapPlatformIdentityVerificationToLocalState,
  updateProfileAddressConflictField,
  upsertProfileItem,
} from '../src/utils/profilePlatformSync';
import type {
  AddressItem,
  ContactItem,
  ProfileSyncState,
} from '../src/utils/profileLocalState';

const address = (overrides: Partial<AddressItem> = {}): AddressItem => ({
  id: 'address-1',
  name: '宝安仓库',
  address: '宝安区福永物流园',
  contactText: '赵经理 13800138001',
  tagText: '默认装货地',
  ...overrides,
});

const contact = (overrides: Partial<ContactItem> = {}): ContactItem => ({
  id: 'contact-1',
  name: '赵经理',
  roleText: '装货负责人',
  phoneText: '13800138001',
  noteText: '3 号门',
  ...overrides,
});

test('maps a platform address book and backfills optional text fields', () => {
  const mapped = mapPlatformAddressBookToLocalState({
    addresses: [{ ...address(), tagText: undefined }],
    contacts: [{ ...contact(), noteText: undefined }],
    updatedAtIso: '2026-07-10T00:00:00.000Z',
  } as never);

  expect(mapped.addresses[0].tagText).toBe('');
  expect(mapped.contacts[0].noteText).toBe('');
});

test('summarizes the platform address book by first address, then contact', () => {
  expect(
    createAddressBookConflictSummary({
      addresses: [address({ name: '沈阳仓' })],
      contacts: [],
    } as never),
  ).toBe('服务端地址簿：沈阳仓');

  expect(
    createAddressBookConflictSummary({
      addresses: [],
      contacts: [contact({ name: '钱经理' })],
    } as never),
  ).toBe('服务端地址簿：钱经理');

  expect(
    createAddressBookConflictSummary({ addresses: [], contacts: [] } as never),
  ).toBe('服务端地址簿：服务端暂无地址/联系人');
});

test('validates platform account profile shape', () => {
  expect(
    isValidPlatformAccountProfile({ displayName: '张三', phone: '138' } as never),
  ).toBe(true);
  expect(isValidPlatformAccountProfile(null)).toBe(false);
  expect(isValidPlatformAccountProfile({ displayName: '张三' } as never)).toBe(
    false,
  );
});

test('validates and maps a platform identity verification', () => {
  const snapshot = {
    realName: '张三',
    idNumber: '2101',
    identityFrontFileId: 'file-front',
    identityBackFileId: 'file-back',
    faceVerified: true,
    status: 'approved',
    updatedAtIso: '2026-07-10T00:00:00.000Z',
  };

  expect(isValidPlatformIdentityVerification(snapshot as never)).toBe(true);
  expect(
    isValidPlatformIdentityVerification({
      ...snapshot,
      faceVerified: false,
    } as never),
  ).toBe(false);

  const mapped = mapPlatformIdentityVerificationToLocalState(snapshot as never);
  expect(mapped.identityPhotoFiles).toHaveLength(2);
  expect(mapped.identityPhotoFiles?.[0]).toMatchObject({
    fileId: 'file-front',
    purpose: 'identity',
    status: 'uploaded',
  });
  expect(mapped.status).toBe('approved');
});

test('rejects an invalid platform spending snapshot', () => {
  expect(isValidPlatformSpendingSnapshot(undefined)).toBe(false);
  expect(
    isValidPlatformSpendingSnapshot({
      shipperId: 's1',
      summary: { completedTotalCents: 1, activeTotalCents: 2 },
      items: [],
    } as never),
  ).toBe(false);
  expect(
    isValidPlatformSpendingSnapshot({
      shipperId: 's1',
      summary: {
        completedTotalCents: 100,
        activeTotalCents: 0,
        refundTotalCents: 0,
      },
      items: [
        {
          orderId: 'order-1',
          orderNo: 'HY1',
          status: 'completed',
          paymentMethod: 'online',
          amountCents: 100,
          occurredAtIso: '2026-07-15T08:00:00.000Z',
          routeText: 'A → B',
        },
      ],
    } as never),
  ).toBe(false);

  const validSnapshot = {
    shipperId: 's1',
    summary: {
      completedTotalCents: 100,
      activeTotalCents: 0,
      refundTotalCents: 0,
    },
    items: [
      {
        orderId: 'order-1',
        orderNo: 'HY1',
        status: 'completed',
        paymentMethod: 'online',
        paymentStatus: 'settled',
        paymentChannel: 'wechat',
        paymentOrderStatus: 'settled',
        amountCents: 100,
        occurredAtIso: '2026-07-15T08:00:00.000Z',
        paidAtIso: '2026-07-15T07:50:00.000Z',
        settledAtIso: '2026-07-15T08:00:00.000Z',
        routeText: 'A → B',
      },
    ],
  };
  expect(isValidPlatformSpendingSnapshot(validSnapshot as never)).toBe(true);
  expect(
    isValidPlatformSpendingSnapshot({
      ...validSnapshot,
      items: [{ ...validSnapshot.items[0], paymentStatus: 'invented' }],
    } as never),
  ).toBe(false);
  expect(
    isValidPlatformSpendingSnapshot({
      ...validSnapshot,
      items: [{ ...validSnapshot.items[0], refundAmountCents: -1 }],
    } as never),
  ).toBe(false);
});

test('builds only the differing address conflict field items', () => {
  const items = createAddressConflictFieldItems(
    [address({ name: '本地仓', address: '本地路' })],
    [address({ name: '平台仓', address: '本地路' })],
  );

  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    id: 'address-1-name',
    addressId: 'address-1',
    fieldKey: 'name',
    localValue: '本地仓',
    platformValue: '平台仓',
  });
});

test('skips platform contacts that have no local counterpart', () => {
  expect(
    createContactConflictFieldItems(
      [contact({ id: 'contact-1' })],
      [contact({ id: 'contact-2', name: '钱经理' })],
    ),
  ).toEqual([]);
});

test('upserts a profile item by id', () => {
  const base = [address({ id: 'a1' })];
  expect(upsertProfileItem(base, address({ id: 'a2' }))).toHaveLength(2);

  const replaced = upsertProfileItem(base, address({ id: 'a1', name: '新名' }));
  expect(replaced).toHaveLength(1);
  expect(replaced[0].name).toBe('新名');
});

test('adopts a platform value into the addressed conflict field', () => {
  const result = updateProfileAddressConflictField(
    [address({ id: 'a1', name: '旧' }), address({ id: 'a2', name: '不变' })],
    'a1',
    'name',
    '平台值',
  );

  expect(result[0].name).toBe('平台值');
  expect(result[1].name).toBe('不变');
});

test('getProfileItemIds returns ids in order', () => {
  expect(getProfileItemIds([address({ id: 'a1' }), address({ id: 'a2' })])).toEqual(
    ['a1', 'a2'],
  );
});

test('clears conflict metadata once all conflict items are resolved', () => {
  const withConflicts: ProfileSyncState = {
    status: 'failed',
    operation: 'addressBook',
    message: '冲突',
    updatedAtText: '刚刚',
    updatedAtIso: '2026-07-10T00:00:00.000Z',
    conflictSummaryText: '服务端地址簿：X',
    conflictAddressItems: [address({ id: 'a9' })],
  };

  // Still has one conflict item → unchanged.
  expect(createResolvedAddressBookConflictSyncState(withConflicts)).toBe(
    withConflicts,
  );

  const resolved = createResolvedAddressBookConflictSyncState({
    ...withConflicts,
    conflictAddressItems: [],
  });
  expect(resolved.conflictSummaryText).toBeUndefined();
  expect(resolved.conflictAddressItems).toBeUndefined();
  expect(resolved.message).toBe('平台地址簿冲突项已处理完，请重试同步覆盖平台。');
});
