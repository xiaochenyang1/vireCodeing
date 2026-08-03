import { evaluationRecordItems } from '../data/mockData';
import type {
  PlatformAdminEvaluationAuditRecord,
  PlatformEvaluationAppealCaseListResult,
  PlatformProfileEvaluationSnapshot,
  PlatformProfileReceivedEvaluationSnapshot,
} from '../services/platformProfileApi';
import type { createPlatformFileApi } from '../services/platformFileApi';
import type { FileAttachmentRef, RecentOrder } from '../types';
import { formatPlatformIsoMinute } from './dateTime';

export type ProfileEvaluationDirection =
  | 'shipper_to_driver'
  | 'driver_to_shipper';

export type ProfileEvaluationRecordItem = {
  id: string;
  orderId: string;
  driverName: string;
  ratingText: string;
  content: string;
  photoText: string;
  timeText: string;
  driverReplyText: string;
  driverReplyTimeText: string;
  direction: ProfileEvaluationDirection;
  photoFiles?: FileAttachmentRef[];
  platformOrderId?: string;
  platformEvaluationId?: string;
  moderationStatus?: PlatformAdminEvaluationAuditRecord['moderationStatus'];
  moderationVersion?: number;
  appealStatus?: PlatformAdminEvaluationAuditRecord['appealStatus'];
  appealReason?: string;
  appealResolutionReason?: string;
};

type ProfileEvaluationFileMetadataApi = Partial<
  Pick<
    ReturnType<typeof createPlatformFileApi>,
    'getFileMetadata' | 'getOrderAttachmentPreview'
  >
>;
type ProfileEvaluationAttachmentHydration = Pick<
  FileAttachmentRef,
  'fileId' | 'status'
> &
  Partial<
    Pick<FileAttachmentRef, 'objectKey' | 'publicUrl' | 'previewExpiresAtIso'>
  >;

export type EvaluationFilter = 'all' | 'high' | 'lower';

type SubmittedAtSortableItem = {
  submittedAtIso?: string;
  fallbackIndex: number;
};

export function filterEvaluationRecords<T extends ProfileEvaluationRecordItem>(
  records: T[],
  filter: EvaluationFilter,
) {
  return records.filter(item => {
    if (filter === 'high') {
      return item.ratingText === '5 星';
    }

    if (filter === 'lower') {
      return item.ratingText !== '5 星';
    }

    return true;
  });
}

export function createEvaluationRecords(
  orders: RecentOrder[],
): ProfileEvaluationRecordItem[] {
  const localRecords = orders
    .flatMap((order, orderIndex) => {
      const records: Array<{
        record: ProfileEvaluationRecordItem;
        submittedAtIso?: string;
        fallbackIndex: number;
      }> = [];
      const evaluationPhotoCount =
        order.evaluation?.photoCount ??
        order.evaluation?.photoFiles?.length ??
        0;
      const shipperEvaluationPhotoCount =
        order.shipperEvaluation?.photoCount ??
        order.shipperEvaluation?.photoFiles?.length ??
        0;

      if (order.evaluation) {
        records.push({
          record: {
            id: `evaluation-local-${order.id}`,
            orderId: order.id,
            driverName: order.evaluation.anonymous
              ? '匿名评价'
              : order.driverInfo?.driverName ?? '未知司机',
            ratingText: `${order.evaluation.rating} 星`,
            content: order.evaluation.content,
            photoText:
              evaluationPhotoCount > 0
                ? `图片凭证 ${evaluationPhotoCount} 张`
                : '',
            timeText: order.evaluation.submittedAtText ?? '刚刚提交',
            driverReplyText: '',
            driverReplyTimeText: '',
            direction: 'shipper_to_driver',
            ...(order.platformOrderId
              ? { platformOrderId: order.platformOrderId }
              : {}),
            ...(order.evaluation.photoFiles?.length
              ? { photoFiles: order.evaluation.photoFiles }
              : {}),
          },
          submittedAtIso:
            order.evaluation.submittedAtIso ??
            order.updatedAtIso ??
            order.createdAtIso,
          fallbackIndex: orderIndex * 2,
        });
      }

      if (order.shipperEvaluation) {
        records.push({
          record: {
            id: `received-evaluation-local-${order.id}`,
            orderId: order.id,
            driverName: order.shipperEvaluation.anonymous
              ? '匿名司机评价'
              : order.driverInfo?.driverName ?? '未知司机',
            ratingText: `${order.shipperEvaluation.rating} 星`,
            content: order.shipperEvaluation.content,
            photoText:
              shipperEvaluationPhotoCount > 0
                ? `图片凭证 ${shipperEvaluationPhotoCount} 张`
                : '',
            timeText: order.shipperEvaluation.submittedAtText
              ? `司机评价：${order.shipperEvaluation.submittedAtText}`
              : '司机评价：刚刚提交',
            driverReplyText: '',
            driverReplyTimeText: '',
            direction: 'driver_to_shipper',
            ...(order.platformOrderId
              ? { platformOrderId: order.platformOrderId }
              : {}),
            ...(order.shipperEvaluation.photoFiles?.length
              ? { photoFiles: order.shipperEvaluation.photoFiles }
              : {}),
          },
          submittedAtIso:
            order.shipperEvaluation.submittedAtIso ??
            order.updatedAtIso ??
            order.createdAtIso,
          fallbackIndex: orderIndex * 2 + 1,
        });
      }

      return records;
    })
    .sort(compareSubmittedAtSortableItemsDesc)
    .map(item => item.record);

  return [...localRecords, ...evaluationRecordItems];
}

