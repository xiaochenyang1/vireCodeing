import {
  createDraftFieldDifferences,
  getDraftConflictFieldLabel,
  mergeMissingDraftPrefillFields,
} from '../src/utils/draftConflict';
import type { DraftOrderPrefill } from '../src/types';

test('returns no differences when local and platform drafts match', () => {
  const draft: DraftOrderPrefill = {
    weightText: '2 吨',
    pickupAddress: '沈阳',
    needTailboard: true,
    valueAddedServiceIds: ['loading-assist'],
    cargoPhotoCount: 2,
  };

  expect(createDraftFieldDifferences(draft, { ...draft })).toEqual([]);
});

test('detects string field differences and trims values', () => {
  const differences = createDraftFieldDifferences(
    { pickupAddress: ' 沈阳 ' },
    { pickupAddress: '大连' },
  );

  expect(differences).toEqual([
    {
      fieldName: 'pickupAddress',
      label: '装货地址',
      localValue: '沈阳',
      platformValue: '大连',
    },
  ]);
});

test('ignores platform string fields that are blank', () => {
  expect(
    createDraftFieldDifferences(
      { pickupAddress: '沈阳' },
      { pickupAddress: '   ' },
    ),
  ).toEqual([]);
});

test('detects boolean field differences with 是/否 labels', () => {
  expect(
    createDraftFieldDifferences(
      { needTailboard: false },
      { needTailboard: true },
    ),
  ).toEqual([
    {
      fieldName: 'needTailboard',
      label: '需要尾板',
      localValue: '否',
      platformValue: '是',
    },
  ]);
});

test('detects array field differences order-insensitively via option labels', () => {
  const differences = createDraftFieldDifferences(
    { valueAddedServiceIds: [] },
    { valueAddedServiceIds: ['loading-assist'] },
  );

  expect(differences).toHaveLength(1);
  expect(differences[0].fieldName).toBe('valueAddedServiceIds');
  expect(differences[0].localValue).toBe('未选择');
});

test('detects number field differences with units', () => {
  expect(
    createDraftFieldDifferences(
      { cargoPhotoCount: 1 },
      { cargoPhotoCount: 3 },
    ),
  ).toEqual([
    {
      fieldName: 'cargoPhotoCount',
      label: '货物图片凭证',
      localValue: '1 张',
      platformValue: '3 张',
    },
  ]);
});

test('resolves conflict field labels and falls back for unknown fields', () => {
  expect(getDraftConflictFieldLabel('pickupAddress')).toBe('装货地址');
  expect(getDraftConflictFieldLabel('needTarp')).toBe('需要篷布');
  expect(getDraftConflictFieldLabel('cargoType')).toBe('货物类型');
});

test('merges only blank local string fields from the platform draft', () => {
  const merged = mergeMissingDraftPrefillFields(
    { pickupAddress: '沈阳', deliveryAddress: '  ' },
    { pickupAddress: '大连', deliveryAddress: '长春' },
  );

  expect(merged.pickupAddress).toBe('沈阳');
  expect(merged.deliveryAddress).toBe('长春');
});

test('merges platform value-added services only when local is empty', () => {
  const merged = mergeMissingDraftPrefillFields(
    { valueAddedServiceIds: [] },
    { valueAddedServiceIds: ['loading-assist'] },
  );

  expect(merged.valueAddedServiceIds).toEqual(['loading-assist']);

  const keptLocal = mergeMissingDraftPrefillFields(
    { valueAddedServiceIds: ['insurance'] },
    { valueAddedServiceIds: ['loading-assist'] },
  );

  expect(keptLocal.valueAddedServiceIds).toEqual(['insurance']);
});
