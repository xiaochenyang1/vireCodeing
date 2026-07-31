import React from 'react';
import { Image, ScrollView, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { ImageCredentialCard } from '../src/components/ImageCredentialCard';

const previewGroup = [
  { key: 'file-1', title: '异常凭证 1：a.jpg', publicUrl: 'https://cdn/a.jpg' },
  { key: 'file-2', title: '异常凭证 2：b.jpg', publicUrl: 'https://cdn/b.jpg' },
  { key: 'file-3', title: '异常凭证 3：c.jpg', publicUrl: 'https://cdn/c.jpg' },
];

function findByTestID(
  renderer: ReactTestRenderer.ReactTestRenderer,
  testID: string,
) {
  return renderer.root.findByProps({ testID });
}

function queryAllByTestID(
  renderer: ReactTestRenderer.ReactTestRenderer,
  testID: string,
) {
  return renderer.root.findAllByProps({ testID });
}

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

async function renderGroupedCard(
  props: Partial<React.ComponentProps<typeof ImageCredentialCard>> = {},
) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <ImageCredentialCard
        title="异常凭证 2：b.jpg"
        publicUrl="https://cdn/b.jpg"
        placeholderLabel="异常图片"
        metaLines={['来源：平台文件对象（已上传）']}
        imageTestID="exception-proof-image-2"
        previewGroup={previewGroup}
        previewKey="file-2"
        {...props}
      />,
    );
  });

  return renderer;
}

async function openPreview(renderer: ReactTestRenderer.ReactTestRenderer) {
  await ReactTestRenderer.act(async () => {
    findByTestID(renderer, 'exception-proof-image-2-trigger').props.onPress();
  });
}

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

describe('ImageCredentialCard preview carousel', () => {
  it('opens the preview on the tapped image and shows its position in the group', async () => {
    const renderer = await renderGroupedCard();
    await openPreview(renderer);

    expect(
      findByTestID(renderer, 'exception-proof-image-2-counter').props.children,
    ).toBe('2 / 3');
    expect(getRenderedText(renderer)).toContain('异常凭证 2：b.jpg');
  });

  it('steps to the next and previous image without leaving the modal', async () => {
    const renderer = await renderGroupedCard();
    await openPreview(renderer);

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-next').props.onPress();
    });

    expect(
      findByTestID(renderer, 'exception-proof-image-2-counter').props.children,
    ).toBe('3 / 3');
    expect(getRenderedText(renderer)).toContain('异常凭证 3：c.jpg');

    await ReactTestRenderer.act(async () => {
      findByTestID(
        renderer,
        'exception-proof-image-2-previous',
      ).props.onPress();
    });

    expect(
      findByTestID(renderer, 'exception-proof-image-2-counter').props.children,
    ).toBe('2 / 3');
  });

  it('disables the step buttons at both ends of the group', async () => {
    const renderer = await renderGroupedCard({
      title: '异常凭证 1：a.jpg',
      publicUrl: 'https://cdn/a.jpg',
      previewKey: 'file-1',
    });
    await openPreview(renderer);

    expect(
      findByTestID(renderer, 'exception-proof-image-2-previous').props.disabled,
    ).toBe(true);
    expect(
      findByTestID(renderer, 'exception-proof-image-2-next').props.disabled,
    ).toBe(false);

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-next').props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-next').props.onPress();
    });

    expect(
      findByTestID(renderer, 'exception-proof-image-2-next').props.disabled,
    ).toBe(true);
  });

  it('follows horizontal paging swipes once the page width is measured', async () => {
    const renderer = await renderGroupedCard();
    await openPreview(renderer);

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-pager').props.onLayout({
        nativeEvent: { layout: { width: 300 } },
      });
    });
    await ReactTestRenderer.act(async () => {
      findByTestID(
        renderer,
        'exception-proof-image-2-pager',
      ).props.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: 600 } },
      });
    });

    expect(
      findByTestID(renderer, 'exception-proof-image-2-counter').props.children,
    ).toBe('3 / 3');
  });

  it('keeps the visible page in sync when step buttons change the index', async () => {
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => undefined);
    const renderer = await renderGroupedCard();
    await openPreview(renderer);

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-pager').props.onLayout({
        nativeEvent: { layout: { width: 300 } },
      });
    });
    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-next').props.onPress();
    });

    expect(scrollTo).toHaveBeenLastCalledWith({
      x: 600,
      y: 0,
      animated: false,
    });
    scrollTo.mockRestore();
  });

  it('skips group images that have no preview url yet', async () => {
    const renderer = await renderGroupedCard({
      previewGroup: [
        previewGroup[0],
        { key: 'file-2', title: '异常凭证 2：b.jpg' },
        previewGroup[2],
      ],
    });
    await openPreview(renderer);

    expect(
      findByTestID(renderer, 'exception-proof-image-2-counter').props.children,
    ).toBe('1 / 2');
  });

  it('keeps the single image preview when the card has no group', async () => {
    const renderer = await renderGroupedCard({
      previewGroup: undefined,
      previewKey: undefined,
    });
    await openPreview(renderer);

    expect(
      queryAllByTestID(renderer, 'exception-proof-image-2-counter'),
    ).toHaveLength(0);
    expect(
      queryAllByTestID(renderer, 'exception-proof-image-2-pager'),
    ).toHaveLength(0);
    expect(
      renderer.root
        .findAllByType(Image)
        .some(node => node.props.source?.uri === 'https://cdn/b.jpg'),
    ).toBe(true);
  });
});
