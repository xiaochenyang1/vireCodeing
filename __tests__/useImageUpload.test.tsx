import { act } from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { useImageUpload } from '../src/hooks/useImageUpload';

function createMockFileApi() {
  return {
    createUploadIntent: jest.fn((request) => {
      const id = `file-${Math.random().toString(36).slice(2, 8)}`;
      return Promise.resolve({
        id,
        ownerUserId: 'driver-1',
        purpose: request.purpose,
        objectKey: `uploads/${id}`,
        publicUrl: undefined,
        status: 'pending',
        createdAtIso: new Date().toISOString(),
        uploadUrl: `http://localhost:3000/files/uploads/${id}`,
        expiresAtIso: new Date(Date.now() + 3600000).toISOString(),
      });
    }),
    confirmUploaded: jest.fn((fileId: string) => {
      return Promise.resolve({
        id: fileId,
        ownerUserId: 'driver-1',
        purpose: 'identity',
        objectKey: `uploads/${fileId}`,
        publicUrl: `https://cdn.example.com/${fileId}.jpg`,
        status: 'uploaded',
        createdAtIso: new Date().toISOString(),
      });
    }),
    confirmLocalUploadTarget: jest.fn(),
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

  function CaptureHook({ api }: { api: ReturnType<typeof createMockFileApi> | undefined }) {
    capturedHookState = useImageUpload(api, options);
    return null;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    capturedHookState = null;
  });

  afterEach(() => {
    delete (window as Record<string, unknown>).prompt;
  });

  it('starts in idle state with no file', async () => {
    await act(async () => {
      ReactTestRenderer.create(<CaptureHook api={mockFileApi} />);
    });

    expect(capturedHookState?.state.isUploading).toBe(false);
    expect(capturedHookState?.state.file).toBeUndefined();
    expect(capturedHookState?.state.error).toBeUndefined();
  });

  it('reports error when platform API is not configured', async () => {
    await act(async () => {
      ReactTestRenderer.create(<CaptureHook api={undefined} />);
    });

    (window as Record<string, unknown>).prompt = jest.fn(
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
    await act(async () => {
      ReactTestRenderer.create(<CaptureHook api={mockFileApi} />);
    });

    (window as Record<string, unknown>).prompt = jest.fn(() => null);

    await act(async () => {
      capturedHookState?.pickAndUpload();
    });

    expect(mockFileApi.createUploadIntent).not.toHaveBeenCalled();
    expect(capturedHookState?.state.isUploading).toBe(false);
  });

  it('calls createUploadIntent when a file is picked', async () => {
    (window as Record<string, unknown>).prompt = jest.fn(
      () => 'file:///tmp/test-image.jpg',
    );

    await act(async () => {
      ReactTestRenderer.create(<CaptureHook api={mockFileApi} />);
    });

    await act(async () => {
      capturedHookState?.pickAndUpload();
    });

    expect(mockFileApi.createUploadIntent).toHaveBeenCalledWith(options);
    // The hook should enter uploading state immediately
    expect(capturedHookState?.state.isUploading).toBe(true);
  });

  it('clears the uploaded file on clear()', async () => {
    (window as Record<string, unknown>).prompt = jest.fn(
      () => 'file:///tmp/test-image.jpg',
    );

    await act(async () => {
      ReactTestRenderer.create(<CaptureHook api={mockFileApi} />);
    });

    capturedHookState?.clear();

    expect(capturedHookState?.state.file).toBeUndefined();
    expect(capturedHookState?.state.error).toBeUndefined();
    expect(capturedHookState?.state.isUploading).toBe(false);
  });
});