export function createLocalEvaluationRecordsFromPlatformSnapshot(
  snapshot: PlatformProfileEvaluationSnapshot,
): ProfileEvaluationRecordItem[] {
  return sortPlatformEvaluationItemsBySubmittedAt(snapshot.items).map(item =>
    createPlatformEvaluationRecord(item),
  );
}

export function createLocalReceivedEvaluationRecordsFromPlatformSnapshot(
  snapshot: PlatformProfileReceivedEvaluationSnapshot,
): ProfileEvaluationRecordItem[] {
  return sortPlatformEvaluationItemsBySubmittedAt(snapshot.items).map(item =>
    createPlatformReceivedEvaluationRecord(item),
  );
}

export function createLocalEvaluationRecordsFromPlatformSnapshots(
  evaluationSnapshot: PlatformProfileEvaluationSnapshot,
  receivedEvaluationSnapshot: PlatformProfileReceivedEvaluationSnapshot,
): ProfileEvaluationRecordItem[] {
  return [
    ...evaluationSnapshot.items.map((item, index) => ({
      item,
      direction: 'shipper_to_driver' as const,
      submittedAtIso: item.submittedAtIso,
      fallbackIndex: index,
    })),
    ...receivedEvaluationSnapshot.items.map((item, index) => ({
      item,
      direction: 'driver_to_shipper' as const,
      submittedAtIso: item.submittedAtIso,
      fallbackIndex: evaluationSnapshot.items.length + index,
    })),
  ]
    .sort(compareSubmittedAtSortableItemsDesc)
    .map(entry =>
      entry.direction === 'shipper_to_driver'
        ? createPlatformEvaluationRecord(entry.item)
        : createPlatformReceivedEvaluationRecord(entry.item),
    );
}

export function mergeEvaluationAppealCases(
  records: ProfileEvaluationRecordItem[],
  appealCases: PlatformEvaluationAppealCaseListResult,
) {
  const appealCaseById = new Map(appealCases.items.map(item => [item.id, item]));
  const mergedEvaluationIds = new Set<string>();
  const mergedRecords = records.map(record => {
    if (!record.platformEvaluationId) {
      return record;
    }
    const appealCase = appealCaseById.get(record.platformEvaluationId);
    if (!appealCase) {
      return record;
    }
    mergedEvaluationIds.add(appealCase.id);
    return applyEvaluationAppealCase(record, appealCase);
  });

  const hiddenOrHistoricalRecords = appealCases.items
    .filter(item => !mergedEvaluationIds.has(item.id))
    .map(createEvaluationAppealCaseRecord);

  return [...hiddenOrHistoricalRecords, ...mergedRecords];
}

export function getEvaluationAppealStatusText(
  status: NonNullable<ProfileEvaluationRecordItem['appealStatus']>,
) {
  switch (status) {
    case 'requested':
      return '申诉处理中';
    case 'accepted':
      return '申诉已通过';
    case 'rejected':
      return '申诉已驳回';
    case 'none':
    default:
      return '未申诉';
  }
}

export function canSubmitEvaluationAppeal(
  record: ProfileEvaluationRecordItem,
) {
  if (!record.platformEvaluationId) {
    return false;
  }

  if (record.moderationStatus !== 'hidden') {
    return false;
  }

  if (
    typeof record.moderationVersion !== 'number' ||
    !Number.isInteger(record.moderationVersion) ||
    record.moderationVersion < 1
  ) {
    return false;
  }

  const appealStatus = record.appealStatus ?? 'none';
  return appealStatus === 'none' || appealStatus === 'rejected';
}

