import {
  cargoTypeOptions,
  paymentMethodOptions,
  pricingModeOptions,
  valueAddedServiceOptions,
  vehicleLengthRequirementOptions,
  vehicleRequirementOptions,
} from '../data/mockData';
import type { DraftOrderPrefill } from '../types';

type DraftStringFieldName =
  | 'weightText'
  | 'volumeText'
  | 'quantityText'
  | 'cargoDescription'
  | 'pickupAddress'
  | 'pickupNoteText'
  | 'pickupContact'
  | 'pickupPhone'
  | 'deliveryAddress'
  | 'deliveryNoteText'
  | 'deliveryContact'
  | 'deliveryPhone'
  | 'pickupTimeText'
  | 'expectedDeliveryTimeText'
  | 'insuredValueText'
  | 'priceText';

type DraftBooleanFieldName = 'needTailboard' | 'needTarp';

type DraftEnumFieldName =
  | 'cargoType'
  | 'vehicleRequirement'
  | 'vehicleLengthRequirement'
  | 'pricingMode'
  | 'paymentMethod';

type DraftArrayFieldName = 'valueAddedServiceIds';

type DraftNumberFieldName = 'cargoPhotoCount' | 'loadingWorkerCount';

export type DraftConflictFieldName =
  | DraftStringFieldName
  | DraftBooleanFieldName
  | DraftEnumFieldName
  | DraftArrayFieldName
  | DraftNumberFieldName;

export type DraftConflictFieldDifference = {
  fieldName: DraftConflictFieldName;
  label: string;
  localValue: string;
  platformValue: string;
};

const draftStringFieldConfigs: Array<{
  fieldName: DraftStringFieldName;
  label: string;
}> = [
  { fieldName: 'weightText', label: '货物重量' },
  { fieldName: 'volumeText', label: '货物体积' },
  { fieldName: 'quantityText', label: '货物数量' },
  { fieldName: 'cargoDescription', label: '货物描述' },
  { fieldName: 'pickupAddress', label: '装货地址' },
  { fieldName: 'pickupNoteText', label: '装货备注' },
  { fieldName: 'pickupContact', label: '装货联系人' },
  { fieldName: 'pickupPhone', label: '装货联系电话' },
  { fieldName: 'deliveryAddress', label: '卸货地址' },
  { fieldName: 'deliveryNoteText', label: '卸货备注' },
  { fieldName: 'deliveryContact', label: '卸货联系人' },
  { fieldName: 'deliveryPhone', label: '卸货联系电话' },
  { fieldName: 'pickupTimeText', label: '装货时间' },
  { fieldName: 'expectedDeliveryTimeText', label: '期望送达时间' },
  { fieldName: 'insuredValueText', label: '保价货值' },
  { fieldName: 'priceText', label: '一口价金额' },
];

const draftBooleanFieldConfigs: Array<{
  fieldName: DraftBooleanFieldName;
  label: string;
}> = [
  { fieldName: 'needTailboard', label: '需要尾板' },
  { fieldName: 'needTarp', label: '需要篷布' },
];

const draftEnumFieldConfigs: Array<{
  fieldName: DraftEnumFieldName;
  label: string;
  options: Array<{ id: string; label: string }>;
}> = [
  { fieldName: 'cargoType', label: '货物类型', options: cargoTypeOptions },
  {
    fieldName: 'vehicleRequirement',
    label: '车型要求',
    options: vehicleRequirementOptions,
  },
  {
    fieldName: 'vehicleLengthRequirement',
    label: '车长要求',
    options: vehicleLengthRequirementOptions,
  },
  { fieldName: 'pricingMode', label: '计价方式', options: pricingModeOptions },
  { fieldName: 'paymentMethod', label: '支付方式', options: paymentMethodOptions },
];

const draftArrayFieldConfigs: Array<{
  fieldName: DraftArrayFieldName;
  label: string;
  options: Array<{ id: string; label: string }>;
}> = [
  {
    fieldName: 'valueAddedServiceIds',
    label: '增值服务',
    options: valueAddedServiceOptions,
  },
];

const draftNumberFieldConfigs: Array<{
  fieldName: DraftNumberFieldName;
  label: string;
  unit: string;
}> = [
  { fieldName: 'cargoPhotoCount', label: '货物图片凭证', unit: '张' },
  { fieldName: 'loadingWorkerCount', label: '装卸工人数', unit: '人' },
];

