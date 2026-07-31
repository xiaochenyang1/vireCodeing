import { PlatformApiError } from '../src/services/platformApiClient';
import {
  confirmPlatformFileUploadIntent,
  createPlatformFileApi,
  refreshPlatformFilePreviewUrl,
} from '../src/services/platformFileApi';

describe('platform file api', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('creates a file upload intent with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'file-1',
          ownerUserId: 'user-1',
          purpose: 'identity',
          objectKey: 'user-1/identity/file-1.png',
          status: 'pending',
          uploadUrl: 'http://localhost:3000/api/files/uploads/file-1',
          publicUrl: 'https://cdn.example.com/user-1/identity/file-1.png',
          expiresAtIso: '2026-07-06T03:15:00.000Z',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-06T03:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.createUploadIntent({
        purpose: 'identity',
        fileName: ' 身份证正面.png ',
        contentType: ' Image/PNG ',
        byteSize: 2048,
      }),
    ).resolves.toMatchObject({
      id: 'file-1',
      status: 'pending',
      uploadUrl: 'http://localhost:3000/api/files/uploads/file-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/files/upload-intents',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          purpose: 'identity',
          fileName: '身份证正面.png',
          contentType: 'image/png',
          byteSize: 2048,
        }),
      }),
    );
  });

  it('confirms a file upload with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'file-1',
          ownerUserId: 'user-1',
          purpose: 'cargo',
          objectKey: 'user-1/cargo/file-1.jpg',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/user-1/cargo/file-1.jpg',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-06T03:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.confirmUploaded(' file-1 ', {
        publicUrl: ' https://cdn.example.com/user-1/cargo/file-1.jpg ',
      }),
    ).resolves.toMatchObject({
      id: 'file-1',
      status: 'uploaded',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/files/file-1/uploaded',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          publicUrl: 'https://cdn.example.com/user-1/cargo/file-1.jpg',
        }),
      }),
    );
  });

  it('gets file metadata by id with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'file-1',
          ownerUserId: 'user-1',
          purpose: 'exception',
          objectKey: 'user-1/exception/file-1.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/user-1/exception/file-1.png',
          previewUrl:
            '/api/files/preview-contents/user-1/exception/file-1.png?signature=fresh',
          previewExpiresAtIso: '2026-07-06T03:10:00.000Z',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        },
        requestId: 'req-file-metadata',
        timestamp: '2026-07-06T03:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
      getRequestId: () => 'req-file-metadata',
    });

    await expect(api.getFileMetadata(' file-1 ')).resolves.toMatchObject({
      id: 'file-1',
      purpose: 'exception',
      status: 'uploaded',
      publicUrl:
        'http://localhost:3000/api/files/preview-contents/user-1/exception/file-1.png?signature=fresh',
      previewUrl:
        'http://localhost:3000/api/files/preview-contents/user-1/exception/file-1.png?signature=fresh',
      previewExpiresAtIso: '2026-07-06T03:10:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/files/file-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'x-request-id': 'req-file-metadata',
        }),
      }),
    );
  });

  it('confirms a local upload target URL with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'file-1',
          ownerUserId: 'user-1',
          purpose: 'cargo',
          objectKey: 'user-1/cargo/file-1.jpg',
          status: 'uploaded',
          publicUrl: 'http://localhost:3000/api/files/previews/user-1/cargo/file-1.jpg',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        },
        requestId: 'req-local-upload',
        timestamp: '2026-07-06T03:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
      getRequestId: () => 'req-local-upload',
    });

    await expect(
      api.confirmLocalUploadTarget(
        ' http://localhost:3000/api/files/uploads/file-1 ',
      ),
    ).resolves.toMatchObject({
      id: 'file-1',
      status: 'uploaded',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/files/uploads/file-1',
      expect.objectContaining({
        method: 'POST',
        body: undefined,
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'x-request-id': 'req-local-upload',
        }),
      }),
    );
  });

  it('returns a renewed signed preview url from file metadata', async () => {
    const getFileMetadata = jest.fn().mockResolvedValue({
      id: 'file-1',
      ownerUserId: 'user-1',
      purpose: 'cargo',
      objectKey: 'user-1/cargo/file-1.jpg',
      status: 'uploaded',
      createdAtIso: '2026-07-06T03:00:00.000Z',
      previewUrl: ' https://preview.example.com/file-1?signature=fresh ',
      previewExpiresAtIso: '2026-07-06T03:10:00.000Z',
    });

    await expect(
      refreshPlatformFilePreviewUrl({ getFileMetadata }, 'file-1'),
    ).resolves.toEqual({
      url: 'https://preview.example.com/file-1?signature=fresh',
      expiresAtIso: '2026-07-06T03:10:00.000Z',
    });
    expect(getFileMetadata).toHaveBeenCalledWith('file-1');
  });

  it('falls back to a stable public url when refreshed preview metadata is blank', async () => {
    const getFileMetadata = jest.fn().mockResolvedValue({
      id: 'file-1',
      ownerUserId: 'user-1',
      purpose: 'cargo',
      objectKey: 'user-1/cargo/file-1.jpg',
      status: 'uploaded',
      createdAtIso: '2026-07-06T03:00:00.000Z',
      previewUrl: '   ',
      publicUrl: ' https://cdn.example.com/file-1.jpg ',
    });

    await expect(
      refreshPlatformFilePreviewUrl({ getFileMetadata }, 'file-1'),
    ).resolves.toEqual({
      url: 'https://cdn.example.com/file-1.jpg',
    });
  });

  it('rejects non-http preview urls returned by file metadata', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'file-1',
          ownerUserId: 'user-1',
          purpose: 'cargo',
          objectKey: 'user-1/cargo/file-1.jpg',
          status: 'uploaded',
          previewUrl: 'file:///private/file-1.jpg',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        },
        requestId: 'req-file-metadata',
        timestamp: '2026-07-06T03:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getFileMetadata('file-1')).rejects.toMatchObject({
      code: 'PLATFORM_FILE_PREVIEW_URL_INVALID',
      status: 0,
    });
  });

  it('rejects refreshed metadata without a previewable url', async () => {
    await expect(
      refreshPlatformFilePreviewUrl(
        {
          getFileMetadata: jest.fn().mockResolvedValue({
            id: 'file-1',
            ownerUserId: 'user-1',
            purpose: 'cargo',
            objectKey: 'user-1/cargo/file-1.jpg',
            status: 'pending',
            createdAtIso: '2026-07-06T03:00:00.000Z',
          }),
        },
        'file-1',
      ),
    ).rejects.toMatchObject({
      code: 'FILE_PREVIEW_URL_MISSING',
      status: 0,
    });
  });

  it('confirms upload intents through the returned local upload target when available', async () => {
    const api = {
      confirmLocalUploadTarget: jest.fn().mockResolvedValue({
        id: 'file-1',
        ownerUserId: 'user-1',
        purpose: 'cargo',
        objectKey: 'user-1/cargo/file-1.jpg',
        status: 'uploaded',
        publicUrl: 'http://localhost:3000/api/files/previews/user-1/cargo/file-1.jpg',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
      confirmUploaded: jest.fn(),
    };

    await expect(
      confirmPlatformFileUploadIntent(api, {
        id: 'file-1',
        ownerUserId: 'user-1',
        purpose: 'cargo',
        objectKey: 'user-1/cargo/file-1.jpg',
        status: 'pending',
        uploadUrl: 'http://localhost:3000/api/files/uploads/file-1',
        publicUrl: 'http://localhost:3000/api/files/previews/user-1/cargo/file-1.jpg',
        expiresAtIso: '2026-07-06T03:15:00.000Z',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      id: 'file-1',
      status: 'uploaded',
    });

    expect(api.confirmLocalUploadTarget).toHaveBeenCalledWith(
      'http://localhost:3000/api/files/uploads/file-1',
    );
    expect(api.confirmUploaded).not.toHaveBeenCalled();
  });

  it('falls back to legacy upload confirmation for older injected file APIs', async () => {
    const api = {
      confirmUploaded: jest.fn().mockResolvedValue({
        id: 'file-1',
        ownerUserId: 'user-1',
        purpose: 'cargo',
        objectKey: 'user-1/cargo/file-1.jpg',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/user-1/cargo/file-1.jpg',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    };

    await expect(
      confirmPlatformFileUploadIntent(api, {
        id: 'file-1',
        ownerUserId: 'user-1',
        purpose: 'cargo',
        objectKey: 'user-1/cargo/file-1.jpg',
        status: 'pending',
        uploadUrl: 'http://localhost:3000/api/files/uploads/file-1',
        publicUrl: 'https://cdn.example.com/user-1/cargo/file-1.jpg',
        expiresAtIso: '2026-07-06T03:15:00.000Z',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      id: 'file-1',
      status: 'uploaded',
    });

    expect(api.confirmUploaded).toHaveBeenCalledWith('file-1', {
      publicUrl: 'https://cdn.example.com/user-1/cargo/file-1.jpg',
    });
  });

  it('gets signed preview metadata without bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'file-1',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/front.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/driver-1/identity/front.png',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        },
        requestId: 'req-preview',
        timestamp: '2026-07-06T03:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'stale-access-token',
      getRequestId: () => 'req-preview',
    });

    await expect(
      api.getPreviewMetadata(' driver-1/identity/front.png ', {
        expiresAtIso: ' 2026-07-06T03:10:00.000Z ',
        signature: ' valid-signature ',
      }),
    ).resolves.toMatchObject({
      id: 'file-1',
      objectKey: 'driver-1/identity/front.png',
      status: 'uploaded',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/files/previews/driver-1/identity/front.png?expiresAtIso=2026-07-06T03%3A10%3A00.000Z&signature=valid-signature',
      expect.objectContaining({
        method: 'GET',
        headers: expect.not.objectContaining({
          Authorization: expect.any(String),
        }),
      }),
    );
  });

  it('accepts evaluation image upload intents', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'file-evaluation-1',
          ownerUserId: 'user-1',
          purpose: 'evaluation',
          objectKey: 'user-1/evaluation/file-evaluation-1.png',
          status: 'pending',
          uploadUrl:
            'http://localhost:3000/api/files/uploads/file-evaluation-1',
          publicUrl:
            'https://cdn.example.com/user-1/evaluation/file-evaluation-1.png',
          expiresAtIso: '2026-07-06T03:15:00.000Z',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-06T03:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.createUploadIntent({
        purpose: 'evaluation',
        fileName: '评价图片.png',
        contentType: 'image/png',
        byteSize: 2048,
      }),
    ).resolves.toMatchObject({
      id: 'file-evaluation-1',
      purpose: 'evaluation',
      status: 'pending',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/files/upload-intents',
      expect.objectContaining({
        body: JSON.stringify({
          purpose: 'evaluation',
          fileName: '评价图片.png',
          contentType: 'image/png',
          byteSize: 2048,
        }),
      }),
    );
  });

  it('reads file maintenance summary and report with bearer token', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(createFileMaintenanceSummary()),
      )
      .mockResolvedValueOnce(
        createJsonResponse(createFileMaintenanceReport()),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getFileMaintenanceSummary()).resolves.toMatchObject({
      totalCount: 6,
      expiredPendingCount: 2,
    });
    await expect(
      api.getFileMaintenanceReport({ topOwnersLimit: 8 }),
    ).resolves.toMatchObject({
      generatedAtIso: '2026-07-25T09:00:00.000Z',
      topOwners: [expect.objectContaining({ ownerUserId: 'user-1' })],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/files/maintenance/summary',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/files/maintenance/report?topOwnersLimit=8',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('lists maintenance files with normalized query filters', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        items: [createMaintenanceFile()],
        page: 2,
        pageSize: 10,
        total: 1,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listFileMaintenanceFiles({
        status: 'pending',
        purpose: 'exception',
        ownerUserId: ' user-1 ',
        keyword: ' object-key ',
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toMatchObject({
      page: 2,
      pageSize: 10,
      items: [expect.objectContaining({ id: 'file-maint-1' })],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/files/maintenance/files?status=pending&purpose=exception&ownerUserId=user-1&keyword=object-key&page=2&pageSize=10',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('runs file maintenance actions with normalized payloads', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          rejectedCount: 2,
          deletedObjectCount: 1,
          failedObjectDeletionCount: 1,
          cutoffIso: '2026-07-25T08:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          action: 'reject_pending',
          requestedCount: 2,
          matchedCount: 2,
          processedCount: 2,
          skippedFileIds: [],
          deletedObjectCount: 1,
          failedObjectDeletionCount: 0,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          attemptedObjectCount: 3,
          deletedObjectCount: 2,
          failedObjectDeletionCount: 1,
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.rejectExpiredPendingFiles()).resolves.toMatchObject({
      rejectedCount: 2,
    });
    await expect(
      api.runFileMaintenanceBatchGovernance({
        action: 'reject_pending',
        fileIds: [' file-1 ', 'file-2', 'file-1'],
      }),
    ).resolves.toMatchObject({
      requestedCount: 2,
      processedCount: 2,
    });
    await expect(api.deleteRejectedFileObjects()).resolves.toMatchObject({
      attemptedObjectCount: 3,
      deletedObjectCount: 2,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/files/maintenance/reject-expired-pending',
      expect.objectContaining({
        method: 'POST',
        body: undefined,
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/files/maintenance/batch-governance',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'reject_pending',
          fileIds: ['file-1', 'file-2'],
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/api/files/maintenance/delete-rejected-objects',
      expect.objectContaining({
        method: 'POST',
        body: undefined,
      }),
    );
  });

  it('rejects invalid file requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.createUploadIntent({
        purpose: 'bad-purpose',
        fileName: 'cargo.jpg',
        contentType: 'image/jpeg',
        byteSize: 1024,
      } as never),
    ).rejects.toMatchObject({
      code: 'PLATFORM_FILE_UPLOAD_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.confirmUploaded(' ', {}),
    ).rejects.toMatchObject({
      code: 'PLATFORM_FILE_ID_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(api.getFileMetadata(' ')).rejects.toMatchObject({
      code: 'PLATFORM_FILE_ID_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.confirmLocalUploadTarget('https://cdn.example.com/file-1'),
    ).rejects.toMatchObject({
      code: 'PLATFORM_FILE_UPLOAD_TARGET_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.getPreviewMetadata(' ', {
        expiresAtIso: '2026-07-06T03:10:00.000Z',
        signature: 'valid-signature',
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_FILE_PREVIEW_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.getPreviewMetadata('driver-1/identity/front.png', {
        expiresAtIso: '',
        signature: 'valid-signature',
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_FILE_PREVIEW_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.getFileMaintenanceReport({
        topOwnersLimit: 21,
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_FILE_MAINTENANCE_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listFileMaintenanceFiles({
        status: 'done' as never,
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_FILE_MAINTENANCE_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.runFileMaintenanceBatchGovernance({
        action: 'delete_all' as never,
        fileIds: ['file-1'],
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_FILE_MAINTENANCE_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'non-object request'],
    [
      { purpose: 'poster', fileName: 'a.png', contentType: 'image/png', byteSize: 1 },
      'invalid purpose',
    ],
    [
      { purpose: 'identity', fileName: 'a.gif', contentType: 'image/gif', byteSize: 1 },
      'unsupported content type',
    ],
    [
      { purpose: 'identity', fileName: 'a.png', contentType: 'image/png', byteSize: 0 },
      'non-positive byte size',
    ],
    [
      { purpose: 'identity', fileName: 'a.png', contentType: 'image/png', byteSize: 10 * 1024 * 1024 + 1 },
      'oversized byte size',
    ],
    [
      { purpose: 'identity', fileName: '   ', contentType: 'image/png', byteSize: 1 },
      'blank file name',
    ],
  ])(
    'rejects invalid create-upload-intent requests before sending them: %s',
    async (request, _label) => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const api = createPlatformFileApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(
        api.createUploadIntent(request as never),
      ).rejects.toMatchObject({
        code: 'PLATFORM_FILE_UPLOAD_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [null, 'non-object request'],
    [{ publicUrl: 'ftp://cdn.example.com/x.png' }, 'non-http public url'],
    [{ publicUrl: 123 }, 'non-string public url'],
  ])(
    'rejects invalid confirm-uploaded requests before sending them: %s',
    async (request, _label) => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const api = createPlatformFileApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(
        api.confirmUploaded('file-1', request as never),
      ).rejects.toMatchObject({
        code: 'PLATFORM_FILE_UPLOAD_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [123, 'non-string upload url'],
    ['   ', 'blank upload url'],
    ['http://evil.example.com/files/uploads/file-1', 'cross-origin target'],
    ['http://localhost:3000/api/files/uploads/file-1?token=x', 'target with query'],
    ['http://localhost:3000/api/files/other/file-1', 'target outside uploads prefix'],
  ])(
    'rejects invalid local upload targets before sending them: %s',
    async (uploadUrl, _label) => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const api = createPlatformFileApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(
        api.confirmLocalUploadTarget(uploadUrl as never),
      ).rejects.toMatchObject({
        code: 'PLATFORM_FILE_UPLOAD_TARGET_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('accepts a valid local upload target and posts to its path', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'file-1',
          ownerUserId: 'user-1',
          purpose: 'identity',
          objectKey: 'user-1/identity/file-1.png',
          status: 'uploaded',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-06T03:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.confirmLocalUploadTarget(
      'http://localhost:3000/api/files/uploads/file-1',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/files/uploads/file-1',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    [null, 'non-object preview request'],
    [{ expiresAtIso: 123, signature: 'sig' }, 'non-string expiry'],
    [
      { expiresAtIso: '2026-07-06T03:15:00.000Z', signature: '  ' },
      'blank signature',
    ],
  ])(
    'rejects invalid preview metadata requests before sending them: %s',
    async (request, _label) => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const api = createPlatformFileApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(
        api.getPreviewMetadata('driver-1/identity/front.png', request as never),
      ).rejects.toMatchObject({
        code: 'PLATFORM_FILE_PREVIEW_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects a non-string preview object key before sending it', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.getPreviewMetadata(123 as never, {
        expiresAtIso: '2026-07-06T03:15:00.000Z',
        signature: 'valid-signature',
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_FILE_PREVIEW_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [123, 'non-string file id'],
    ['   ', 'blank file id'],
  ])(
    'rejects invalid file ids before sending them: %s',
    async (fileId, _label) => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const api = createPlatformFileApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(api.getFileMetadata(fileId as never)).rejects.toMatchObject({
        code: 'PLATFORM_FILE_ID_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

function createJsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      code: 'OK',
      message: 'success',
      data,
      requestId: 'req-test',
      timestamp: '2026-07-25T09:00:00.000Z',
    }),
  };
}

function createFileMaintenanceSummary() {
  return {
    totalCount: 6,
    pendingCount: 2,
    uploadedCount: 2,
    rejectedCount: 2,
    expiredPendingCount: 2,
    cutoffIso: '2026-07-25T08:00:00.000Z',
  };
}

function createFileMaintenanceReport() {
  return {
    generatedAtIso: '2026-07-25T09:00:00.000Z',
    cutoffIso: '2026-07-25T08:00:00.000Z',
    purposeBreakdown: [
      {
        purpose: 'exception',
        totalCount: 3,
        pendingCount: 1,
        uploadedCount: 1,
        rejectedCount: 1,
        expiredPendingCount: 1,
      },
    ],
    topOwners: [
      {
        ownerUserId: 'user-1',
        totalCount: 3,
        pendingCount: 1,
        uploadedCount: 1,
        rejectedCount: 1,
        expiredPendingCount: 1,
        latestCreatedAtIso: '2026-07-25T07:00:00.000Z',
      },
    ],
  };
}

function createMaintenanceFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-maint-1',
    ownerUserId: 'user-1',
    purpose: 'exception',
    objectKey: 'user-1/exception/file-maint-1.png',
    publicUrl: 'https://cdn.example.com/user-1/exception/file-maint-1.png',
    status: 'pending',
    isExpiredPending: true,
    createdAtIso: '2026-07-25T07:00:00.000Z',
    ...overrides,
  };
}
