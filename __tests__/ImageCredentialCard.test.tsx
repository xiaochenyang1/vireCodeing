import React from 'react';
import { Image, ScrollView, StyleSheet, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { ImageCredentialCard } from '../src/components/ImageCredentialCard';
import {
  createImagePreviewRefreshSourceId,
  ImagePreviewRefreshProvider,
} from '../src/components/ImagePreviewRefreshProvider';

const previewGroup = [
  {
    key: 'file-1',
    title: '异常凭证 1：a.jpg',
    publicUrl: 'https://cdn/a.jpg',
    fileId: 'file-1',
  },
  {
    key: 'file-2',
    title: '异常凭证 2：b.jpg',
    publicUrl: 'https://cdn/b.jpg',
    fileId: 'file-2',
  },
  {
    key: 'file-3',
    title: '异常凭证 3：c.jpg',
    publicUrl: 'https://cdn/c.jpg',
    fileId: 'file-3',
  },
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
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
        previewFileId="file-2"
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
  it('isolates refresh records between exception cases', () => {
    const first = createImagePreviewRefreshSourceId(
      'file-1',
      'https://cdn/file-1.jpg',
      { kind: 'exceptionCase', orderId: 'order-1', caseId: 'case-1' },
    );
    const second = createImagePreviewRefreshSourceId(
      'file-1',
      'https://cdn/file-1.jpg',
      { kind: 'exceptionCase', orderId: 'order-1', caseId: 'case-2' },
    );

    expect(first).not.toBe(second);
  });

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

  it('rotates each carousel image independently without changing its page bounds', async () => {
    const renderer = await renderGroupedCard();
    await openPreview(renderer);
    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-pager').props.onLayout({
        nativeEvent: { layout: { width: 300 } },
      });
      findByTestID(
        renderer,
        'exception-proof-image-2-rotate-right',
      ).props.onPress();
    });

    expect(
      StyleSheet.flatten(
        findByTestID(renderer, 'exception-proof-image-2-page-2').props.style,
      ),
    ).toMatchObject({
      width: 320,
      height: 300,
      transform: [{ rotate: '90deg' }],
    });

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-next').props.onPress();
    });

    expect(
      StyleSheet.flatten(
        findByTestID(renderer, 'exception-proof-image-2-page-3').props.style,
      ).transform,
    ).toEqual([{ rotate: '0deg' }]);

    await ReactTestRenderer.act(async () => {
      findByTestID(
        renderer,
        'exception-proof-image-2-rotate-left',
      ).props.onPress();
      findByTestID(
        renderer,
        'exception-proof-image-2-previous',
      ).props.onPress();
    });

    expect(
      StyleSheet.flatten(
        findByTestID(renderer, 'exception-proof-image-2-page-2').props.style,
      ).transform,
    ).toEqual([{ rotate: '90deg' }]);
  });

  it('resets single-image rotation when the modal session closes', async () => {
    const renderer = await renderGroupedCard({
      previewGroup: undefined,
      previewKey: undefined,
    });
    await openPreview(renderer);

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-media').props.onLayout({
        nativeEvent: { layout: { width: 300 } },
      });
      findByTestID(
        renderer,
        'exception-proof-image-2-rotate-left',
      ).props.onPress();
    });

    expect(
      findByTestID(renderer, 'exception-proof-image-2-rotation').props.children,
    ).toEqual([270, '°']);
    expect(
      StyleSheet.flatten(
        findByTestID(renderer, 'exception-proof-image-2-single-preview').props
          .style,
      ).transform,
    ).toEqual([{ rotate: '270deg' }]);
    expect(
      StyleSheet.flatten(
        findByTestID(renderer, 'exception-proof-image-2-single-preview').props
          .style,
      ),
    ).toMatchObject({ width: 320, height: 300 });

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-close').props.onPress();
    });
    await openPreview(renderer);

    expect(
      findByTestID(renderer, 'exception-proof-image-2-rotation').props.children,
    ).toEqual([0, '°']);
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

  it('keeps the tapped image when its group entry has no preview url yet', async () => {
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
    ).toBe('2 / 3');
    expect(getRenderedText(renderer)).toContain('异常凭证 2：b.jpg');
  });

  it('keeps the active image identity when a same-size group is reordered', async () => {
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
      renderer.update(
        <ImageCredentialCard
          title="异常凭证 2：b.jpg"
          publicUrl="https://cdn/b.jpg"
          placeholderLabel="异常图片"
          metaLines={['来源：平台文件对象（已上传）']}
          imageTestID="exception-proof-image-2"
          previewGroup={[previewGroup[1], previewGroup[2], previewGroup[0]]}
          previewKey="file-2"
        />,
      );
    });

    expect(
      findByTestID(renderer, 'exception-proof-image-2-counter').props.children,
    ).toBe('1 / 3');
    expect(getRenderedText(renderer)).toContain('异常凭证 2：b.jpg');
    expect(scrollTo).toHaveBeenLastCalledWith({
      x: 0,
      y: 0,
      animated: false,
    });
    scrollTo.mockRestore();
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

  it('renews a failed preview once and exposes a manual retry after another load error', async () => {
    const refreshPreviewUrl = jest
      .fn()
      .mockResolvedValueOnce('https://cdn/fresh-b-1.jpg')
      .mockResolvedValueOnce('https://cdn/fresh-b-2.jpg');
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
          <ImageCredentialCard
            title="异常凭证 2：b.jpg"
            publicUrl="https://cdn/b.jpg"
            placeholderLabel="异常图片"
            metaLines={['来源：平台文件对象（已上传）']}
            imageTestID="exception-proof-image-2"
            previewGroup={previewGroup}
            previewKey="file-2"
            previewFileId="file-2"
          />
        </ImagePreviewRefreshProvider>,
      );
    });

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2').props.onError();
      await Promise.resolve();
    });

    expect(refreshPreviewUrl).toHaveBeenCalledTimes(1);
    expect(refreshPreviewUrl).toHaveBeenCalledWith('file-2');
    expect(
      findByTestID(renderer, 'exception-proof-image-2').props.source,
    ).toEqual({ uri: 'https://cdn/fresh-b-1.jpg' });

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2').props.onError();
    });
    await openPreview(renderer);

    expect(refreshPreviewUrl).toHaveBeenCalledTimes(1);
    expect(
      findByTestID(renderer, 'exception-proof-image-2-load-status'),
    ).toBeDefined();

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-retry').props.onPress();
      await Promise.resolve();
    });

    expect(refreshPreviewUrl).toHaveBeenCalledTimes(2);
    expect(
      findByTestID(renderer, 'exception-proof-image-2').props.source,
    ).toEqual({ uri: 'https://cdn/fresh-b-2.jpg' });
    expect(
      queryAllByTestID(renderer, 'exception-proof-image-2-load-status'),
    ).toHaveLength(0);
  });

  it('passes order access context when renewing a participant attachment', async () => {
    const refreshPreviewUrl = jest
      .fn()
      .mockResolvedValue('https://cdn/order-file-renewed.jpg');
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
          <ImageCredentialCard
            title="司机回单"
            publicUrl="https://cdn/order-file.jpg"
            placeholderLabel="回单"
            metaLines={['来源：订单附件']}
            imageTestID="order-participant-attachment"
            previewKey="file-order-1"
            previewFileId="file-order-1"
            previewAccess={{ kind: 'order', orderId: 'order-1' }}
          />
        </ImagePreviewRefreshProvider>,
      );
    });
    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'order-participant-attachment').props.onError();
      await Promise.resolve();
    });

    expect(refreshPreviewUrl).toHaveBeenCalledWith('file-order-1', {
      kind: 'order',
      orderId: 'order-1',
    });
  });

  it('keeps preview load failures scoped to their carousel entry', async () => {
    const refreshPreviewUrl = jest.fn().mockRejectedValue(new Error('expired'));
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
          <ImageCredentialCard
            title="异常凭证 2：b.jpg"
            publicUrl="https://cdn/b.jpg"
            placeholderLabel="异常图片"
            metaLines={['来源：平台文件对象（已上传）']}
            imageTestID="exception-proof-image-2"
            previewGroup={previewGroup}
            previewKey="file-2"
            previewFileId="file-2"
          />
        </ImagePreviewRefreshProvider>,
      );
    });
    await openPreview(renderer);

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-page-1').props.onError();
      await Promise.resolve();
    });

    expect(refreshPreviewUrl).toHaveBeenCalledWith('file-1');
    expect(
      queryAllByTestID(renderer, 'exception-proof-image-2-load-status'),
    ).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      findByTestID(
        renderer,
        'exception-proof-image-2-previous',
      ).props.onPress();
    });

    expect(
      findByTestID(renderer, 'exception-proof-image-2-load-status'),
    ).toBeDefined();
  });

  it('drops a refreshed override when the parent supplies a newer source url', async () => {
    const refreshPreviewUrl = jest
      .fn()
      .mockResolvedValueOnce('https://cdn/refreshed-b.jpg')
      .mockResolvedValueOnce('https://cdn/refreshed-b-again.jpg');
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    const renderCard = (publicUrl: string) => (
      <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
        <ImageCredentialCard
          title="异常凭证 2：b.jpg"
          publicUrl={publicUrl}
          placeholderLabel="异常图片"
          metaLines={['来源：平台文件对象（已上传）']}
          imageTestID="exception-proof-image-2"
          previewGroup={[
            previewGroup[0],
            { ...previewGroup[1], publicUrl },
            previewGroup[2],
          ]}
          previewKey="file-2"
          previewFileId="file-2"
        />
      </ImagePreviewRefreshProvider>
    );

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(renderCard('https://cdn/b.jpg'));
    });
    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2').props.onError();
      await Promise.resolve();
    });

    expect(
      findByTestID(renderer, 'exception-proof-image-2').props.source,
    ).toEqual({ uri: 'https://cdn/refreshed-b.jpg' });

    await ReactTestRenderer.act(async () => {
      renderer.update(renderCard('https://cdn/parent-b.jpg'));
    });

    expect(
      findByTestID(renderer, 'exception-proof-image-2').props.source,
    ).toEqual({ uri: 'https://cdn/parent-b.jpg' });

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2').props.onError();
      await Promise.resolve();
    });

    expect(refreshPreviewUrl).toHaveBeenCalledTimes(2);
    expect(
      findByTestID(renderer, 'exception-proof-image-2').props.source,
    ).toEqual({ uri: 'https://cdn/refreshed-b-again.jpg' });
  });

  it('does not let an older source request block or overwrite a newer source', async () => {
    const olderRequest = createDeferred<string>();
    const newerRequest = createDeferred<string>();
    const refreshPreviewUrl = jest
      .fn()
      .mockImplementationOnce(() => olderRequest.promise)
      .mockImplementationOnce(() => newerRequest.promise);
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    const renderCard = (publicUrl: string) => (
      <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
        <ImageCredentialCard
          title="异常凭证 2：b.jpg"
          publicUrl={publicUrl}
          placeholderLabel="异常图片"
          metaLines={['来源：平台文件对象（已上传）']}
          imageTestID="exception-proof-image-2"
          previewGroup={[
            previewGroup[0],
            { ...previewGroup[1], publicUrl },
            previewGroup[2],
          ]}
          previewKey="file-2"
          previewFileId="file-2"
        />
      </ImagePreviewRefreshProvider>
    );

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderCard('https://cdn/older-b.jpg'),
      );
    });
    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2').props.onError();
      await Promise.resolve();
    });

    await ReactTestRenderer.act(async () => {
      renderer.update(renderCard('https://cdn/newer-b.jpg'));
    });
    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2').props.onError();
      await Promise.resolve();
    });

    expect(refreshPreviewUrl).toHaveBeenCalledTimes(2);

    await ReactTestRenderer.act(async () => {
      newerRequest.resolve('https://cdn/newer-b-renewed.jpg');
      await newerRequest.promise;
    });
    await openPreview(renderer);

    expect(
      findByTestID(renderer, 'exception-proof-image-2').props.source,
    ).toEqual({ uri: 'https://cdn/newer-b-renewed.jpg' });

    await ReactTestRenderer.act(async () => {
      olderRequest.reject(new Error('older request failed late'));
      await Promise.resolve();
    });

    expect(
      findByTestID(renderer, 'exception-proof-image-2').props.source,
    ).toEqual({ uri: 'https://cdn/newer-b-renewed.jpg' });
    expect(
      queryAllByTestID(renderer, 'exception-proof-image-2-load-status'),
    ).toHaveLength(0);
  });

  it('preserves one image failure when another group member changes', async () => {
    const refreshPreviewUrl = jest.fn().mockRejectedValue(new Error('expired'));
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    const renderCard = (firstUrl: string) => (
      <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
        <ImageCredentialCard
          title="异常凭证 2：b.jpg"
          publicUrl="https://cdn/b.jpg"
          placeholderLabel="异常图片"
          metaLines={['来源：平台文件对象（已上传）']}
          imageTestID="exception-proof-image-2"
          previewGroup={[
            { ...previewGroup[0], publicUrl: firstUrl },
            previewGroup[1],
            previewGroup[2],
          ]}
          previewKey="file-2"
          previewFileId="file-2"
        />
      </ImagePreviewRefreshProvider>
    );

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(renderCard('https://cdn/a.jpg'));
    });
    await openPreview(renderer);
    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-page-2').props.onError();
      await Promise.resolve();
    });

    expect(
      findByTestID(renderer, 'exception-proof-image-2-retry'),
    ).toBeDefined();

    await ReactTestRenderer.act(async () => {
      renderer.update(renderCard('https://cdn/a-updated.jpg'));
    });

    expect(refreshPreviewUrl).toHaveBeenCalledTimes(1);
    expect(
      findByTestID(renderer, 'exception-proof-image-2-retry'),
    ).toBeDefined();
  });

  it('shares refreshed urls and automatic attempt budgets across sibling cards', async () => {
    const refreshPreviewUrl = jest
      .fn()
      .mockResolvedValue('https://cdn/refreshed-a.jpg');
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
          <ImageCredentialCard
            title="异常凭证 1：a.jpg"
            publicUrl="https://cdn/a.jpg"
            placeholderLabel="异常图片"
            metaLines={['来源：平台文件对象（已上传）']}
            imageTestID="sibling-a"
            previewGroup={previewGroup}
            previewKey="file-1"
            previewFileId="file-1"
          />
          <ImageCredentialCard
            title="异常凭证 2：b.jpg"
            publicUrl="https://cdn/b.jpg"
            placeholderLabel="异常图片"
            metaLines={['来源：平台文件对象（已上传）']}
            imageTestID="sibling-b"
            previewGroup={previewGroup}
            previewKey="file-2"
            previewFileId="file-2"
          />
        </ImagePreviewRefreshProvider>,
      );
    });

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'sibling-a').props.onError();
      await Promise.resolve();
    });
    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'sibling-b-trigger').props.onPress();
    });

    expect(refreshPreviewUrl).toHaveBeenCalledTimes(1);
    expect(findByTestID(renderer, 'sibling-b-page-1').props.source).toEqual({
      uri: 'https://cdn/refreshed-a.jpg',
    });

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'sibling-b-page-1').props.onError();
    });

    expect(refreshPreviewUrl).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight renewal when sibling thumbnails fail together', async () => {
    const renewal = createDeferred<string>();
    const refreshPreviewUrl = jest.fn(() => renewal.promise);
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
          <ImageCredentialCard
            title="异常凭证 A"
            publicUrl="https://cdn/a.jpg"
            placeholderLabel="异常图片"
            metaLines={['来源：平台文件对象（已上传）']}
            imageTestID="concurrent-a"
            previewKey="file-1"
            previewFileId="file-1"
          />
          <ImageCredentialCard
            title="异常凭证 A 副本"
            publicUrl="https://cdn/a.jpg"
            placeholderLabel="异常图片"
            metaLines={['来源：平台文件对象（已上传）']}
            imageTestID="concurrent-a-copy"
            previewKey="file-1-copy"
            previewFileId="file-1"
          />
        </ImagePreviewRefreshProvider>,
      );
    });

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'concurrent-a').props.onError();
      findByTestID(renderer, 'concurrent-a-copy').props.onError();
      await Promise.resolve();
    });

    expect(refreshPreviewUrl).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      renewal.resolve('https://cdn/a-renewed.jpg');
      await renewal.promise;
    });

    expect(findByTestID(renderer, 'concurrent-a').props.source).toEqual({
      uri: 'https://cdn/a-renewed.jpg',
    });
    expect(findByTestID(renderer, 'concurrent-a-copy').props.source).toEqual({
      uri: 'https://cdn/a-renewed.jpg',
    });
  });

  it('clears a local failure overlay when the rendered image later loads', async () => {
    const refreshPreviewUrl = jest.fn().mockRejectedValue(new Error('expired'));
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
          <ImageCredentialCard
            title="异常凭证 2：b.jpg"
            publicUrl="https://cdn/b.jpg"
            placeholderLabel="异常图片"
            metaLines={['来源：平台文件对象（已上传）']}
            imageTestID="exception-proof-image-2"
            previewGroup={previewGroup}
            previewKey="file-2"
            previewFileId="file-2"
          />
        </ImagePreviewRefreshProvider>,
      );
    });
    await openPreview(renderer);
    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-page-2').props.onError();
      await Promise.resolve();
    });

    expect(
      findByTestID(renderer, 'exception-proof-image-2-load-status'),
    ).toBeDefined();

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-page-2').props.onLoad();
    });

    expect(
      queryAllByTestID(renderer, 'exception-proof-image-2-load-status'),
    ).toHaveLength(0);
  });

  it('proactively renews and reschedules signed urls while the card stays mounted', async () => {
    const initialNow = Date.parse('2026-07-31T08:00:00.000Z');
    jest.useFakeTimers({ now: initialNow });
    const refreshPreviewUrl = jest
      .fn()
      .mockResolvedValueOnce({
        url: 'https://cdn/b-renewed-1.jpg',
        expiresAtIso: '2026-07-31T08:01:00.000Z',
      })
      .mockResolvedValueOnce({
        url: 'https://cdn/b-renewed-2.jpg',
        expiresAtIso: '2026-07-31T08:03:00.000Z',
      })
      .mockResolvedValueOnce({
        url: 'https://cdn/b-renewed-3.jpg',
        expiresAtIso: '2026-07-31T08:05:00.000Z',
      });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
            <ImageCredentialCard
              title="异常凭证 2：b.jpg"
              publicUrl="https://cdn/b.jpg"
              placeholderLabel="异常图片"
              metaLines={['来源：平台文件对象（已上传）']}
              imageTestID="expiring-preview"
              previewKey="file-2"
              previewFileId="file-2"
            />
          </ImagePreviewRefreshProvider>,
        );
      });
      await ReactTestRenderer.act(async () => {
        findByTestID(renderer, 'expiring-preview').props.onError();
        await Promise.resolve();
      });

      expect(findByTestID(renderer, 'expiring-preview').props.source).toEqual({
        uri: 'https://cdn/b-renewed-1.jpg',
      });

      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(55_000);
        await Promise.resolve();
      });

      expect(refreshPreviewUrl).toHaveBeenCalledTimes(2);
      expect(findByTestID(renderer, 'expiring-preview').props.source).toEqual({
        uri: 'https://cdn/b-renewed-2.jpg',
      });

      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(120_000);
        await Promise.resolve();
      });

      expect(refreshPreviewUrl).toHaveBeenCalledTimes(3);
      expect(findByTestID(renderer, 'expiring-preview').props.source).toEqual({
        uri: 'https://cdn/b-renewed-3.jpg',
      });
    } finally {
      renderer?.unmount();
      jest.useRealTimers();
    }
  });

  it('proactively renews an initially hydrated signed url before it fails', async () => {
    const initialNow = Date.parse('2026-07-31T08:00:00.000Z');
    jest.useFakeTimers({ now: initialNow });
    const refreshPreviewUrl = jest.fn().mockResolvedValue({
      url: 'https://cdn/initial-renewed.jpg',
      expiresAtIso: '2026-07-31T08:03:00.000Z',
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    try {
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
            <ImageCredentialCard
              title="初始签名凭证"
              publicUrl="https://cdn/initial-signed.jpg"
              placeholderLabel="凭证"
              metaLines={['来源：平台文件对象（已上传）']}
              imageTestID="initial-expiring-preview"
              previewKey="file-initial"
              previewFileId="file-initial"
              previewExpiresAtIso="2026-07-31T08:01:00.000Z"
              previewAccess={{ kind: 'order', orderId: 'order-1' }}
            />
          </ImagePreviewRefreshProvider>,
        );
      });

      expect(refreshPreviewUrl).not.toHaveBeenCalled();

      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(55_000);
        await Promise.resolve();
      });

      expect(refreshPreviewUrl).toHaveBeenCalledTimes(1);
      expect(refreshPreviewUrl).toHaveBeenCalledWith('file-initial', {
        kind: 'order',
        orderId: 'order-1',
      });
      expect(
        findByTestID(renderer, 'initial-expiring-preview').props.source,
      ).toEqual({ uri: 'https://cdn/initial-renewed.jpg' });
    } finally {
      renderer?.unmount();
      jest.useRealTimers();
    }
  });

  it('does not schedule proactive renewal without a signed url expiration', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-07-31T08:00:00.000Z') });
    const refreshPreviewUrl = jest
      .fn()
      .mockResolvedValue('https://cdn/stable-renewed.jpg');
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    try {
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
            <ImageCredentialCard
              title="稳定预览"
              publicUrl="https://cdn/stable.jpg"
              placeholderLabel="凭证"
              metaLines={[]}
              imageTestID="stable-preview"
              previewFileId="file-stable"
            />
          </ImagePreviewRefreshProvider>,
        );
      });
      await ReactTestRenderer.act(async () => {
        findByTestID(renderer, 'stable-preview').props.onError();
        await Promise.resolve();
      });
      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(60 * 60 * 1000);
        await Promise.resolve();
      });

      expect(refreshPreviewUrl).toHaveBeenCalledTimes(1);
    } finally {
      renderer?.unmount();
      jest.useRealTimers();
    }
  });

  it('cancels proactive renewal when the card unmounts', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-07-31T08:00:00.000Z') });
    const refreshPreviewUrl = jest.fn().mockResolvedValue({
      url: 'https://cdn/expiring-renewed.jpg',
      expiresAtIso: '2026-07-31T08:01:00.000Z',
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    try {
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
            <ImageCredentialCard
              title="短期预览"
              publicUrl="https://cdn/expiring.jpg"
              placeholderLabel="凭证"
              metaLines={[]}
              imageTestID="unmounted-preview"
              previewFileId="file-expiring"
            />
          </ImagePreviewRefreshProvider>,
        );
      });
      await ReactTestRenderer.act(async () => {
        findByTestID(renderer, 'unmounted-preview').props.onError();
        await Promise.resolve();
      });
      await ReactTestRenderer.act(async () => {
        renderer.unmount();
      });
      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(55_000);
        await Promise.resolve();
      });

      expect(refreshPreviewUrl).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels a scheduled renewal when the preview identity changes', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-07-31T08:00:00.000Z') });
    const refreshPreviewUrl = jest.fn().mockResolvedValue({
      url: 'https://cdn/old-renewed.jpg',
      expiresAtIso: '2026-07-31T08:01:00.000Z',
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    const renderCard = (oldIdentity: boolean) => (
      <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
        <ImageCredentialCard
          title="身份变化预览"
          publicUrl={
            oldIdentity ? 'https://cdn/old.jpg' : 'https://cdn/new.jpg'
          }
          placeholderLabel="凭证"
          metaLines={[]}
          imageTestID="identity-preview"
          previewFileId={oldIdentity ? 'file-old' : 'file-new'}
          previewAccess={{
            kind: 'order',
            orderId: oldIdentity ? 'order-old' : 'order-new',
          }}
        />
      </ImagePreviewRefreshProvider>
    );

    try {
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(renderCard(true));
      });
      await ReactTestRenderer.act(async () => {
        findByTestID(renderer, 'identity-preview').props.onError();
        await Promise.resolve();
      });
      await ReactTestRenderer.act(async () => {
        renderer.update(renderCard(false));
      });
      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(55_000);
        await Promise.resolve();
      });

      expect(refreshPreviewUrl).toHaveBeenCalledTimes(1);
    } finally {
      renderer?.unmount();
      jest.useRealTimers();
    }
  });

  it('shares one proactive renewal across sibling cards', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-07-31T08:00:00.000Z') });
    const refreshPreviewUrl = jest
      .fn()
      .mockResolvedValueOnce({
        url: 'https://cdn/shared-renewed-1.jpg',
        expiresAtIso: '2026-07-31T08:01:00.000Z',
      })
      .mockResolvedValueOnce({
        url: 'https://cdn/shared-renewed-2.jpg',
        expiresAtIso: '2026-07-31T08:03:00.000Z',
      });
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    try {
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
            <ImageCredentialCard
              title="共享预览 A"
              publicUrl="https://cdn/shared.jpg"
              placeholderLabel="凭证"
              metaLines={[]}
              imageTestID="proactive-sibling-a"
              previewFileId="file-shared"
            />
            <ImageCredentialCard
              title="共享预览 B"
              publicUrl="https://cdn/shared.jpg"
              placeholderLabel="凭证"
              metaLines={[]}
              imageTestID="proactive-sibling-b"
              previewFileId="file-shared"
            />
          </ImagePreviewRefreshProvider>,
        );
      });
      await ReactTestRenderer.act(async () => {
        findByTestID(renderer, 'proactive-sibling-a').props.onError();
        await Promise.resolve();
      });
      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(55_000);
        await Promise.resolve();
      });

      expect(refreshPreviewUrl).toHaveBeenCalledTimes(2);
      expect(
        findByTestID(renderer, 'proactive-sibling-b').props.source,
      ).toEqual({ uri: 'https://cdn/shared-renewed-2.jpg' });
    } finally {
      renderer?.unmount();
      jest.useRealTimers();
    }
  });

  it('does not reuse an override after fileId changes under a stable key and url', async () => {
    const refreshPreviewUrl = jest
      .fn()
      .mockResolvedValueOnce('https://cdn/file-1-renewed.jpg')
      .mockResolvedValueOnce('https://cdn/file-2-renewed.jpg');
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    const renderCard = (fileId: string) => (
      <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
        <ImageCredentialCard
          title="稳定槽位凭证"
          publicUrl="https://cdn/stable-slot.jpg"
          placeholderLabel="凭证"
          metaLines={['来源：平台文件对象（已上传）']}
          imageTestID="stable-slot"
          previewGroup={[
            {
              key: 'stable-slot',
              title: '稳定槽位凭证',
              publicUrl: 'https://cdn/stable-slot.jpg',
              fileId,
            },
          ]}
          previewKey="stable-slot"
          previewFileId={fileId}
        />
      </ImagePreviewRefreshProvider>
    );

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(renderCard('file-1'));
    });
    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'stable-slot').props.onError();
      await Promise.resolve();
    });

    expect(findByTestID(renderer, 'stable-slot').props.source).toEqual({
      uri: 'https://cdn/file-1-renewed.jpg',
    });

    await ReactTestRenderer.act(async () => {
      renderer.update(renderCard('file-2'));
    });

    expect(findByTestID(renderer, 'stable-slot').props.source).toEqual({
      uri: 'https://cdn/stable-slot.jpg',
    });

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'stable-slot').props.onError();
      await Promise.resolve();
    });

    expect(refreshPreviewUrl).toHaveBeenLastCalledWith('file-2');
    expect(findByTestID(renderer, 'stable-slot').props.source).toEqual({
      uri: 'https://cdn/file-2-renewed.jpg',
    });
  });

  it('allows repeated manual retries after renewal requests keep failing', async () => {
    const refreshPreviewUrl = jest
      .fn()
      .mockRejectedValueOnce(new Error('automatic failed'))
      .mockRejectedValueOnce(new Error('manual failed'))
      .mockResolvedValueOnce('https://cdn/recovered-b.jpg');
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ImagePreviewRefreshProvider refreshPreviewUrl={refreshPreviewUrl}>
          <ImageCredentialCard
            title="异常凭证 2：b.jpg"
            publicUrl="https://cdn/b.jpg"
            placeholderLabel="异常图片"
            metaLines={['来源：平台文件对象（已上传）']}
            imageTestID="exception-proof-image-2"
            previewGroup={previewGroup}
            previewKey="file-2"
            previewFileId="file-2"
          />
        </ImagePreviewRefreshProvider>,
      );
    });
    await openPreview(renderer);
    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-page-2').props.onError();
      await Promise.resolve();
    });
    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-retry').props.onPress();
      await Promise.resolve();
    });

    expect(refreshPreviewUrl).toHaveBeenCalledTimes(2);
    expect(
      findByTestID(renderer, 'exception-proof-image-2-retry'),
    ).toBeDefined();

    await ReactTestRenderer.act(async () => {
      findByTestID(renderer, 'exception-proof-image-2-retry').props.onPress();
      await Promise.resolve();
    });

    expect(refreshPreviewUrl).toHaveBeenCalledTimes(3);
    expect(
      findByTestID(renderer, 'exception-proof-image-2').props.source,
    ).toEqual({ uri: 'https://cdn/recovered-b.jpg' });
  });
});
