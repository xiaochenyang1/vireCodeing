import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { OrderDraftScreen } from '../src/screens/OrderDraftScreen';
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

async function flushMicrotasks() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

describe('OrderDraftScreen address preview', () => {
  afterEach(() => {
    clearProfileLocalState();
    jest.clearAllMocks();
  });

  it('geocodes the pickup address through the platform maps api and normalizes the field', async () => {
    const platformMapsApi = {
      geocode: jest.fn().mockResolvedValue({
        latitude: 22.6,
        longitude: 113.9,
        provider: 'sandbox',
        formattedAddress: '深圳市宝安区福永物流园',
      }),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <OrderDraftScreen
          now={1000}
          onBack={jest.fn()}
          onPublish={jest.fn()}
          platformMapsApi={platformMapsApi}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'draft-pickup-address' })
        .props.onChangeText('  宝安区福永物流园  ');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'draft-pickup-address-preview' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformMapsApi.geocode).toHaveBeenCalledWith('宝安区福永物流园');
    expect(
      renderer.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
    ).toBe('深圳市宝安区福永物流园');
    expect(getRenderedText(renderer)).toContain('装货地址预览');
    expect(getRenderedText(renderer)).toContain(
      '标准地址：深圳市宝安区福永物流园',
    );
    expect(getRenderedText(renderer)).toContain('来源：平台地址解析（沙箱地图）');
    expect(getRenderedText(renderer)).toContain('坐标：22.600000, 113.900000');
    expect(getRenderedText(renderer)).toContain('装货地址已同步平台标准地址。');
  });

  it('geocodes a pickup address suggestion through the platform maps api and normalizes the field', async () => {
    saveProfileLocalState({
      ...getProfileLocalState(),
      addresses: [
        {
          id: 'address-draft-suggestion-1',
          name: '福永仓库',
          address: '  宝安区福永物流园  ',
          contactText: '赵经理 13800138001',
          tagText: '常用装货地',
        },
      ],
      contacts: [],
      syncState: undefined,
    });
    const platformMapsApi = {
      geocode: jest.fn().mockResolvedValue({
        latitude: 22.6,
        longitude: 113.9,
        provider: 'sandbox',
        formattedAddress: '深圳市宝安区福永物流园',
      }),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <OrderDraftScreen
          now={1000}
          onBack={jest.fn()}
          onPublish={jest.fn()}
          platformMapsApi={platformMapsApi}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID: 'draft-pickup-address-suggestion-address-draft-suggestion-1',
        })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformMapsApi.geocode).toHaveBeenCalledWith('宝安区福永物流园');
    expect(
      renderer.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
    ).toBe('深圳市宝安区福永物流园');
    expect(getRenderedText(renderer)).toContain('装货地址预览');
    expect(getRenderedText(renderer)).toContain(
      '标准地址：深圳市宝安区福永物流园',
    );
    expect(getRenderedText(renderer)).toContain('装货地址已同步平台标准地址。');
  });

  it('blocks preview generation when the delivery address is blank', async () => {
    const platformMapsApi = {
      geocode: jest.fn(),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <OrderDraftScreen
          now={1000}
          onBack={jest.fn()}
          onPublish={jest.fn()}
          platformMapsApi={platformMapsApi}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'draft-delivery-address-preview' })
        .props.onPress();
    });

    expect(platformMapsApi.geocode).not.toHaveBeenCalled();
    expect(getRenderedText(renderer)).toContain(
      '请先填写卸货地址后再生成预览。',
    );
  });
});
