import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { ProfileTopBar } from '../src/screens/profile/ProfileTopBar';

describe('ProfileTopBar', () => {
  it('renders the synced platform avatar when a public url exists', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ProfileTopBar
          title="个人中心"
          subtitle="账号资料与常用功能"
          onBack={jest.fn()}
          backTestID="profile-top-bar-back"
          backText="返回"
          account={{
            displayName: '晨星货主',
            avatarPublicUrl: 'https://cdn.example.com/avatar/file-avatar-1.png',
          }}
        />,
      );
    });

    expect(
      renderer.root.findByProps({ testID: 'profile-top-bar-avatar-image' })
        .props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/avatar/file-avatar-1.png',
    });
  });

  it('falls back to the profile initial when no public url exists', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ProfileTopBar
          title="个人中心"
          subtitle="账号资料与常用功能"
          onBack={jest.fn()}
          backTestID="profile-top-bar-back"
          backText="返回"
          account={{
            displayName: '晨星货主',
          }}
        />,
      );
    });

    expect(
      renderer.root.findByProps({ testID: 'profile-top-bar-avatar-text' }).props
        .children,
    ).toBe('晨');
  });
});
