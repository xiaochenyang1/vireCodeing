/// <reference lib="dom" />

import { act } from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { useImageUpload } from '../src/hooks/useImageUpload';

type MockFileApi = ReturnType<typeof createMockFileApi>;

function createMockFileApi() {
  const mockCreateUploadIntent = jest.fn((request: {
    purpose: string;
    fileName: string;
    contentType: string;
    byteSize: number;
  }) => {
    const id = `file-${Math.random().toString(36).slice(2, 8)}`;
    return Promise.resolve({
      id,
      ownerUserId: 'driver-1',
      purpose: request.purpose as 'identity',
      objectKey: `uploads/${id}`,
      publicUrl: undefined,
      status: 'pending' as const,
      createdAtIso: new Date().toISOString(),
      uploadUrl: `http://localhost:3000/files/uploads/${id}`,
      expiresAtIso: new Date(Date.now() + 3600000).toISOString(),
    });
  });

  return {
    createUploadIntent: mockCreateUploadIntent,
    confirmUploaded: jest.fn((fileId: string) => {
      return Promise.resolve({
        id: fileId,
        ownerUserId: 'driver-1',
        purpose: 'identity' as const,
        objectKey: `uploads/${fileId}`,
        publicUrl: `https://cdn.example.com/${fileId}.jpg`,
        status: 'uploaded' as const,
        createdAtIso: new Date().toISOString(),
      });
    }),
    confirmLocalUploadTarget: jest.fn(),
    getFileMetadata: jest.fn(),
    getPreviewMetadata: jest.fn(),
  };
}

describe('useImageUpload', () => {
  const mockFileApi = createMockFileApi();
  const options = {
    purpose: 'identity',
    fileName: 'test-id-card.jpg',
    contentType: 'image/jpeg',
    byteSize: 2048,
  };

  let capturedHookState: ReturnType<typeof useImageUpload> | null = null;

  function CaptureHook({ api }: { api: MockFileApi | undefined }) {
    capturedHookState = useImageUpload(api, options);
    return null;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    capturedHookState = null;
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).prompt;
  });

  it('starts in idle state with no file', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <CaptureHook api={mockFileApi} />,
      );
    });

    expect(capturedHookState?.state.isUploading).toBe(false);
    expect(capturedHookState?.state.file).toBeUndefined();
    expect(capturedHookState?.state.error).toBeUndefined();
  });

  it('reports error when platform API is not configured', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <CaptureHook api={undefined} />,
      );
    });

    (window as unknown as Record<string, unknown>).prompt = jest.fn(
      () => 'file:///tmp/test-image.jpg',
    );

    await act(async () => {
      capturedHookState?.pickAndUpload();
    });

    expect(capturedHookState?.state.error).toBe(
      '文件上传需要平台 API 配置。',
    );
    expect(capturedHookState?.state.file).toBeUndefined();
  });

  it('does nothing when user cancels the picker', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <CaptureHook api={mockFileApi} />,
      );
    });

    (window as unknown as Record<string, unknown>).prompt = jest.fn(() => null);

    await act(async () => {
      capturedHookState?.pickAndUpload();
    });

    expect(mockFileApi.createUploadIntent).not.toHaveBeenCalled();
    expect(capturedHookState?.state.isUploading).toBe(false);
  });

  it('calls createUploadIntent when a file is picked', async () => {
    (window as unknown as Record<string, unknown>).prompt = jest.fn(
      () => 'file:///tmp/test-image.jpg',
    );

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <CaptureHook api={mockFileApi} />,
      );
    });

    await act(async () => {
      capturedHookState?.pickAndUpload();
    });

    expect(mockFileApi.createUploadIntent).toHaveBeenCalledWith(options);
    expect(capturedHookState?.state.isUploading).toBe(true);
  });

  it('clears the uploaded file on clear()', async () => {
    (window as unknown as Record<string, unknown>).prompt = jest.fn(
      () => 'file:///tmp/test-image.jpg',
    );

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <CaptureHook api={mockFileApi} />,
      );
    });

    capturedHookState?.clear();

    expect(capturedHookState?.state.file).toBeUndefined();
    expect(capturedHookState?.state.error).toBeUndefined();
    expect(capturedHookState?.state.isUploading).toBe(false);
  });
});
