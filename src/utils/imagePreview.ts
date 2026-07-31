/**
 * 图片大图预览分组 helper。
 *
 * 卡片列表里的每张图片都是独立组件，但用户在大图里期望的是"这一组凭证"
 * 可以直接翻页，而不是退出去点下一张。这里把分组、定位、翻页和分页滚动
 * 偏移换算抽成纯函数，组件只负责渲染。
 */

export type ImagePreviewItem = {
  key: string;
  title: string;
  publicUrl?: string;
};

export type ImagePreviewEntry = {
  key: string;
  title: string;
  publicUrl: string;
};

/**
 * 只有已经拿到预览地址的图片才能进入大图轮播；占位项会被过滤掉，
 * 否则翻到一张空白图会让用户以为预览坏了。
 */
export function buildImagePreviewGroup(
  items: ImagePreviewItem[] | undefined,
  currentItem?: ImagePreviewItem,
): ImagePreviewEntry[] {
  const normalizedItems = items ? [...items] : [];

  if (currentItem?.publicUrl) {
    const currentIndex = normalizedItems.findIndex(
      item =>
        item.key === currentItem.key ||
        (item.publicUrl && item.publicUrl === currentItem.publicUrl),
    );

    if (currentIndex >= 0) {
      normalizedItems[currentIndex] = currentItem;
    } else {
      normalizedItems.push(currentItem);
    }
  }

  if (normalizedItems.length === 0) {
    return [];
  }

  const seenKeys = new Set<string>();

  return normalizedItems.reduce<ImagePreviewEntry[]>((entries, item) => {
    if (!item.publicUrl || seenKeys.has(item.key)) {
      return entries;
    }

    seenKeys.add(item.key);
    entries.push({
      key: item.key,
      title: item.title,
      publicUrl: item.publicUrl,
    });

    return entries;
  }, []);
}

export function getImagePreviewModalImageHeight(windowHeight: number): number {
  if (!Number.isFinite(windowHeight) || windowHeight <= 0) {
    return 320;
  }

  return Math.min(320, Math.max(72, Math.floor(windowHeight - 180)));
}

/**
 * 定位当前点开的是分组里的第几张：优先按 key 命中，其次按预览地址命中，
 * 都没命中时退回第一张，避免越界。
 */
export function resolveImagePreviewStartIndex(
  entries: ImagePreviewEntry[],
  target: { key?: string; publicUrl?: string },
): number {
  if (entries.length === 0) {
    return 0;
  }

  const keyIndex = target.key
    ? entries.findIndex(entry => entry.key === target.key)
    : -1;

  if (keyIndex >= 0) {
    return keyIndex;
  }

  const urlIndex = target.publicUrl
    ? entries.findIndex(entry => entry.publicUrl === target.publicUrl)
    : -1;

  return urlIndex >= 0 ? urlIndex : 0;
}

/**
 * 翻页不循环：到头就停在首尾，配合按钮禁用状态，用户不会误以为图片在打转。
 */
export function resolveImagePreviewStep(
  currentIndex: number,
  total: number,
  step: number,
): number {
  if (total <= 0) {
    return 0;
  }

  const safeIndex = clampPreviewIndex(currentIndex, total);

  return clampPreviewIndex(safeIndex + step, total);
}

export function clampPreviewIndex(index: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  if (!Number.isFinite(index)) {
    return 0;
  }

  return Math.min(Math.max(Math.trunc(index), 0), total - 1);
}

export function getImagePreviewCounterText(
  index: number,
  total: number,
): string {
  if (total <= 0) {
    return '';
  }

  return `${clampPreviewIndex(index, total) + 1} / ${total}`;
}

export function canGoToPreviousImagePreview(
  index: number,
  total: number,
): boolean {
  return total > 1 && clampPreviewIndex(index, total) > 0;
}

export function canGoToNextImagePreview(index: number, total: number): boolean {
  return total > 1 && clampPreviewIndex(index, total) < total - 1;
}

/**
 * 横向分页滚动结束后换算当前页；页宽还没测量出来时保持原索引，
 * 不要把 0 宽度算成第一页把用户拽回去。
 */
export function resolveImagePreviewIndexFromOffset(
  offsetX: number,
  pageWidth: number,
  total: number,
  fallbackIndex: number,
): number {
  if (!Number.isFinite(pageWidth) || pageWidth <= 0) {
    return clampPreviewIndex(fallbackIndex, total);
  }

  if (!Number.isFinite(offsetX)) {
    return clampPreviewIndex(fallbackIndex, total);
  }

  return clampPreviewIndex(Math.round(offsetX / pageWidth), total);
}
