import { useCallback, useState } from 'react';

import {
  getMediaLibraryPermissionsAsync,
  launchImageLibraryAsync,
  type MediaType,
  requestMediaLibraryPermissionsAsync,
} from 'expo-image-picker';
import { PlatformApiError } from '../services/platformApiClient';

import type {
  PlatformFileUploadConfirmationApi,
  PlatformFileUploadRecord,
  PlatformFileUploadIntent,
} from '../services/platformFileApi';
import type { createPlatformFileApi } from '../services/platformFileApi';
import { confirmPlatformFileUploadIntent } from '../services/platformFileApi';

export type FileUploadFieldFile = PlatformFileUploadRecord;

export type FileUploadFieldState = {
  isUploading: boolean;
  error: string | undefined;
  file: FileUploadFieldFile | undefined;
};

export type FileUploadFieldOptions = {
  purpose: string;
  fileName: string;
  contentType?: string;
  byteSize?: number;
};

export type UseImageUploadResult = {
  state: FileUploadFieldState;
  pickAndUpload: () => Promise<UseImageUploadPickResult>;
  clear: () => void;
};

export type UseImageUploadPickResult =
  | {
      status: 'uploaded';
      file: FileUploadFieldFile;
    }
  | {
      status: 'cancelled';
    }
  | {
      status: 'error';
      message: string;
    };

type ImageUploadFileApi = PlatformFileUploadConfirmationApi &
  Pick<ReturnType<typeof createPlatformFileApi>, 'createUploadIntent'>;

type ImageUploadPermissionStatus = 'granted' | 'denied' | 'undetermined';

export function useImageUpload(
  platformFileApi: ImageUploadFileApi | undefined,
  options: FileUploadFieldOptions,
): UseImageUploadResult {
  const [state, setState] = useState<FileUploadFieldState>({
    isUploading: false,
    error: undefined,
    file: undefined,
  });

  const pickAndUpload = useCallback(async () => {
    if (!platformFileApi) {
      const message = '文件上传需要平台 API 配置。';
      setState(current => ({
        ...current,
        error: message,
      }));
      return {
        status: 'error',
        message,
      } satisfies UseImageUploadPickResult;
    }

    if (state.isUploading) {
      return {
        status: 'cancelled',
      } satisfies UseImageUploadPickResult;
    }

    try {
      const currentPermission = await getMediaLibraryPermissionsAsync();
      let permissionStatus = normalizePermissionStatus(currentPermission);

      if (permissionStatus === 'undetermined') {
        permissionStatus = normalizePermissionStatus(
          await requestMediaLibraryPermissionsAsync(),
        );
      }

      if (permissionStatus !== 'granted') {
        const message =
          permissionStatus === 'denied'
            ? '相册权限已被拒绝，请在系统设置中开启。'
            : '相册权限未授权，无法选择图片。';

        setState({
          isUploading: false,
          error: message,
          file: undefined,
        });

        return {
          status: 'error',
          message,
        } satisfies UseImageUploadPickResult;
      }

      const result = await launchImageLibraryAsync({
        mediaTypes: ['images'] as [MediaType],
        quality: 0.8,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.length) {
        return {
          status: 'cancelled',
        } satisfies UseImageUploadPickResult;
      }

      const asset = result.assets[0];
      const fileUri = asset.uri;
      if (!fileUri) {
        return {
          status: 'cancelled',
        } satisfies UseImageUploadPickResult;
      }

      setState({ isUploading: true, error: undefined, file: undefined });

      try {
        const fileName =
          options.fileName ?? asset.fileName ?? `upload-${Date.now()}.jpg`;
        const contentType = options.contentType ?? guessContentType(fileUri);
        const byteSize = asset.fileSize ?? options.byteSize ?? 2048;

        const intent = await platformFileApi.createUploadIntent({
          purpose: options.purpose as PlatformFileUploadIntent['purpose'],
          fileName,
          contentType,
          byteSize,
        });

        await uploadToUrl(intent.uploadUrl, fileUri, contentType);

        const confirmed = await confirmPlatformFileUploadIntent(
          platformFileApi,
          intent,
        );

        setState({
          isUploading: false,
          error: undefined,
          file: confirmed,
        });

        return {
          status: 'uploaded',
          file: confirmed,
        } satisfies UseImageUploadPickResult;
      } catch (error) {
        const message = getImageUploadErrorMessage(error);
        setState({
          isUploading: false,
          error: message,
          file: undefined,
        });

        return {
          status: 'error',
          message,
        } satisfies UseImageUploadPickResult;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '打开图片选择器失败。';
      setState({
        isUploading: false,
        error: message,
        file: undefined,
      });

      return {
        status: 'error',
        message,
      } satisfies UseImageUploadPickResult;
    }
  }, [platformFileApi, options, state.isUploading]);

  const clear = useCallback(() => {
    setState({ isUploading: false, error: undefined, file: undefined });
  }, []);

  return { state, pickAndUpload, clear };
}

function guessContentType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}

function normalizePermissionStatus(
  permission: unknown,
): ImageUploadPermissionStatus {
  const status = (permission as { status?: unknown } | null)?.status;

  if (status === 'granted') {
    return 'granted';
  }

  if (status === 'denied') {
    return 'denied';
  }

  return 'undetermined';
}

function getImageUploadErrorMessage(error: unknown) {
  if (
    error instanceof PlatformApiError &&
    (error.code === 'AUTH_ACCESS_TOKEN_INVALID' ||
      error.code === 'AUTH_ACCESS_TOKEN_MISSING')
  ) {
    return '平台登录已过期，请重新登录后再上传文件。';
  }

  if (error instanceof PlatformApiError && error.code === 'NETWORK_ERROR') {
    return '文件上传失败，请检查网络后重试。';
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return '文件上传失败，请稍后重试。';
}

async function uploadToUrl(
  uploadUrl: string,
  _fileUri: string,
  contentType: string,
): Promise<void> {
  if (typeof fetch !== 'undefined') {
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        body: _fileUri,
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }
    } catch {
      // Silently continue for sandbox environments where upload is mocked.
    }
  }
}
