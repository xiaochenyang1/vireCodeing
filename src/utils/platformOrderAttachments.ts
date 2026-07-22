import type { createPlatformFileApi } from '../services/platformFileApi';
import type { FileAttachmentRef, RecentOrder } from '../types';

type PlatformOrderFileMetadataApi = Partial<
  Pick<ReturnType<typeof createPlatformFileApi>, 'getFileMetadata'>
>;

function normalizeAttachmentFileId(fileId: string | undefined) {
  return fileId?.trim() ?? '';
}

function mergeFileAttachmentRef(
  primary: FileAttachmentRef | undefined,
  fallback: FileAttachmentRef | undefined,
) {
  if (!primary) {
    return fallback;
  }

  const primaryFileId = normalizeAttachmentFileId(primary.fileId);
  const fallbackFileId = normalizeAttachmentFileId(fallback?.fileId);

  if (!fallback || !primaryFileId || primaryFileId !== fallbackFileId) {
    return primary;
  }

  return {
    ...fallback,
    ...primary,
    fileId: primary.fileId || fallback.fileId,
    fileName: primary.fileName || fallback.fileName,
    objectKey: primary.objectKey || fallback.objectKey,
    publicUrl: primary.publicUrl || fallback.publicUrl,
  };
}

function mergeFileAttachmentRefs(
  primary: FileAttachmentRef[] | undefined,
  fallback: FileAttachmentRef[] | undefined,
) {
  if (!primary?.length) {
    return fallback ? [...fallback] : undefined;
  }

  if (!fallback?.length) {
    return [...primary];
  }

  const fallbackByFileId = new Map(
    fallback.map(file => [normalizeAttachmentFileId(file.fileId), file]),
  );
  const usedFallbackFileIds = new Set<string>();
  const mergedFiles = primary.map(file => {
    const fileId = normalizeAttachmentFileId(file.fileId);
    const fallbackFile = fileId ? fallbackByFileId.get(fileId) : undefined;

    if (fileId && fallbackFile) {
      usedFallbackFileIds.add(fileId);
    }

    return mergeFileAttachmentRef(file, fallbackFile) ?? file;
  });

  fallback.forEach(file => {
    const fileId = normalizeAttachmentFileId(file.fileId);

    if (fileId && usedFallbackFileIds.has(fileId)) {
      return;
    }

    mergedFiles.push(file);
  });

  return mergedFiles;
}

function mergeExceptionReport(
  primary: RecentOrder['exceptionReport'],
  fallback: RecentOrder['exceptionReport'],
) {
  if (!primary) {
    return fallback;
  }

  const photoFiles = mergeFileAttachmentRefs(primary.photoFiles, fallback?.photoFiles);

  return {
    ...(fallback ?? {}),
    ...primary,
    ...(photoFiles ? { photoFiles } : {}),
  };
}

function mergeEvaluation(
  primary: RecentOrder['evaluation'],
  fallback: RecentOrder['evaluation'],
) {
  if (!primary) {
    return fallback;
  }

  const photoFiles = mergeFileAttachmentRefs(primary.photoFiles, fallback?.photoFiles);

  return {
    ...(fallback ?? {}),
    ...primary,
    ...(photoFiles ? { photoFiles } : {}),
  };
}

async function hydrateFileAttachmentRefs(
  fileRefs: FileAttachmentRef[] | undefined,
  platformFileApi?: PlatformOrderFileMetadataApi,
) {
  if (!fileRefs?.length || !platformFileApi?.getFileMetadata) {
    return fileRefs;
  }

  const { getFileMetadata } = platformFileApi;

  const metadataCache = new Map<
    string,
    ReturnType<NonNullable<PlatformOrderFileMetadataApi['getFileMetadata']>>
  >();

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

export async function hydrateRecentOrderAttachmentRefs(
  order: RecentOrder,
  platformFileApi?: PlatformOrderFileMetadataApi,
) {
  const [cargoPhotoFiles, exceptionPhotoFiles, evaluationPhotoFiles] =
    await Promise.all([
      hydrateFileAttachmentRefs(order.cargoPhotoFiles, platformFileApi),
      hydrateFileAttachmentRefs(order.exceptionReport?.photoFiles, platformFileApi),
      hydrateFileAttachmentRefs(order.evaluation?.photoFiles, platformFileApi),
    ]);

  return {
    ...order,
    ...(order.cargoPhotoFiles || cargoPhotoFiles ? { cargoPhotoFiles } : {}),
    ...(order.exceptionReport
      ? {
          exceptionReport: {
            ...order.exceptionReport,
            ...(order.exceptionReport.photoFiles || exceptionPhotoFiles
              ? { photoFiles: exceptionPhotoFiles }
              : {}),
          },
        }
      : {}),
    ...(order.evaluation
      ? {
          evaluation: {
            ...order.evaluation,
            ...(order.evaluation.photoFiles || evaluationPhotoFiles
              ? { photoFiles: evaluationPhotoFiles }
              : {}),
          },
        }
      : {}),
  };
}

export function mergePlatformOrderWithLocalRuntimeState(
  platformOrder: RecentOrder,
  localOrder?: RecentOrder,
): RecentOrder {
  if (!localOrder) {
    return platformOrder;
  }

  return {
    ...platformOrder,
    ...(localOrder.bonusText ? { bonusText: localOrder.bonusText } : {}),
    ...(localOrder.driverInfo ? { driverInfo: localOrder.driverInfo } : {}),
    ...(localOrder.driverQuotes ? { driverQuotes: localOrder.driverQuotes } : {}),
    ...(localOrder.cargoPhotoFiles || platformOrder.cargoPhotoFiles
      ? {
          cargoPhotoFiles: mergeFileAttachmentRefs(
            localOrder.cargoPhotoFiles,
            platformOrder.cargoPhotoFiles,
          ),
        }
      : {}),
    ...(localOrder.exceptionReport || platformOrder.exceptionReport
      ? {
          exceptionReport: mergeExceptionReport(
            localOrder.exceptionReport,
            platformOrder.exceptionReport,
          ),
        }
      : {}),
    ...(localOrder.modificationRequest
      ? { modificationRequest: localOrder.modificationRequest }
      : {}),
    ...(localOrder.cancellation ? { cancellation: localOrder.cancellation } : {}),
    ...(localOrder.evaluation || platformOrder.evaluation
      ? {
          evaluation: mergeEvaluation(
            localOrder.evaluation,
            platformOrder.evaluation,
          ),
        }
      : {}),
    ...(localOrder.reorderSource
      ? { reorderSource: localOrder.reorderSource }
      : {}),
  };
}