export function applySubmittedEvaluationAppeal(
  record: ProfileEvaluationRecordItem,
  appeal: {
    reason: string;
    moderationVersion: number;
  },
): ProfileEvaluationRecordItem {
  return {
    ...record,
    moderationStatus: 'hidden',
    moderationVersion: appeal.moderationVersion,
    appealStatus: 'requested',
    appealReason: appeal.reason,
    appealResolutionReason: undefined,
  };
}

export async function hydrateProfileEvaluationRecords(
  records: ProfileEvaluationRecordItem[],
  platformFileApi?: ProfileEvaluationFileMetadataApi,
) {
  if (
    !platformFileApi?.getFileMetadata &&
    !platformFileApi?.getOrderAttachmentPreview
  ) {
    return records;
  }

  const metadataCache = new Map<
    string,
    Promise<ProfileEvaluationAttachmentHydration | undefined>
  >();

  return Promise.all(
    records.map(async record => {
      const photoFiles = await hydrateProfileEvaluationAttachmentRefs(
        record.photoFiles,
        platformFileApi,
        metadataCache,
        record.platformOrderId,
      );

      return photoFiles?.length
        ? {
            ...record,
            photoFiles,
          }
        : record;
    }),
  );
}

function formatIsoMinute(isoText: string) {
  return formatPlatformIsoMinute(isoText);
}

function compareSubmittedAtSortableItemsDesc(
  left: SubmittedAtSortableItem,
  right: SubmittedAtSortableItem,
) {
  if (left.submittedAtIso && right.submittedAtIso) {
    const submittedAtCompare = right.submittedAtIso.localeCompare(
      left.submittedAtIso,
    );

    if (submittedAtCompare !== 0) {
      return submittedAtCompare;
    }
  } else if (left.submittedAtIso) {
    return -1;
  } else if (right.submittedAtIso) {
    return 1;
  }

  return left.fallbackIndex - right.fallbackIndex;
}

function sortPlatformEvaluationItemsBySubmittedAt<
  T extends {
    submittedAtIso?: string;
  },
>(items: T[]) {
  return items
    .map((item, index) => ({
      item,
      submittedAtIso: item.submittedAtIso,
      fallbackIndex: index,
    }))
    .sort(compareSubmittedAtSortableItemsDesc)
    .map(entry => entry.item);
}

function createPlatformEvaluationRecord(
  item: PlatformProfileEvaluationSnapshot['items'][number],
): ProfileEvaluationRecordItem {
  const photoFiles = createProfileEvaluationAttachmentRefs(
    item.photoFileIds,
    '评价图片凭证',
  );

  return {
    id: `evaluation-platform-${item.id}`,
    orderId: item.orderNo,
    driverName: item.anonymous ? '匿名评价' : item.driverName,
    ratingText: `${item.rating} 星`,
    content: item.content,
    photoText: item.photoCount > 0 ? `图片凭证 ${item.photoCount} 张` : '',
    timeText: `平台提交：${formatIsoMinute(item.submittedAtIso)}`,
    driverReplyText: item.driverReplyText ?? '',
    driverReplyTimeText: item.driverReplyAtIso
      ? formatIsoMinute(item.driverReplyAtIso)
      : '',
    direction: 'shipper_to_driver',
    platformOrderId: item.orderId,
    platformEvaluationId: item.id,
    ...(photoFiles.length > 0 ? { photoFiles } : {}),
  };
}

function applyEvaluationAppealCase(
  record: ProfileEvaluationRecordItem,
  appealCase: PlatformAdminEvaluationAuditRecord,
): ProfileEvaluationRecordItem {
  return {
    ...record,
    moderationStatus: appealCase.moderationStatus,
    moderationVersion: appealCase.moderationVersion,
    appealStatus: appealCase.appealStatus,
    ...(appealCase.latestAppeal?.reason
      ? { appealReason: appealCase.latestAppeal.reason }
      : {}),
    ...(appealCase.latestAppeal?.resolutionReason
      ? { appealResolutionReason: appealCase.latestAppeal.resolutionReason }
      : {}),
  };
}

function createEvaluationAppealCaseRecord(
  appealCase: PlatformAdminEvaluationAuditRecord,
): ProfileEvaluationRecordItem {
  return applyEvaluationAppealCase(
    {
      id: `evaluation-appeal-${appealCase.id}`,
      orderId: appealCase.orderNo,
      driverName: appealCase.anonymous
        ? '匿名评价'
        : appealCase.revieweeName,
      ratingText: `${appealCase.rating} 星`,
      content: appealCase.content,
      photoText:
        appealCase.photoCount > 0
          ? `图片凭证 ${appealCase.photoCount} 张`
          : '',
      timeText: `平台提交：${formatIsoMinute(appealCase.submittedAtIso)}`,
      driverReplyText: '',
      driverReplyTimeText: '',
      direction: appealCase.direction,
      platformOrderId: appealCase.orderId,
      platformEvaluationId: appealCase.id,
      ...(createProfileEvaluationAttachmentRefs(
        appealCase.photoFileIds,
        '评价图片凭证',
      ).length
        ? {
            photoFiles: createProfileEvaluationAttachmentRefs(
              appealCase.photoFileIds,
              '评价图片凭证',
            ),
          }
        : {}),
    },
    appealCase,
  );
}

