import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { ProfileOverviewPanel } from '../src/screens/profile/ProfileOverviewPanel';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

describe('ProfileOverviewPanel', () => {
  it('renders the initial placeholder when no synced avatar url exists', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ProfileOverviewPanel
          avatarInitial="张"
          avatarPhotoCount={0}
          displayName="张先生"
          accountTypeLabel="个人货主"
          maskedPhone="138****8000"
          verificationLabel="已认证"
          enterpriseVerificationLabel="未认证"
          creditScore={96}
          monthlyOrderCount={2}
          unreadMessageCount={3}
        />,
      );
    });

    expect(() => renderer.root.findByProps({ testID: 'profile-avatar-image' })).toThrow();
    expect(getRenderedText(renderer)).toContain('头像占位：张');
  });

  it('renders the synced platform avatar when a public url exists', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ProfileOverviewPanel
          avatarInitial="张"
          avatarPhotoCount={1}
          avatarPublicUrl="https://cdn.example.com/avatar/file-avatar-1.png"
          displayName="张先生"
          accountTypeLabel="个人货主"
          maskedPhone="138****8000"
          verificationLabel="已认证"
          enterpriseVerificationLabel="未认证"
          creditScore={96}
          monthlyOrderCount={2}
          unreadMessageCount={3}
        />,
      );
    });

    expect(
      renderer.root.findByProps({ testID: 'profile-avatar-image' }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/avatar/file-avatar-1.png',
    });
    expect(getRenderedText(renderer)).toContain('头像：平台已同步');
    expect(getRenderedText(renderer)).not.toContain('头像占位：张');
  });

  it('renders a local avatar saved notice when only a local avatar credential exists', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ProfileOverviewPanel
          avatarInitial="张"
          avatarPhotoCount={1}
          displayName="张先生"
          accountTypeLabel="个人货主"
          maskedPhone="138****8000"
          verificationLabel="已认证"
          enterpriseVerificationLabel="未认证"
          creditScore={96}
          monthlyOrderCount={2}
          unreadMessageCount={3}
        />,
      );
    });

    expect(() => renderer.root.findByProps({ testID: 'profile-avatar-image' })).toThrow();
    expect(getRenderedText(renderer)).toContain('头像凭证：本地已保存');
    expect(getRenderedText(renderer)).not.toContain('头像占位：张');
  });
});
