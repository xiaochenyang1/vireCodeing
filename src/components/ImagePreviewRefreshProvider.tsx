import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ImagePreviewAccess } from '../utils/imagePreview';

type ImagePreviewUrlRefreshResult = {
  url: string;
  expiresAtIso?: string;
};
type ImagePreviewUrlRefresher = (
  fileId: string,
  access?: ImagePreviewAccess,
) => Promise<string | ImagePreviewUrlRefreshResult>;
export type ImagePreviewRefreshRecord = {
  automaticAttempted: boolean;
  cacheExpiresAtMs: number;
  refreshedUrl?: string;
  revision: number;
};
type ImagePreviewRefreshOutcome = 'refreshed' | 'failed';
type ImagePreviewRefreshRequest = {
  fileId: string;
  sourceUrl: string;
  automatic: boolean;
  access?: ImagePreviewAccess;
};
type ImagePreviewRefreshController = {
  available: boolean;
  records: Record<string, ImagePreviewRefreshRecord>;
  refresh: (
    request: ImagePreviewRefreshRequest,
  ) => Promise<ImagePreviewRefreshOutcome>;
};
type ImagePreviewRefreshInFlight = {
  token: symbol;
  promise: Promise<ImagePreviewRefreshOutcome>;
};

const maxImagePreviewRefreshRecords = 200;
const fallbackImagePreviewRefreshTtlMs = 10 * 60 * 1000;
const failedImagePreviewRefreshTtlMs = 60 * 1000;
const imagePreviewRefreshExpirySkewMs = 5 * 1000;

const ImagePreviewRefreshContext = createContext<
  ImagePreviewRefreshController | undefined
>(undefined);

export function createImagePreviewRefreshSourceId(
  fileId: string,
  sourceUrl: string,
  access?: ImagePreviewAccess,
) {
  return JSON.stringify([
    fileId,
    sourceUrl,
    access?.kind ?? '',
    access?.orderId ?? '',
    access?.kind === 'exceptionCase' ? access.caseId : '',
  ]);
}

export function getUsableImagePreviewRefreshRecord(
  record: ImagePreviewRefreshRecord | undefined,
  now = Date.now(),
) {
  return record && record.cacheExpiresAtMs > now ? record : undefined;
}

export function useImagePreviewRefresh() {
  return useContext(ImagePreviewRefreshContext);
}

