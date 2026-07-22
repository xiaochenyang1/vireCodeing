import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { ImageCredentialCard } from '../src/components/ImageCredentialCard';

describe('ImageCredentialCard', () => {
  it('opens and closes a fullscreen preview when the credential image is tapped', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ImageCredentialCard
          title="营业执照凭证：营业执照.png"
          publicUrl="https://cdn.example.com/license.png"
          placeholderLabel="营业执照"
          metaLines={['来源：平台文件对象（已上传）']}
          imageTestID="credential-preview-image"
        />,
      );
    });

    expect(
      renderer.root.findAllByProps({
        testID: 'credential-preview-image-modal',
      }),
    ).toHaveLength(0);

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'credential-preview-image-trigger' })
        .props.onPress();
    });

    expect(
      renderer.root.findByProps({
        testID: 'credential-preview-image-modal',
      }),
    ).toBeDefined();

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'credential-preview-image-close' })
        .props.onPress();
    });

    expect(
      renderer.root.findAllByProps({
        testID: 'credential-preview-image-modal',
      }),
    ).toHaveLength(0);
  });

  it('keeps placeholder cards non-previewable when no public image url exists', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ImageCredentialCard
          title="营业执照凭证：待上传占位"
          placeholderLabel="营业执照"
          metaLines={['来源：本地图片凭证占位']}
          placeholderTestID="credential-preview-placeholder"
        />,
      );
    });

    expect(
      renderer.root.findByProps({
        testID: 'credential-preview-placeholder',
      }).props.children,
    ).toBe('营业执照');
    expect(
      renderer.root.findAllByProps({
        testID: 'credential-preview-image-trigger',
      }),
    ).toHaveLength(0);
  });
});
