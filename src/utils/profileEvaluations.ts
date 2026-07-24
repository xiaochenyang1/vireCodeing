import { evaluationRecordItems } from '../data/mockData';
import type {
  PlatformProfileEvaluationSnapshot,
  PlatformProfileReceivedEvaluationSnapshot,
} from '../services/platformProfileApi';
import type { createPlatformFileApi } from '../services/platformFileApi';
import type { FileAttachmentRef, RecentOrder } from '../types';

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
};

type ProfileEvaluationFileMetadataApi = Partial<
  Pick<ReturnType<typeof createPlatformFileApi>, 'getFileMetadata'>
>;

export type EvaluationFilter = 'all' | 'high' | 'lower';

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
  const localRecords = orders.flatMap(order => {
    const records: ProfileEvaluationRecordItem[] = [];
    const evaluationPhotoCount =
      order.evaluation?.photoCount ?? order.evaluation?.photoFiles?.length ?? 0;
    const shipperEvaluationPhotoCount =
      order.shipperEvaluation?.photoCount ??
      order.shipperEvaluation?.photoFiles?.length ??
      0;

    if (order.evaluation) {
      records.push({
        id: `evaluation-local-${order.id}`,
        orderId: order.id,
        driverName: order.evaluation.anonymous
          ? '匿名评价'
          : order.driverInfo?.driverName ?? '未知司机',
        ratingText: `${order.evaluation.rating} 星`,
        content: order.evaluation.content,
        photoText:
          evaluationPhotoCount > 0 ? `图片凭证 ${evaluationPhotoCount} 张` : '',
        timeText: '刚刚提交',
        driverReplyText: '',
        driverReplyTimeText: '',
        direction: 'shipper_to_driver',
        ...(order.evaluation.photoFiles?.length
          ? { photoFiles: order.evaluation.photoFiles }
          : {}),
      });
    }

    if (order.shipperEvaluation) {
      records.push({
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
        timeText: '司机评价：刚刚提交',
        driverReplyText: '',
        driverReplyTimeText: '',
        direction: 'driver_to_shipper',
        ...(order.shipperEvaluation.photoFiles?.length
          ? { photoFiles: order.shipperEvaluation.photoFiles }
          : {}),
      });
    }

    return records;
  });

  return [...localRecords, ...evaluationRecordItems];
}

export function createLocalEvaluationRecordsFromPlatformSnapshot(
  snapshot: PlatformProfileEvaluationSnapshot,
): ProfileEvaluationRecordItem[] {
  return snapshot.items.map(item => {
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
      photoText:
        item.photoCount > 0 ? `图片凭证 ${item.photoCount} 张` : '',
      timeText: `平台提交：${formatIsoMinute(item.submittedAtIso)}`,
      driverReplyText: item.driverReplyText ?? '',
      driverReplyTimeText: item.driverReplyAtIso
        ? formatIsoMinute(item.driverReplyAtIso)
        : '',
      direction: 'shipper_to_driver',
      ...(photoFiles.length > 0 ? { photoFiles } : {}),
    };
  });
}

export function createLocalReceivedEvaluationRecordsFromPlatformSnapshot(
  snapshot: PlatformProfileReceivedEvaluationSnapshot,
): ProfileEvaluationRecordItem[] {
  return snapshot.items.map(item => {
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
      photoText:
        item.photoCount > 0 ? `图片凭证 ${item.photoCount} 张` : '',
      timeText: `司机评价：${formatIsoMinute(item.submittedAtIso)}`,
      driverReplyText: '',
      driverReplyTimeText: '',
      direction: 'driver_to_shipper',
      ...(photoFiles.length > 0 ? { photoFiles } : {}),
    };
  });
}

export async function hydrateProfileEvaluationRecords(
  records: ProfileEvaluationRecordItem[],
  platformFileApi?: ProfileEvaluationFileMetadataApi,
) {
  if (!platformFileApi?.getFileMetadata) {
    return records;
  }

  const metadataCache = new Map<
    string,
    ReturnType<NonNullable<ProfileEvaluationFileMetadataApi['getFileMetadata']>>
  >();

  return Promise.all(
    records.map(async record => {
      const photoFiles = await hydrateProfileEvaluationAttachmentRefs(
        record.photoFiles,
        platformFileApi,
        metadataCache,
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
  return isoText.slice(0, 16).replace('T', ' ');
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
    ReturnType<NonNullable<ProfileEvaluationFileMetadataApi['getFileMetadata']>>
  >,
) {
  if (!fileRefs?.length || !platformFileApi.getFileMetadata) {
    return fileRefs;
  }

  const { getFileMetadata } = platformFileApi;

  return Promise.all(
    fileRefs.map(async fileRef => {
      const fileId = normalizeAttachmentFileId(fileRef.fileId);

      if (!fileId || fileRef.publicUrl) {
        return fileRef;
      }

      let metadataPromise = metadataCache.get(fileId);

      if (!metadataPromise) {
        metadataPromise = getFileMetadata(fileId);
        metadataCache.set(fileId, metadataPromise);
      }

      try {
        const metadata = await metadataPromise;

        return {
          ...fileRef,
          fileId: metadata.id,
          status: metadata.status,
          ...(metadata.objectKey ? { objectKey: metadata.objectKey } : {}),
          ...(metadata.publicUrl ? { publicUrl: metadata.publicUrl } : {}),
        };
      } catch {
        return fileRef;
      }
    }),
  );
}
