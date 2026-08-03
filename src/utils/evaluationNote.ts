export type ParsedPlatformEvaluationNote = {
  rating: number;
  tags: string[];
  content: string;
  anonymous: boolean;
  photoCount?: number;
};

const versionedEvaluationMetadataPattern =
  /；\s*评价信息：(匿名|实名)\s*(?:；\s*图片凭证 (\d+) 张\s*)?；\s*评价正文：/;

export function parsePlatformEvaluationNote(
  noteText?: string,
): ParsedPlatformEvaluationNote | undefined {
  const normalizedNote = noteText?.trim();

  if (!normalizedNote) {
    return undefined;
  }

  const ratingPrefixMatch = normalizedNote.match(/^([1-5]) 星：/);

  if (!ratingPrefixMatch) {
    return undefined;
  }

  const rating = Number(ratingPrefixMatch[1]);
  const noteAfterRating = normalizedNote.slice(ratingPrefixMatch[0].length);
  const versionedMetadataMatch =
    versionedEvaluationMetadataPattern.exec(noteAfterRating);

  if (versionedMetadataMatch?.index !== undefined) {
    const tags = parseEvaluationTags(
      noteAfterRating.slice(0, versionedMetadataMatch.index),
    );
    const content = noteAfterRating
      .slice(versionedMetadataMatch.index + versionedMetadataMatch[0].length)
      .trim();

    if (!tags || !content) {
      return undefined;
    }

    const photoCount = versionedMetadataMatch[2]
      ? Number(versionedMetadataMatch[2])
      : 0;

    return {
      rating,
      tags,
      content,
      anonymous: versionedMetadataMatch[1] === '匿名',
      ...(photoCount > 0 ? { photoCount } : {}),
    };
  }

  return parseLegacyPlatformEvaluationNote(normalizedNote);
}

function parseLegacyPlatformEvaluationNote(
  noteText: string,
): ParsedPlatformEvaluationNote | undefined {
  const noteParts = noteText.split('；');
  const ratingAndTagsText = noteParts.shift()?.trim();
  const ratingMatch = ratingAndTagsText?.match(/^([1-5]) 星：(.*)$/);

  if (!ratingMatch) {
    return undefined;
  }

  const tags = parseEvaluationTags(ratingMatch[2]);

  if (!tags) {
    return undefined;
  }

  let anonymous = false;
  let photoCount = 0;

  while (noteParts.length > 0) {
    const currentPart = noteParts[0].trim();
    const photoCountMatch = currentPart.match(/^图片凭证 (\d+) 张$/);

    if (currentPart === '匿名评价') {
      anonymous = true;
      noteParts.shift();
      continue;
    }

    if (photoCountMatch) {
      photoCount = Number(photoCountMatch[1]);
      noteParts.shift();
      continue;
    }

    break;
  }

  const content = noteParts.join('；').trim();

  if (!content) {
    return undefined;
  }

  return {
    rating: Number(ratingMatch[1]),
    tags,
    content,
    anonymous,
    ...(photoCount > 0 ? { photoCount } : {}),
  };
}

function parseEvaluationTags(value: string) {
  const tags = value
    .split('、')
    .map(tag => tag.trim())
    .filter(Boolean);

  return tags.length > 0 ? tags : undefined;
}
