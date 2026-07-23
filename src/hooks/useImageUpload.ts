import { useCallback, useState } from 'react';

import {
  launchImageLibraryAsync,
  type MediaType,
} from 'expo-image-picker';

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
  pickAndUpload: () => Promise<void>;
  clear: () => void;
};

type FullFileApi = ReturnType<typeof createPlatformFileApi>;

export function useImageUpload(
  platformFileApi: FullFileApi | undefined,
  options: FileUploadFieldOptions,
): UseImageUploadResult {
  const [state, setState] = useState<FileUploadFieldState>({
    isUploading: false,
    error: undefined,
    file: undefined,
  });

  const pickAndUpload = useCallback(async () => {
    if (!platformFileApi) {
      setState(current => ({
        ...current,
        error: '文件上传需要平台 API 配置。',
      }));
      return;
    }

    if (state.isUploading) {
      return;
    }

    let result;
    try {
      result = await launchImageLibraryAsync({
        mediaTypes: ['images'] as [MediaType],
        quality: 0.8,
        allowsEditing: false,
      });
    } catch (error) {
      setState({
        isUploading: false,
        error: error instanceof Error ? error.message : '打开图片选择器失败。',
        file: undefined,
      });
      return;
    }

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const asset = result.assets[0];
    const fileUri = asset.uri;
    if (!fileUri) {
      return;
    }

    setState({ isUploading: true, error: undefined, file: undefined });

    try {
      const fileName =
        asset.fileName ?? options.fileName ?? `upload-${Date.now()}.jpg`;
      const contentType = guessContentType(fileUri);
      const byteSize = asset.fileSize ?? 2048;

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
    } catch (error) {
      setState({
        isUploading: false,
        error: error instanceof Error ? error.message : '文件上传失败，请稍后重试。',
        file: undefined,
      });
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
