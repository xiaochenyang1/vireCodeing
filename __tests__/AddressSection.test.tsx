import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { AddressSection } from '../src/screens/order-draft/AddressSection';
import {
  clearProfileLocalState,
  getProfileLocalState,
  saveProfileLocalState,
} from '../src/utils/profileLocalState';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

async function renderAddressSection() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <AddressSection
        pickupAddress=""
        onPickupAddressChange={jest.fn()}
        pickupNoteText=""
        onPickupNoteTextChange={jest.fn()}
        pickupContact=""
        onPickupContactChange={jest.fn()}
        pickupPhone=""
        onPickupPhoneChange={jest.fn()}
        deliveryAddress=""
        onDeliveryAddressChange={jest.fn()}
        deliveryNoteText=""
        onDeliveryNoteTextChange={jest.fn()}
        deliveryContact=""
        onDeliveryContactChange={jest.fn()}
        deliveryPhone=""
        onDeliveryPhoneChange={jest.fn()}
      />,
    );
  });

  return renderer;
}

describe('AddressSection', () => {
  afterEach(() => {
    clearProfileLocalState();
    jest.clearAllMocks();
  });

  it('renders local address-book details in draft suggestions', async () => {
    saveProfileLocalState({
      ...getProfileLocalState(),
      addresses: [
        {
          id: 'address-local-test-1',
          name: '龙华临时仓',
          address: '龙华区临时中转仓',
          contactText: '吴主管 13900139001',
          tagText: '备用装货地',
        },
      ],
      contacts: [
        {
          id: 'contact-local-test-1',
          name: '吴主管',
          roleText: '备用装货负责人',
          phoneText: '13900139001',
          noteText: '龙华临时仓',
        },
      ],
      syncState: undefined,
    });

    const renderer = await renderAddressSection();
    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain('装货：龙华临时仓');
    expect(renderedText).toContain('联系人：吴主管 13900139001');
    expect(renderedText).toContain('标签：备用装货地');
    expect(renderedText).toContain('来源：本地地址簿');
    expect(renderedText).toContain('角色：备用装货负责人');
    expect(renderedText).toContain('电话：13900139001');
    expect(renderedText).toContain('备注：龙华临时仓');
    expect(renderedText).toContain('来源：本地联系人');
    expect(renderedText).toContain(
      '当前可直接使用本地联系人建议回填装卸联系人，角色和备注会同步展示。',
    );
    expect(renderedText).not.toContain('真实系统通讯录选择仍未接入。');
  });

  it('marks platform-synced address-book suggestions with snapshot details', async () => {
    saveProfileLocalState({
      ...getProfileLocalState(),
      addresses: [
        {
          id: 'address-platform-test-1',
          name: '平台前海仓',
          address: '前海平台仓库',
          contactText: '平台调度 13900139021',
          tagText: '平台优先',
        },
      ],
      contacts: [
        {
          id: 'contact-platform-test-1',
          name: '平台调度',
          roleText: '卸货联系人',
          phoneText: '13900139021',
          noteText: '优先联系月台',
        },
      ],
      syncState: {
        status: 'synced',
        operation: 'addressBook',
        message: '平台地址簿已拉取到本地常用地址/联系人。',
        updatedAtText: '今天 16:00',
        updatedAtIso: '2026-07-22T08:00:00.000Z',
        platformUpdatedAtIso: '2026-07-22T08:00:00.000Z',
        platformAddressIds: ['address-platform-test-1'],
        platformContactIds: ['contact-platform-test-1'],
      },
    });

    const renderer = await renderAddressSection();
    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain(
      '当前建议来自个人中心地址簿，平台地址簿快照已同步到当前列表。',
    );
    expect(renderedText).toContain('来源：平台地址簿快照');
    expect(renderedText).toContain('角色：卸货联系人');
    expect(renderedText).toContain('备注：优先联系月台');
    expect(renderedText).toContain(
      '当前联系人建议已包含平台地址簿快照中的角色、电话和备注，可直接回填装卸联系人。',
    );
  });
});
