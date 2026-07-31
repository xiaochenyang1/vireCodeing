import {
  buildImagePreviewGroup,
  canGoToNextImagePreview,
  canGoToPreviousImagePreview,
  clampPreviewIndex,
  getImagePreviewCounterText,
  getImagePreviewModalImageHeight,
  resolveImagePreviewIndexFromOffset,
  resolveImagePreviewStartIndex,
  resolveImagePreviewStep,
} from '../src/utils/imagePreview';

describe('imagePreview utils', () => {
  it('keeps only previewable images and drops duplicate keys', () => {
    const entries = buildImagePreviewGroup([
      { key: 'a', title: '凭证 A', publicUrl: 'https://cdn/a.jpg' },
      { key: 'b', title: '凭证 B' },
      { key: 'a', title: '凭证 A 重复', publicUrl: 'https://cdn/a2.jpg' },
      { key: 'c', title: '凭证 C', publicUrl: 'https://cdn/c.jpg' },
    ]);

    expect(entries.map(entry => entry.key)).toEqual(['a', 'c']);
    expect(entries[0].publicUrl).toBe('https://cdn/a.jpg');
  });

  it('keeps order access context on preview entries', () => {
    expect(
      buildImagePreviewGroup([
        {
          key: 'file-1',
          title: '订单附件',
          publicUrl: 'https://cdn/file-1.jpg',
          fileId: 'file-1',
          access: { kind: 'order', orderId: 'order-1' },
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        fileId: 'file-1',
        access: { kind: 'order', orderId: 'order-1' },
      }),
    ]);
  });

  it('returns an empty group for missing or empty input', () => {
    expect(buildImagePreviewGroup(undefined)).toEqual([]);
    expect(buildImagePreviewGroup([])).toEqual([]);
    expect(buildImagePreviewGroup([{ key: 'a', title: '仅占位' }])).toEqual([]);
  });

  it('keeps the tapped card authoritative when its group entry is stale', () => {
    const entries = buildImagePreviewGroup(
      [
        { key: 'a', title: '凭证 A', publicUrl: 'https://cdn/a.jpg' },
        { key: 'b', title: '凭证 B（旧）' },
      ],
      { key: 'b', title: '凭证 B', publicUrl: 'https://cdn/b.jpg' },
    );

    expect(entries).toEqual([
      { key: 'a', title: '凭证 A', publicUrl: 'https://cdn/a.jpg' },
      { key: 'b', title: '凭证 B', publicUrl: 'https://cdn/b.jpg' },
    ]);
  });

  it('locates the tapped image by key, then by url, then falls back', () => {
    const entries = buildImagePreviewGroup([
      { key: 'a', title: '凭证 A', publicUrl: 'https://cdn/a.jpg' },
      { key: 'b', title: '凭证 B', publicUrl: 'https://cdn/b.jpg' },
    ]);

    expect(resolveImagePreviewStartIndex(entries, { key: 'b' })).toBe(1);
    expect(
      resolveImagePreviewStartIndex(entries, {
        publicUrl: 'https://cdn/b.jpg',
      }),
    ).toBe(1);
    expect(resolveImagePreviewStartIndex(entries, { key: 'missing' })).toBe(0);
    expect(resolveImagePreviewStartIndex([], { key: 'b' })).toBe(0);
  });

  it('stops at both ends instead of wrapping around', () => {
    expect(resolveImagePreviewStep(0, 3, -1)).toBe(0);
    expect(resolveImagePreviewStep(0, 3, 1)).toBe(1);
    expect(resolveImagePreviewStep(2, 3, 1)).toBe(2);
    expect(resolveImagePreviewStep(5, 3, 1)).toBe(2);
    expect(resolveImagePreviewStep(0, 0, 1)).toBe(0);
  });

  it('clamps out-of-range and non-finite indexes', () => {
    expect(clampPreviewIndex(-4, 3)).toBe(0);
    expect(clampPreviewIndex(9, 3)).toBe(2);
    expect(clampPreviewIndex(Number.NaN, 3)).toBe(0);
    expect(clampPreviewIndex(1, 0)).toBe(0);
  });

  it('formats the counter as a one-based position', () => {
    expect(getImagePreviewCounterText(0, 3)).toBe('1 / 3');
    expect(getImagePreviewCounterText(2, 3)).toBe('3 / 3');
    expect(getImagePreviewCounterText(9, 3)).toBe('3 / 3');
    expect(getImagePreviewCounterText(0, 0)).toBe('');
  });

  it('enables step buttons only when another image exists', () => {
    expect(canGoToPreviousImagePreview(0, 3)).toBe(false);
    expect(canGoToPreviousImagePreview(1, 3)).toBe(true);
    expect(canGoToNextImagePreview(2, 3)).toBe(false);
    expect(canGoToNextImagePreview(1, 3)).toBe(true);
    expect(canGoToNextImagePreview(0, 1)).toBe(false);
  });

  it('maps paging scroll offsets to the closest page', () => {
    expect(resolveImagePreviewIndexFromOffset(0, 300, 3, 0)).toBe(0);
    expect(resolveImagePreviewIndexFromOffset(320, 300, 3, 0)).toBe(1);
    expect(resolveImagePreviewIndexFromOffset(900, 300, 3, 0)).toBe(2);
  });

  it('keeps the current index when the page width is not measured yet', () => {
    expect(resolveImagePreviewIndexFromOffset(320, 0, 3, 2)).toBe(2);
    expect(resolveImagePreviewIndexFromOffset(Number.NaN, 300, 3, 1)).toBe(1);
  });

  it('fits preview images to short windows without growing on tall screens', () => {
    expect(getImagePreviewModalImageHeight(320)).toBe(140);
    expect(getImagePreviewModalImageHeight(240)).toBe(72);
    expect(getImagePreviewModalImageHeight(844)).toBe(320);
    expect(getImagePreviewModalImageHeight(Number.NaN)).toBe(320);
  });
});
