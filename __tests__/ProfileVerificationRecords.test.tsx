import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { EnterpriseVerificationRecords } from '../src/screens/profile/EnterpriseVerificationRecords';
import { IdentityVerificationRecords } from '../src/screens/profile/IdentityVerificationRecords';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

describe('Profile verification preview cards', () => {
  it('renders identity credential preview images when platform public urls exist', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <IdentityVerificationRecords
          verification={{
            realName: '张先生',
            idNumber: '440300199001011234',
            identityPhotoCount: 2,
            identityPhotoFiles: [
              {
                fileId: 'file-front',
                fileName: '身份证正面.png',
                purpose: 'identity',
                status: 'uploaded',
                publicUrl: 'https://cdn.example.com/file-front.png',
              },
              {
                fileId: 'file-back',
                fileName: '身份证反面.png',
                purpose: 'identity',
                status: 'uploaded',
                publicUrl: 'https://cdn.example.com/file-back.png',
              },
            ],
            faceVerified: true,
          }}
          onSubmit={jest.fn()}
          onReject={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({
        testID: 'identity-verification-front-preview-image',
      }).props.source,
    ).toEqual({ uri: 'https://cdn.example.com/file-front.png' });
    expect(
      renderer.root.findByProps({
        testID: 'identity-verification-back-preview-image',
      }).props.source,
    ).toEqual({ uri: 'https://cdn.example.com/file-back.png' });
    expect(getRenderedText(renderer)).toContain('身份证凭证清单');
    expect(getRenderedText(renderer)).toContain('已生成预览地址。');
  });

  it('renders identity credential placeholders when only local placeholders exist', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <IdentityVerificationRecords
          verification={{
            realName: '张先生',
            idNumber: '440300199001011234',
            identityPhotoCount: 2,
            faceVerified: false,
          }}
          onSubmit={jest.fn()}
          onReject={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({
        testID: 'identity-verification-front-preview-placeholder',
      }).props.children,
    ).toBe('身份证正面');
    expect(
      renderer.root.findByProps({
        testID: 'identity-verification-back-preview-placeholder',
      }).props.children,
    ).toBe('身份证反面');
    expect(getRenderedText(renderer)).toContain('来源：本地图片凭证占位');
  });

  it('renders enterprise credential preview image when platform public url exists', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <EnterpriseVerificationRecords
          verification={{
            enterpriseName: '深圳晨星贸易有限公司',
            creditCode: '91440300MA5TEST001',
            legalName: '张先生',
            legalId: '440300199001011234',
            enterprisePhone: '13900139088',
            licensePhotoCount: 1,
            licenseFiles: [
              {
                fileId: 'file-license',
                fileName: '营业执照.png',
                purpose: 'identity',
                status: 'uploaded',
                publicUrl: 'https://cdn.example.com/file-license.png',
              },
            ],
          }}
          onSubmit={jest.fn()}
          onReject={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({
        testID: 'enterprise-verification-license-preview-image',
      }).props.source,
    ).toEqual({ uri: 'https://cdn.example.com/file-license.png' });
    expect(getRenderedText(renderer)).toContain('营业执照凭证清单');
    expect(getRenderedText(renderer)).toContain('已生成预览地址。');
  });

  it('renders enterprise credential placeholder when only a local placeholder exists', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <EnterpriseVerificationRecords
          verification={{
            enterpriseName: '深圳晨星贸易有限公司',
            creditCode: '91440300MA5TEST001',
            legalName: '张先生',
            legalId: '440300199001011234',
            enterprisePhone: '13900139088',
            licensePhotoCount: 1,
          }}
          onSubmit={jest.fn()}
          onReject={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({
        testID: 'enterprise-verification-license-preview-placeholder',
      }).props.children,
    ).toBe('营业执照');
    expect(getRenderedText(renderer)).toContain('来源：本地图片凭证占位');
  });
});