export function ImagePreviewRefreshProvider({
  refreshPreviewUrl,
  children,
}: {
  refreshPreviewUrl?: ImagePreviewUrlRefresher;
  children: ReactNode;
}) {
  const [records, setRecords] = useState<
    Record<string, ImagePreviewRefreshRecord>
  >({});
  const recordsRef = useRef(records);
  const refresherRef = useRef(refreshPreviewUrl);
  const previousRefresherRef = useRef(refreshPreviewUrl);
  const generationRef = useRef(0);
  const inFlightRef = useRef(
    new Map<string, ImagePreviewRefreshInFlight>(),
  );
  refresherRef.current = refreshPreviewUrl;

  const commitRecord = useCallback(
    (
      sourceId: string,
      update: (
        current: ImagePreviewRefreshRecord | undefined,
      ) => ImagePreviewRefreshRecord,
    ) => {
      const current = recordsRef.current[sourceId];
      const nextRecord = update(current);

      if (nextRecord === current) {
        return;
      }

      const otherRecords = { ...recordsRef.current };
      delete otherRecords[sourceId];
      const nextRecords = {
        ...otherRecords,
        [sourceId]: nextRecord,
      };
      const recordIds = Object.keys(nextRecords);

      if (recordIds.length > maxImagePreviewRefreshRecords) {
        delete nextRecords[recordIds[0]];
      }

      recordsRef.current = nextRecords;
      setRecords(nextRecords);
    },
    [],
  );

  useEffect(() => {
    if (previousRefresherRef.current === refreshPreviewUrl) {
      return;
    }

    previousRefresherRef.current = refreshPreviewUrl;
    generationRef.current += 1;
    inFlightRef.current.clear();
    recordsRef.current = {};
    setRecords({});
  }, [refreshPreviewUrl]);

  const refresh = useCallback(
    async (request: ImagePreviewRefreshRequest) => {
      const sourceId = createImagePreviewRefreshSourceId(
        request.fileId,
        request.sourceUrl,
        request.access,
      );
      const currentInFlight = inFlightRef.current.get(sourceId);

      if (currentInFlight) {
        return currentInFlight.promise;
      }

      const now = Date.now();
      const currentRecord = getUsableImagePreviewRefreshRecord(
        recordsRef.current[sourceId],
        now,
      );

      if (request.automatic && currentRecord?.automaticAttempted) {
        return 'failed';
      }

      const refresher = refresherRef.current;
      const requestGeneration = generationRef.current;
      const requestToken = Symbol(sourceId);

      commitRecord(sourceId, () => ({
        ...currentRecord,
        automaticAttempted:
          Boolean(currentRecord?.automaticAttempted) || request.automatic,
        cacheExpiresAtMs:
          currentRecord?.cacheExpiresAtMs ??
          now + failedImagePreviewRefreshTtlMs,
        revision: currentRecord?.revision ?? 0,
      }));

      const refreshPromise = (async () => {
        await Promise.resolve();

        try {
          if (!refresher) {
            throw new Error('Image preview refresh is unavailable');
          }

          const refreshed = normalizeImagePreviewUrlRefreshResult(
            request.access
              ? await refresher(request.fileId, request.access)
              : await refresher(request.fileId),
          );

          if (requestGeneration !== generationRef.current) {
            return 'failed';
          }

          commitRecord(sourceId, current => ({
            automaticAttempted:
              Boolean(current?.automaticAttempted) || request.automatic,
            ...current,
            cacheExpiresAtMs: refreshed.cacheExpiresAtMs,
            refreshedUrl: refreshed.url,
            revision: (current?.revision ?? 0) + 1,
          }));
          return 'refreshed';
        } catch {
          if (requestGeneration !== generationRef.current) {
            return 'failed';
          }

          commitRecord(sourceId, current => {
            const usableCurrent = getUsableImagePreviewRefreshRecord(current);

            return {
              ...usableCurrent,
              automaticAttempted:
                Boolean(usableCurrent?.automaticAttempted) ||
                request.automatic,
              cacheExpiresAtMs:
                usableCurrent?.cacheExpiresAtMs ??
                Date.now() + failedImagePreviewRefreshTtlMs,
              revision: usableCurrent?.revision ?? 0,
            };
          });
          return 'failed';
        } finally {
          if (inFlightRef.current.get(sourceId)?.token === requestToken) {
            inFlightRef.current.delete(sourceId);
          }
        }
      })();

      inFlightRef.current.set(sourceId, {
        token: requestToken,
        promise: refreshPromise,
      });

      return refreshPromise;
    },
    [commitRecord],
  );
  const controller = useMemo(
    () => ({ available: Boolean(refreshPreviewUrl), records, refresh }),
    [records, refresh, refreshPreviewUrl],
  );

  return (
    <ImagePreviewRefreshContext.Provider value={controller}>
      {children}
    </ImagePreviewRefreshContext.Provider>
  );
}

function normalizeImagePreviewUrlRefreshResult(
  result: string | ImagePreviewUrlRefreshResult,
) {
  const url = (typeof result === 'string' ? result : result.url).trim();

  if (!url) {
    throw new Error('Image preview refresh returned an empty URL');
  }

  return {
    url,
    cacheExpiresAtMs: resolveImagePreviewRefreshCacheExpiry(
      typeof result === 'string' ? undefined : result.expiresAtIso,
    ),
  };
}

function resolveImagePreviewRefreshCacheExpiry(expiresAtIso?: string) {
  const now = Date.now();
  const expiresAtMs = expiresAtIso ? Date.parse(expiresAtIso) : Number.NaN;

  if (!expiresAtIso) {
    return now + fallbackImagePreviewRefreshTtlMs;
  }

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
    return now + 1000;
  }

  return Math.max(now + 1000, expiresAtMs - imagePreviewRefreshExpirySkewMs);
}
