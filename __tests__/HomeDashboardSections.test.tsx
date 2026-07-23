import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {
  CitySelector,
  TopBar,
  VerificationPanel,
} from '../src/screens/home/HomeDashboardSections';
import type { FrequentRoute, RecentOrder } from '../src/types';
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
    .join(' ');
}

describe('HomeDashboardSections CitySelector', () => {
  afterEach(() => {
    clearProfileLocalState();
  });

  it('renders city suggestions from current routes and orders', async () => {
    const routes: FrequentRoute[] = [
      {
        id: 'route-shenzhen-1',
        name: '宝安仓库到南山门店',
        from: '宝安区福永物流园',
        to: '南山区科技园门店',
        lastUsedText: '昨天使用',
      },
      {
        id: 'route-guangzhou-1',
        name: '番禺仓库到天河门店',
        from: '番禺区临时仓',
        to: '天河区体育西门店',
        lastUsedText: '上周使用',
      },
    ];
    const orders: RecentOrder[] = [
      {
        id: 'HY20260722011',
        status: 'waiting',
        from: '东莞市长安镇仓库',
        to: '佛山市顺德区门店',
        cargoType: '数码',
        weightText: '1 吨',
        vehicleRequirement: '面包车',
        priceText: '￥320',
        updatedAtText: '刚刚',
      },
    ];

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <CitySelector
          selectedCity="深圳"
          routes={routes}
          orders={orders}
          onSelectCity={jest.fn()}
        />,
      );
    });

    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain('深圳');
    expect(renderedText).toContain('当前城市');
    expect(renderedText).toContain('当前展示已命中常用路线 1 条。');
    expect(renderedText).toContain('广州');
    expect(renderedText).toContain('关联：常用路线 1 条。');
    expect(renderedText).toContain('东莞');
    expect(renderedText).toContain('关联：订单路线 1 单。');
    expect(renderedText).toContain('佛山');
    expect(renderedText).toContain(
      '当前城市建议会结合已选城市、常用路线和订单路线生成；定位、城市服务和跨城规则仍未接入。',
    );
  });

  it('renders the synced platform avatar in the verification panel when a public url exists', async () => {
    const currentState = getProfileLocalState();
    saveProfileLocalState({
      ...currentState,
      account: {
        ...currentState.account,
        displayName: '晨星货主',
        avatarPhotoCount: 1,
        avatarFileId: 'file-avatar-1',
        avatarPublicUrl: 'https://cdn.example.com/avatar/file-avatar-1.png',
      },
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <VerificationPanel orders={[]} routeCount={2} unreadMessageCount={3} />,
      );
    });

    expect(
      renderer.root.findByProps({ testID: 'home-verification-avatar-image' })
        .props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/avatar/file-avatar-1.png',
    });
    expect(getRenderedText(renderer)).toContain('下午好');
    expect(getRenderedText(renderer)).toContain('晨星货主');
    expect(getRenderedText(renderer)).toContain('头像：平台已同步');
  });

  it('renders the synced platform avatar in the home top bar profile entry when a public url exists', async () => {
    const currentState = getProfileLocalState();
    saveProfileLocalState({
      ...currentState,
      account: {
        ...currentState.account,
        displayName: '晨星货主',
        avatarPhotoCount: 1,
        avatarFileId: 'file-avatar-1',
        avatarPublicUrl: 'https://cdn.example.com/avatar/file-avatar-1.png',
      },
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <TopBar
          city="深圳"
          unreadMessageCount={3}
          onLogout={jest.fn()}
          onOpenCitySelector={jest.fn()}
          onOpenMessages={jest.fn()}
          onOpenHelp={jest.fn()}
          onOpenProfile={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({ testID: 'home-top-bar-avatar-image' }).props
        .source,
    ).toEqual({
      uri: 'https://cdn.example.com/avatar/file-avatar-1.png',
    });
  });

  it('falls back to the profile initial in the home top bar profile entry when no public url exists', async () => {
    const currentState = getProfileLocalState();
    saveProfileLocalState({
      ...currentState,
      account: {
        ...currentState.account,
        displayName: '晨星货主',
        avatarPhotoCount: 0,
        avatarFileId: undefined,
        avatarPublicUrl: undefined,
      },
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <TopBar
          city="深圳"
          unreadMessageCount={3}
          onLogout={jest.fn()}
          onOpenCitySelector={jest.fn()}
          onOpenMessages={jest.fn()}
          onOpenHelp={jest.fn()}
          onOpenProfile={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({ testID: 'home-top-bar-avatar-text' }).props
        .children,
    ).toBe('晨');
  });
});