function createPlatformReceivedEvaluationRecord(
  item: PlatformProfileReceivedEvaluationSnapshot['items'][number],
): ProfileEvaluationRecordItem {
  const photoFiles = createProfileEvaluationAttachmentRefs(
    item.photoFileIds,
    '司机评价图片凭证',
  );

  return {
    id: `received-evaluation-platform-${item.id}`,
    orderId: item.orderNo,
    driverName: item.anonymous ? '匿名司机评价' : item.driverName,
    ratingText: `${item.rating} 星`,
    content: item.content,
    photoText: item.photoCount > 0 ? `图片凭证 ${item.photoCount} 张` : '',
    timeText: `司机评价：${formatIsoMinute(item.submittedAtIso)}`,
    driverReplyText: '',
    driverReplyTimeText: '',
    direction: 'driver_to_shipper',
    platformOrderId: item.orderId,
    ...(photoFiles.length > 0 ? { photoFiles } : {}),
  };
}

function createProfileEvaluationAttachmentRefs(
  attachmentFileIds: string[] | undefined,
  fileNamePrefix: string,
) {
  return (attachmentFileIds ?? [])
    .map(fileId => fileId.trim())
    .filter(Boolean)
    .map((fileId, index) => ({
      fileId,
      fileName: `${fileNamePrefix} ${index + 1}`,
      purpose: 'evaluation' as const,
      status: 'uploaded' as const,
    }));
}

function normalizeAttachmentFileId(fileId: string | undefined) {
  return fileId?.trim() ?? '';
}

async function hydrateProfileEvaluationAttachmentRefs(
  fileRefs: FileAttachmentRef[] | undefined,
  platformFileApi: ProfileEvaluationFileMetadataApi,
  metadataCache: Map<
    string,
    Promise<ProfileEvaluationAttachmentHydration | undefined>
  >,
  platformOrderId?: string,
) {
  if (!fileRefs?.length) {
    return fileRefs;
  }

  return Promise.all(
    fileRefs.map(async fileRef => {
      const fileId = normalizeAttachmentFileId(fileRef.fileId);

      if (!fileId || (fileRef.publicUrl && fileRef.previewExpiresAtIso)) {
        return fileRef;
      }

      const cacheKey = JSON.stringify([platformOrderId ?? '', fileId]);
      let metadataPromise = metadataCache.get(cacheKey);

      if (!metadataPromise) {
        metadataPromise = hydrateProfileEvaluationAttachmentRef(
          fileId,
          platformFileApi,
          platformOrderId,
        );
        metadataCache.set(cacheKey, metadataPromise);
      }

      const metadata = await metadataPromise;

      return metadata ? { ...fileRef, ...metadata } : fileRef;
    }),
  );
}

async function hydrateProfileEvaluationAttachmentRef(
  fileId: string,
  platformFileApi: ProfileEvaluationFileMetadataApi,
  platformOrderId?: string,
): Promise<ProfileEvaluationAttachmentHydration | undefined> {
  if (platformOrderId && platformFileApi.getOrderAttachmentPreview) {
    try {
      const preview = await platformFileApi.getOrderAttachmentPreview(
        platformOrderId,
        fileId,
      );

      return {
        fileId: preview.fileId,
        status: 'uploaded',
        publicUrl: preview.previewUrl,
        previewExpiresAtIso: preview.previewExpiresAtIso,
      };
    } catch {
      // Authored legacy evaluations may still be recoverable through ownership.
    }
  }

  if (!platformFileApi.getFileMetadata) {
    return undefined;
  }

  try {
    const metadata = await platformFileApi.getFileMetadata(fileId);

    return {
      fileId: metadata.id,
      status: metadata.status,
      ...(metadata.objectKey ? { objectKey: metadata.objectKey } : {}),
      ...(metadata.publicUrl ? { publicUrl: metadata.publicUrl } : {}),
      ...(metadata.previewExpiresAtIso
        ? { previewExpiresAtIso: metadata.previewExpiresAtIso }
        : {}),
    };
  } catch {
    return undefined;
  }
}