export function createDraftFieldDifferences(
  localDraft: DraftOrderPrefill,
  platformDraft: DraftOrderPrefill,
): DraftConflictFieldDifference[] {
  const stringDifferences = draftStringFieldConfigs.flatMap(fieldConfig => {
    const localValue = localDraft[fieldConfig.fieldName];
    const platformValue = platformDraft[fieldConfig.fieldName];

    if (
      typeof localValue !== 'string' ||
      typeof platformValue !== 'string' ||
      !platformValue.trim() ||
      localValue.trim() === platformValue.trim()
    ) {
      return [];
    }

    return [
      {
        ...fieldConfig,
        localValue: localValue.trim() || '空',
        platformValue: platformValue.trim(),
      },
    ];
  });

  const booleanDifferences = draftBooleanFieldConfigs.flatMap(fieldConfig => {
    const localValue = localDraft[fieldConfig.fieldName];
    const platformValue = platformDraft[fieldConfig.fieldName];

    if (
      typeof localValue !== 'boolean' ||
      typeof platformValue !== 'boolean' ||
      localValue === platformValue
    ) {
      return [];
    }

    return [
      {
        ...fieldConfig,
        localValue: formatDraftBooleanDifference(localValue),
        platformValue: formatDraftBooleanDifference(platformValue),
      },
    ];
  });

  const enumDifferences = draftEnumFieldConfigs.flatMap(fieldConfig => {
    const localValue = localDraft[fieldConfig.fieldName];
    const platformValue = platformDraft[fieldConfig.fieldName];

    if (
      typeof platformValue !== 'string' ||
      !platformValue.trim() ||
      localValue === platformValue
    ) {
      return [];
    }

    return [
      {
        fieldName: fieldConfig.fieldName,
        label: fieldConfig.label,
        localValue:
          typeof localValue === 'string'
            ? formatDraftEnumDifference(fieldConfig.options, localValue)
            : '未选择',
        platformValue: formatDraftEnumDifference(
          fieldConfig.options,
          platformValue,
        ),
      },
    ];
  });

  const arrayDifferences = draftArrayFieldConfigs.flatMap(fieldConfig => {
    const localValue = localDraft[fieldConfig.fieldName];
    const platformValue = platformDraft[fieldConfig.fieldName];

    if (!Array.isArray(platformValue)) {
      return [];
    }

    const localValues = normalizeDraftArrayValues(localValue);
    const platformValues = normalizeDraftArrayValues(platformValue);

    if (areDraftArrayValuesEqual(localValues, platformValues)) {
      return [];
    }

    return [
      {
        fieldName: fieldConfig.fieldName,
        label: fieldConfig.label,
        localValue: formatDraftArrayDifference(
          fieldConfig.options,
          localValues,
        ),
        platformValue: formatDraftArrayDifference(
          fieldConfig.options,
          platformValues,
        ),
      },
    ];
  });

  const numberDifferences = draftNumberFieldConfigs.flatMap(fieldConfig => {
    const localValue = localDraft[fieldConfig.fieldName];
    const platformValue = platformDraft[fieldConfig.fieldName];

    if (
      typeof platformValue !== 'number' ||
      !Number.isFinite(platformValue) ||
      localValue === platformValue
    ) {
      return [];
    }

    return [
      {
        fieldName: fieldConfig.fieldName,
        label: fieldConfig.label,
        localValue:
          typeof localValue === 'number' && Number.isFinite(localValue)
            ? formatDraftNumberDifference(localValue, fieldConfig.unit)
            : '未设置',
        platformValue: formatDraftNumberDifference(
          platformValue,
          fieldConfig.unit,
        ),
      },
    ];
  });

  return [
    ...stringDifferences,
    ...booleanDifferences,
    ...enumDifferences,
    ...arrayDifferences,
    ...numberDifferences,
  ];
}

export function getDraftConflictFieldLabel(fieldName: DraftConflictFieldName) {
  return (
    [
      ...draftStringFieldConfigs,
      ...draftBooleanFieldConfigs,
      ...draftEnumFieldConfigs,
      ...draftArrayFieldConfigs,
      ...draftNumberFieldConfigs,
    ].find(fieldConfig => fieldConfig.fieldName === fieldName)?.label ??
    '草稿字段'
  );
}

function formatDraftBooleanDifference(value: boolean) {
  return value ? '是' : '否';
}

function formatDraftEnumDifference(
  options: Array<{ id: string; label: string }>,
  value: string,
) {
  return options.find(option => option.id === value)?.label ?? value;
}

function normalizeDraftArrayValues(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter((item): item is string => typeof item === 'string')),
  ).sort();
}

function areDraftArrayValuesEqual(
  firstValues: string[],
  secondValues: string[],
) {
  return (
    firstValues.length === secondValues.length &&
    firstValues.every((value, index) => value === secondValues[index])
  );
}

function formatDraftArrayDifference(
  options: Array<{ id: string; label: string }>,
  values: string[],
) {
  if (!values.length) {
    return '未选择';
  }

  const optionLabels = options
    .filter(option => values.includes(option.id))
    .map(option => option.label);
  const unknownValues = values.filter(
    value => !options.some(option => option.id === value),
  );

  return [...optionLabels, ...unknownValues].join('、');
}

function formatDraftNumberDifference(value: number, unit: string) {
  return `${value} ${unit}`;
}

export function mergeMissingDraftPrefillFields(
  localDraft: DraftOrderPrefill,
  platformDraft: DraftOrderPrefill,
): DraftOrderPrefill {
  const mergedDraft: DraftOrderPrefill = { ...localDraft };

  draftStringFieldConfigs.forEach(({ fieldName }) => {
    const localValue = localDraft[fieldName];
    const platformValue = platformDraft[fieldName];

    if (
      isBlankDraftString(localValue) &&
      typeof platformValue === 'string' &&
      platformValue.trim()
    ) {
      Object.assign(mergedDraft, { [fieldName]: platformValue });
    }
  });

  if (
    !localDraft.valueAddedServiceIds?.length &&
    platformDraft.valueAddedServiceIds?.length
  ) {
    mergedDraft.valueAddedServiceIds = [...platformDraft.valueAddedServiceIds];
  }

  return mergedDraft;
}

function isBlankDraftString(value: unknown) {
  return typeof value !== 'string' || !value.trim();
}
