import { act } from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { useImageUpload } from '../src/hooks/useImageUpload';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: {
    Images: 'images',
  },
}));

import { launchImageLibraryAsync } from 'expo-image-picker';

function createMockFileApi() {
  return {
    createUploadIntent: jest.fn((request: {
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
    }),
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

type MockFileApi = ReturnType<typeof createMockFileApi>;

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
    (launchImageLibraryAsync as jest.Mock).mockClear();
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
    (launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/test.jpg', fileName: 'test.jpg', fileSize: 1024 }],
    });

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <CaptureHook api={undefined} />,
      );
    });

    await act(async () => {
      capturedHookState?.pickAndUpload();
    });

    expect(capturedHookState?.state.error).toBe(
      '文件上传需要平台 API 配置。',
    );
    expect(capturedHookState?.state.file).toBeUndefined();
    expect(launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('does nothing when user cancels the picker', async () => {
    (launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: true,
      assets: [],
    });

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <CaptureHook api={mockFileApi} />,
      );
    });

    await act(async () => {
      capturedHookState?.pickAndUpload();
    });

    expect(launchImageLibraryAsync).toHaveBeenCalled();
    expect(mockFileApi.createUploadIntent).not.toHaveBeenCalled();
    expect(capturedHookState?.state.isUploading).toBe(false);
  });

  it('calls createUploadIntent when an image is picked', async () => {
    (launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///tmp/test-image.jpg',
          fileName: 'test-image.jpg',
          fileSize: 2048,
        },
      ],
    });

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <CaptureHook api={mockFileApi} />,
      );
    });

    await act(async () => {
      capturedHookState?.pickAndUpload();
    });

    expect(launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    expect(mockFileApi.createUploadIntent).toHaveBeenCalled();
    expect(capturedHookState?.state.isUploading).toBe(true);
  });

  it('clears the uploaded file on clear()', async () => {
    (launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///tmp/test-image.jpg',
          fileName: 'test-image.jpg',
          fileSize: 2048,
        },
      ],
    });

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

  it('reports error when image picker fails', async () => {
    (launchImageLibraryAsync as jest.Mock).mockRejectedValue(
      new Error('Permission denied'),
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

    expect(capturedHookState?.state.error).toBe('Permission denied');
    expect(capturedHookState?.state.file).toBeUndefined();
  });
});
