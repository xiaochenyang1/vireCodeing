import { createHmac } from 'crypto';
import { InMemoryFilesRepository } from './files.repository';
import { LocalFilePreviewUrlSigner } from './file-preview-url.signer';
import { FilesService } from './files.service';

describe('FilesService', () => {
  const now = new Date('2026-07-06T03:00:00.000Z');

  function createService() {
    const repository = new InMemoryFilesRepository(() => now);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => now,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });

    return {
      repository,
      previewUrlSigner,
      service: new FilesService(repository, {
        uploadUrlBase: 'http://localhost:3000/api/files/uploads',
        publicUrlBase: 'https://cdn.example.com',
        uploadExpiresInSeconds: 900,
        storageCallbackSigningSecret: 'unit-test-storage-callback-secret',
        now: () => now,
      }, previewUrlSigner),
    };
  }

  it('creates a pending file upload intent for the current user', async () => {
    const { service } = createService();

    await expect(
      service.createUploadIntent('user-1', {
        purpose: 'identity',
        fileName: '身份证正面.png',
        contentType: 'image/png',
        byteSize: 2048,
      }),
    ).resolves.toMatchObject({
      ownerUserId: 'user-1',
      purpose: 'identity',
      objectKey: expect.stringMatching(
        /^user-1\/identity\/20260706030000000\/.+-shen-fen-zheng-zheng-mian.png$/,
      ),
      status: 'pending',
      uploadUrl: expect.stringContaining('/api/files/uploads/'),
      publicUrl: expect.stringContaining('https://cdn.example.com/'),
      expiresAtIso: '2026-07-06T03:15:00.000Z',
    });
  });

  it('delegates upload target creation to the storage provider', async () => {
    const repository = new InMemoryFilesRepository(() => now);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => now,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const storageProvider = {
      createPublicUrl: jest.fn(() => 'https://storage.example.com/object.png'),
      createUploadTarget: jest.fn((file, expiresAtIso) => ({
        uploadUrl: `https://upload.example.com/${file.id}`,
        publicUrl: file.publicUrl,
        expiresAtIso,
      })),
      verifyUploadedFile: jest.fn().mockResolvedValue(undefined),
      saveUploadedFile: jest.fn(),
      readUploadedFile: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FilesService(
      repository,
      {
        uploadExpiresInSeconds: 900,
        now: () => now,
      },
      previewUrlSigner,
      storageProvider,
    );

    await expect(
      service.createUploadIntent('user-1', {
        purpose: 'identity',
        fileName: 'front.png',
        contentType: 'image/png',
        byteSize: 2048,
      }),
    ).resolves.toMatchObject({
      uploadUrl: 'https://upload.example.com/file-local-1',
      publicUrl: 'https://storage.example.com/object.png',
      expiresAtIso: '2026-07-06T03:15:00.000Z',
    });
    expect(storageProvider.createPublicUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/identity\//),
    );
    expect(storageProvider.createUploadTarget).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'file-local-1' }),
      '2026-07-06T03:15:00.000Z',
    );
  });

  it('marks a current user pending file as uploaded', async () => {
    const { service } = createService();
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    await expect(
      service.confirmUploaded('user-1', intent.id, {
        publicUrl: 'https://cdn.example.com/custom/cargo.jpg',
      }),
    ).resolves.toMatchObject({
      id: intent.id,
      ownerUserId: 'user-1',
      status: 'uploaded',
      publicUrl: 'https://cdn.example.com/custom/cargo.jpg',
    });
  });

  it('verifies provider upload state before confirming a pending file', async () => {
    const repository = new InMemoryFilesRepository(() => now);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => now,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const storageProvider = {
      createPublicUrl: jest.fn(() => 'https://storage.example.com/cargo.jpg'),
      createUploadTarget: jest.fn((file, expiresAtIso) => ({
        uploadUrl: `https://upload.example.com/${file.id}`,
        publicUrl: file.publicUrl,
        expiresAtIso,
      })),
      verifyUploadedFile: jest
        .fn()
        .mockRejectedValue(
          new Error('Remote object byte size does not match upload intent'),
        ),
      saveUploadedFile: jest.fn(),
      readUploadedFile: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FilesService(
      repository,
      {
        uploadExpiresInSeconds: 900,
        now: () => now,
      },
      previewUrlSigner,
      storageProvider,
    );
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    await expect(
      service.confirmUploaded('user-1', intent.id, {}),
    ).rejects.toMatchObject({
      code: 'FILE_STATE_INVALID',
      message: '远端文件校验失败，请重新上传',
    });
    expect(storageProvider.verifyUploadedFile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: intent.id,
        status: 'pending',
      }),
    );
    await expect(
      repository.findFileByIdAndOwner(intent.id, 'user-1'),
    ).resolves.toMatchObject({
      id: intent.id,
      status: 'pending',
    });
  });

  it('confirms a storage callback and stores object metadata', async () => {
    const { repository, service } = createService();
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });
    const callback = {
      fileId: intent.id,
      objectKey: intent.objectKey,
      byteSize: intent.byteSize,
      contentType: intent.contentType,
      etag: '"etag-1"',
      versionId: 'version-1',
    };

    await expect(
      service.confirmStorageCallback({
        ...callback,
        signature: signStorageCallback(callback),
      }),
    ).resolves.toMatchObject({
      id: intent.id,
      status: 'uploaded',
      etag: '"etag-1"',
      versionId: 'version-1',
    });
    await expect(
      repository.findFileByIdAndOwner(intent.id, 'user-1'),
    ).resolves.toMatchObject({
      id: intent.id,
      status: 'uploaded',
      etag: '"etag-1"',
      versionId: 'version-1',
    });
  });

  it('treats a repeated matching storage callback as idempotent', async () => {
    const { repository, service } = createService();
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });
    const callback = {
      fileId: intent.id,
      objectKey: intent.objectKey,
      byteSize: intent.byteSize,
      contentType: intent.contentType,
      etag: '"etag-1"',
      versionId: 'version-1',
    };
    const signedCallback = {
      ...callback,
      signature: signStorageCallback(callback),
    };

    await service.confirmStorageCallback(signedCallback);

    await expect(
      service.confirmStorageCallback(signedCallback),
    ).resolves.toMatchObject({
      id: intent.id,
      status: 'uploaded',
      etag: '"etag-1"',
      versionId: 'version-1',
    });
    await expect(
      repository.findFileByIdAndOwner(intent.id, 'user-1'),
    ).resolves.toMatchObject({
      id: intent.id,
      status: 'uploaded',
      etag: '"etag-1"',
      versionId: 'version-1',
    });
  });

  it('rejects a storage callback with an invalid signature', async () => {
    const { repository, service } = createService();
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    await expect(
      service.confirmStorageCallback({
        fileId: intent.id,
        objectKey: intent.objectKey,
        byteSize: intent.byteSize,
        contentType: intent.contentType,
        signature: 'bad-signature',
      }),
    ).rejects.toMatchObject({
      code: 'FILE_STORAGE_CALLBACK_INVALID',
      message: '对象存储回调签名无效',
    });
    await expect(
      repository.findFileByIdAndOwner(intent.id, 'user-1'),
    ).resolves.toMatchObject({
      id: intent.id,
      status: 'pending',
    });
  });

  it('rejects a storage callback when no callback signing secret is configured', async () => {
    const repository = new InMemoryFilesRepository(() => now);
    const service = new FilesService(repository, {
      uploadUrlBase: 'http://localhost:3000/api/files/uploads',
      publicUrlBase: 'https://cdn.example.com',
      uploadExpiresInSeconds: 900,
      now: () => now,
    });
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });
    const callback = {
      fileId: intent.id,
      objectKey: intent.objectKey,
      byteSize: intent.byteSize,
      contentType: intent.contentType,
    };

    await expect(
      service.confirmStorageCallback({
        ...callback,
        signature: signStorageCallback(callback),
      }),
    ).rejects.toMatchObject({
      code: 'FILE_STORAGE_CALLBACK_INVALID',
      message: '对象存储回调签名无效',
    });
    await expect(
      repository.findFileByIdAndOwner(intent.id, 'user-1'),
    ).resolves.toMatchObject({
      id: intent.id,
      status: 'pending',
    });
  });

  it('stores local upload bytes before marking the file as uploaded', async () => {
    const repository = new InMemoryFilesRepository(() => now);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => now,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const storageProvider = {
      createPublicUrl: jest.fn(() => 'https://storage.example.com/cargo.jpg'),
      createUploadTarget: jest.fn((file, expiresAtIso) => ({
        uploadUrl: `http://localhost:3000/api/files/uploads/${file.id}`,
        publicUrl: file.publicUrl,
        expiresAtIso,
      })),
      verifyUploadedFile: jest.fn().mockResolvedValue(undefined),
      saveUploadedFile: jest.fn().mockResolvedValue(undefined),
      readUploadedFile: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FilesService(
      repository,
      {
        uploadUrlBase: 'http://localhost:3000/api/files/uploads',
        publicUrlBase: 'https://cdn.example.com',
        uploadExpiresInSeconds: 900,
        now: () => now,
      },
      previewUrlSigner,
      storageProvider,
    );
    const content = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
    ]);
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: content.length,
    });

    await expect(
      service.uploadLocalFile('user-1', intent.id, content),
    ).resolves.toMatchObject({
      id: intent.id,
      status: 'uploaded',
      publicUrl: 'https://storage.example.com/cargo.jpg',
    });
    expect(storageProvider.saveUploadedFile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: intent.id,
        status: 'pending',
      }),
      content,
    );
  });

  it('returns signed local preview content bytes for an uploaded file', async () => {
    const content = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    const repository = new InMemoryFilesRepository(() => now);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => now,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const storageProvider = {
      createPublicUrl: jest.fn(() => 'https://storage.example.com/front.png'),
      createUploadTarget: jest.fn((file, expiresAtIso) => ({
        uploadUrl: `http://localhost:3000/api/files/uploads/${file.id}`,
        publicUrl: file.publicUrl,
        expiresAtIso,
      })),
      verifyUploadedFile: jest.fn().mockResolvedValue(undefined),
      saveUploadedFile: jest.fn().mockResolvedValue(undefined),
      readUploadedFile: jest.fn().mockResolvedValue(content),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FilesService(
      repository,
      {
        uploadUrlBase: 'http://localhost:3000/api/files/uploads',
        publicUrlBase: 'https://cdn.example.com',
        uploadExpiresInSeconds: 900,
        now: () => now,
      },
      previewUrlSigner,
      storageProvider,
    );
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'identity',
      fileName: 'front.png',
      contentType: 'image/png',
      byteSize: content.length,
    });
    const uploaded = await service.uploadLocalFile('user-1', intent.id, content);
    const signed = previewUrlSigner.signPreviewUrl(uploaded);
    const previewUrl = new URL(signed.previewUrl, 'https://local.test');

    await expect(
      service.getPreviewContentByObjectKey(uploaded.objectKey, {
        expiresAtIso: signed.previewExpiresAtIso,
        signature: previewUrl.searchParams.get('signature')!,
      }),
    ).resolves.toMatchObject({
      file: {
        id: uploaded.id,
        contentType: 'image/png',
        byteSize: content.length,
      },
      content,
    });
    expect(storageProvider.readUploadedFile).toHaveBeenCalledWith(uploaded);
  });

  it('rejects local upload bytes that do not match the declared byte size', async () => {
    const repository = new InMemoryFilesRepository(() => now);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => now,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const storageProvider = {
      createPublicUrl: jest.fn(() => 'https://storage.example.com/cargo.jpg'),
      createUploadTarget: jest.fn((file, expiresAtIso) => ({
        uploadUrl: `http://localhost:3000/api/files/uploads/${file.id}`,
        publicUrl: file.publicUrl,
        expiresAtIso,
      })),
      verifyUploadedFile: jest.fn().mockResolvedValue(undefined),
      saveUploadedFile: jest.fn().mockResolvedValue(undefined),
      readUploadedFile: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FilesService(
      repository,
      {
        uploadUrlBase: 'http://localhost:3000/api/files/uploads',
        publicUrlBase: 'https://cdn.example.com',
        uploadExpiresInSeconds: 900,
        now: () => now,
      },
      previewUrlSigner,
      storageProvider,
    );
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    await expect(
      service.uploadLocalFile('user-1', intent.id, Buffer.from('short')),
    ).rejects.toMatchObject({
      code: 'FILE_STATE_INVALID',
      message: '上传内容大小与上传意图不一致，请重新选择文件',
    });
    expect(storageProvider.saveUploadedFile).not.toHaveBeenCalled();
    await expect(
      repository.findFileByIdAndOwner(intent.id, 'user-1'),
    ).resolves.toMatchObject({
      id: intent.id,
      status: 'pending',
    });
  });

  it('rejects local upload bytes that do not match the declared content type', async () => {
    const repository = new InMemoryFilesRepository(() => now);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => now,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const storageProvider = {
      createPublicUrl: jest.fn(() => 'https://storage.example.com/front.png'),
      createUploadTarget: jest.fn((file, expiresAtIso) => ({
        uploadUrl: `http://localhost:3000/api/files/uploads/${file.id}`,
        publicUrl: file.publicUrl,
        expiresAtIso,
      })),
      verifyUploadedFile: jest.fn().mockResolvedValue(undefined),
      saveUploadedFile: jest.fn().mockResolvedValue(undefined),
      readUploadedFile: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FilesService(
      repository,
      {
        uploadUrlBase: 'http://localhost:3000/api/files/uploads',
        publicUrlBase: 'https://cdn.example.com',
        uploadExpiresInSeconds: 900,
        now: () => now,
      },
      previewUrlSigner,
      storageProvider,
    );
    const pdfContent = Buffer.from('%PDF-1.7\nfake-pdf');
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'identity',
      fileName: 'front.png',
      contentType: 'image/png',
      byteSize: pdfContent.length,
    });

    await expect(
      service.uploadLocalFile('user-1', intent.id, pdfContent),
    ).rejects.toMatchObject({
      code: 'FILE_STATE_INVALID',
      message: '上传内容类型与上传意图不一致，请重新选择文件',
    });
    expect(storageProvider.saveUploadedFile).not.toHaveBeenCalled();
    await expect(
      repository.findFileByIdAndOwner(intent.id, 'user-1'),
    ).resolves.toMatchObject({
      id: intent.id,
      status: 'pending',
    });
  });

  it('rejects confirming an upload intent after it expires', async () => {
    let currentTime = new Date('2026-07-06T03:00:00.000Z');
    const repository = new InMemoryFilesRepository(() => currentTime);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => currentTime,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const service = new FilesService(
      repository,
      {
        uploadUrlBase: 'http://localhost:3000/api/files/uploads',
        publicUrlBase: 'https://cdn.example.com',
        uploadExpiresInSeconds: 900,
        now: () => currentTime,
      },
      previewUrlSigner,
    );
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    currentTime = new Date('2026-07-06T03:15:01.000Z');

    await expect(
      service.confirmUploaded('user-1', intent.id, {}),
    ).rejects.toMatchObject({
      code: 'FILE_STATE_INVALID',
      message: '上传链接已过期，请重新选择文件',
    });
  });

  it('rejects expired pending files without touching current pending or uploaded files', async () => {
    let currentTime = new Date('2026-07-06T03:00:00.000Z');
    const repository = new InMemoryFilesRepository(() => currentTime);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => currentTime,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const service = new FilesService(
      repository,
      {
        uploadUrlBase: 'http://localhost:3000/api/files/uploads',
        publicUrlBase: 'https://cdn.example.com',
        uploadExpiresInSeconds: 900,
        now: () => currentTime,
      },
      previewUrlSigner,
    );
    const expiredIntent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'expired-cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    currentTime = new Date('2026-07-06T03:10:00.000Z');
    const currentIntent = await service.createUploadIntent('user-1', {
      purpose: 'identity',
      fileName: 'current-front.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    const uploadedIntent = await service.createUploadIntent('user-1', {
      purpose: 'evaluation',
      fileName: 'uploaded.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });
    await service.confirmUploaded('user-1', uploadedIntent.id, {});

    currentTime = new Date('2026-07-06T03:20:01.000Z');

    await expect(service.rejectExpiredPendingFiles()).resolves.toEqual({
      rejectedCount: 1,
      deletedObjectCount: 1,
      failedObjectDeletionCount: 0,
      cutoffIso: '2026-07-06T03:05:01.000Z',
    });
    await expect(repository.findFileById(expiredIntent.id)).resolves.toMatchObject({
      id: expiredIntent.id,
      status: 'rejected',
    });
    await expect(repository.findFileById(currentIntent.id)).resolves.toMatchObject({
      id: currentIntent.id,
      status: 'pending',
    });
    await expect(repository.findFileById(uploadedIntent.id)).resolves.toMatchObject({
      id: uploadedIntent.id,
      status: 'uploaded',
    });
  });

  it('deletes expired pending storage objects during metadata cleanup', async () => {
    let currentTime = new Date('2026-07-06T03:00:00.000Z');
    const repository = new InMemoryFilesRepository(() => currentTime);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => currentTime,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const storageProvider = {
      createPublicUrl: jest.fn(() => undefined),
      createUploadTarget: jest.fn((file, expiresAtIso) => ({
        uploadUrl: `http://localhost:3000/api/files/uploads/${file.id}`,
        expiresAtIso,
      })),
      verifyUploadedFile: jest.fn().mockResolvedValue(undefined),
      saveUploadedFile: jest.fn().mockResolvedValue(undefined),
      readUploadedFile: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FilesService(
      repository,
      {
        uploadExpiresInSeconds: 900,
        now: () => currentTime,
      },
      previewUrlSigner,
      storageProvider,
    );
    const expiredIntent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'expired-cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    currentTime = new Date('2026-07-06T03:10:00.000Z');
    await service.createUploadIntent('user-1', {
      purpose: 'identity',
      fileName: 'current-front.png',
      contentType: 'image/png',
      byteSize: 2048,
    });

    currentTime = new Date('2026-07-06T03:20:01.000Z');

    await expect(service.rejectExpiredPendingFiles()).resolves.toEqual({
      rejectedCount: 1,
      deletedObjectCount: 1,
      failedObjectDeletionCount: 0,
      cutoffIso: '2026-07-06T03:05:01.000Z',
    });
    expect(storageProvider.deleteObject).toHaveBeenCalledTimes(1);
    expect(storageProvider.deleteObject).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expiredIntent.id,
        objectKey: expiredIntent.objectKey,
        status: 'rejected',
      }),
    );
  });

  it('retries object deletion for rejected files', async () => {
    let currentTime = new Date('2026-07-06T03:00:00.000Z');
    const repository = new InMemoryFilesRepository(() => currentTime);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => currentTime,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const storageProvider = {
      createPublicUrl: jest.fn(() => undefined),
      createUploadTarget: jest.fn((file, expiresAtIso) => ({
        uploadUrl: `http://localhost:3000/api/files/uploads/${file.id}`,
        expiresAtIso,
      })),
      verifyUploadedFile: jest.fn().mockResolvedValue(undefined),
      saveUploadedFile: jest.fn().mockResolvedValue(undefined),
      readUploadedFile: jest.fn(),
      deleteObject: jest
        .fn()
        .mockRejectedValueOnce(new Error('storage unavailable'))
        .mockResolvedValueOnce(undefined),
    };
    const service = new FilesService(
      repository,
      {
        uploadExpiresInSeconds: 900,
        now: () => currentTime,
      },
      previewUrlSigner,
      storageProvider,
    );
    const expiredIntent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'expired-cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    currentTime = new Date('2026-07-06T03:20:01.000Z');

    await expect(service.rejectExpiredPendingFiles()).resolves.toEqual({
      rejectedCount: 1,
      deletedObjectCount: 0,
      failedObjectDeletionCount: 1,
      cutoffIso: '2026-07-06T03:05:01.000Z',
    });
    await expect(repository.findFileById(expiredIntent.id)).resolves.toMatchObject({
      id: expiredIntent.id,
      status: 'rejected',
    });

    await expect(service.deleteRejectedFileObjects()).resolves.toEqual({
      attemptedObjectCount: 1,
      deletedObjectCount: 1,
      failedObjectDeletionCount: 0,
    });
    expect(storageProvider.deleteObject).toHaveBeenCalledTimes(2);
  });

  it('summarizes file maintenance counts for admin audit before cleanup', async () => {
    let currentTime = new Date('2026-07-06T03:00:00.000Z');
    const repository = new InMemoryFilesRepository(() => currentTime);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => currentTime,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const service = new FilesService(
      repository,
      {
        uploadUrlBase: 'http://localhost:3000/api/files/uploads',
        publicUrlBase: 'https://cdn.example.com',
        uploadExpiresInSeconds: 900,
        now: () => currentTime,
      },
      previewUrlSigner,
    );
    await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'expired-cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    currentTime = new Date('2026-07-06T03:10:00.000Z');
    await service.createUploadIntent('user-1', {
      purpose: 'identity',
      fileName: 'current-front.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    const uploadedIntent = await service.createUploadIntent('user-1', {
      purpose: 'evaluation',
      fileName: 'uploaded.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });
    await service.confirmUploaded('user-1', uploadedIntent.id, {});

    currentTime = new Date('2026-07-06T03:20:01.000Z');

    await expect(service.getMaintenanceSummary()).resolves.toEqual({
      totalCount: 3,
      pendingCount: 2,
      uploadedCount: 1,
      rejectedCount: 0,
      expiredPendingCount: 1,
      cutoffIso: '2026-07-06T03:05:01.000Z',
    });
  });

  it('rejects confirming a file owned by another user', async () => {
    const { service } = createService();
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'exception',
      fileName: 'exception.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    await expect(
      service.confirmUploaded('user-2', intent.id, {}),
    ).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
      message: '文件不存在',
    });
  });

  it('returns file metadata to the owner', async () => {
    const { service } = createService();
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    await expect(
      service.getFileMetadata(
        { id: 'user-1', phone: '13900139001', userType: 'shipper' },
        intent.id,
      ),
    ).resolves.toMatchObject({
      id: intent.id,
      ownerUserId: 'user-1',
      purpose: 'cargo',
      status: 'pending',
    });
  });

  it('returns file metadata to admins', async () => {
    const { service } = createService();
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'identity',
      fileName: 'front.png',
      contentType: 'image/png',
      byteSize: 2048,
    });

    await expect(
      service.getFileMetadata(
        { id: 'admin-1', phone: '13900139000', userType: 'admin' },
        intent.id,
      ),
    ).resolves.toMatchObject({
      id: intent.id,
      ownerUserId: 'user-1',
      purpose: 'identity',
    });
  });

  it('hides file metadata from non-owner users', async () => {
    const { service } = createService();
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    await expect(
      service.getFileMetadata(
        { id: 'user-2', phone: '13900139002', userType: 'shipper' },
        intent.id,
      ),
    ).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
      message: '文件不存在',
    });
  });

  it('returns uploaded file metadata for a valid signed preview url', async () => {
    const { previewUrlSigner, service } = createService();
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'identity',
      fileName: 'front.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    const uploaded = await service.confirmUploaded('user-1', intent.id, {});
    const signed = previewUrlSigner.signPreviewUrl(uploaded);
    const previewUrl = new URL(signed.previewUrl, 'https://local.test');

    await expect(
      service.getPreviewMetadataByObjectKey(uploaded.objectKey, {
        expiresAtIso: signed.previewExpiresAtIso,
        signature: previewUrl.searchParams.get('signature')!,
      }),
    ).resolves.toMatchObject({
      id: uploaded.id,
      ownerUserId: 'user-1',
      purpose: 'identity',
      objectKey: uploaded.objectKey,
      publicUrl: uploaded.publicUrl,
      status: 'uploaded',
      createdAtIso: '2026-07-06T03:00:00.000Z',
    });
  });

  it('rejects preview metadata when the signature is invalid', async () => {
    const { service } = createService();
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'identity',
      fileName: 'front.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    const uploaded = await service.confirmUploaded('user-1', intent.id, {});

    await expect(
      service.getPreviewMetadataByObjectKey(uploaded.objectKey, {
        expiresAtIso: '2026-07-06T03:10:00.000Z',
        signature: 'bad-signature',
      }),
    ).rejects.toMatchObject({
      code: 'FILE_PREVIEW_SIGNATURE_INVALID',
      message: '预览链接无效或已过期',
    });
  });

  it('rejects preview metadata for files that are not uploaded', async () => {
    const { previewUrlSigner, service } = createService();
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'identity',
      fileName: 'front.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    const signed = previewUrlSigner.signPreviewUrl(intent);
    const previewUrl = new URL(signed.previewUrl, 'https://local.test');

    await expect(
      service.getPreviewMetadataByObjectKey(intent.objectKey, {
        expiresAtIso: signed.previewExpiresAtIso,
        signature: previewUrl.searchParams.get('signature')!,
      }),
    ).rejects.toMatchObject({
      code: 'FILE_STATE_INVALID',
      message: '文件尚未上传完成',
    });
  });

  it('rejects a storage callback for an unknown file or mismatched object key', async () => {
    const { service } = createService();
    const callback = {
      fileId: 'missing-file',
      objectKey: 'user-1/cargo/missing.jpg',
      byteSize: 1024,
      contentType: 'image/jpeg',
    };

    await expect(
      service.confirmStorageCallback({
        ...callback,
        signature: signStorageCallback(callback),
      }),
    ).rejects.toMatchObject({ code: 'FILE_NOT_FOUND', message: '文件不存在' });
  });

  it('rejects a storage callback whose metadata mismatches the upload intent', async () => {
    const { service } = createService();
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });
    const callback = {
      fileId: intent.id,
      objectKey: intent.objectKey,
      byteSize: 2048,
      contentType: 'image/jpeg',
    };

    await expect(
      service.confirmStorageCallback({
        ...callback,
        signature: signStorageCallback(callback),
      }),
    ).rejects.toMatchObject({
      code: 'FILE_STATE_INVALID',
      message: '对象存储回调元数据与上传意图不一致',
    });
  });

  it('rejects a storage callback for a rejected (non-pending) file', async () => {
    let currentTime = new Date('2026-07-06T03:00:00.000Z');
    const repository = new InMemoryFilesRepository(() => currentTime);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => currentTime,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const service = new FilesService(
      repository,
      {
        uploadUrlBase: 'http://localhost:3000/api/files/uploads',
        publicUrlBase: 'https://cdn.example.com',
        uploadExpiresInSeconds: 900,
        storageCallbackSigningSecret: 'unit-test-storage-callback-secret',
        now: () => currentTime,
      },
      previewUrlSigner,
    );
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    currentTime = new Date('2026-07-06T03:20:00.000Z');
    await service.rejectExpiredPendingFiles();

    const callback = {
      fileId: intent.id,
      objectKey: intent.objectKey,
      byteSize: intent.byteSize,
      contentType: intent.contentType,
    };

    await expect(
      service.confirmStorageCallback({
        ...callback,
        signature: signStorageCallback(callback),
      }),
    ).rejects.toMatchObject({
      code: 'FILE_STATE_INVALID',
      message: '文件状态不允许确认',
    });
  });

  it('rejects a storage callback whose metadata mismatches an already-uploaded file', async () => {
    const { service } = createService();
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });
    const first = {
      fileId: intent.id,
      objectKey: intent.objectKey,
      byteSize: intent.byteSize,
      contentType: intent.contentType,
    };
    await service.confirmStorageCallback({
      ...first,
      signature: signStorageCallback(first),
    });

    const mismatched = { ...first, byteSize: 4096 };
    await expect(
      service.confirmStorageCallback({
        ...mismatched,
        signature: signStorageCallback(mismatched),
      }),
    ).rejects.toMatchObject({
      code: 'FILE_STATE_INVALID',
      message: '对象存储回调元数据与已上传文件不一致',
    });
  });

  it('updates object metadata when an uploaded file receives a new etag', async () => {
    const { service } = createService();
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });
    const first = {
      fileId: intent.id,
      objectKey: intent.objectKey,
      byteSize: intent.byteSize,
      contentType: intent.contentType,
    };
    await service.confirmStorageCallback({
      ...first,
      signature: signStorageCallback(first),
    });

    const withEtag = { ...first, etag: '"etag-new"', versionId: 'version-new' };
    await expect(
      service.confirmStorageCallback({
        ...withEtag,
        signature: signStorageCallback(withEtag),
      }),
    ).resolves.toMatchObject({
      id: intent.id,
      status: 'uploaded',
      etag: '"etag-new"',
      versionId: 'version-new',
    });
  });

  it('detects webp content and rejects unrecognized local upload bytes', async () => {
    const repository = new InMemoryFilesRepository(() => now);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => now,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const storageProvider = {
      createPublicUrl: jest.fn(() => 'https://storage.example.com/cargo.webp'),
      createUploadTarget: jest.fn((file, expiresAtIso) => ({
        uploadUrl: `http://localhost:3000/api/files/uploads/${file.id}`,
        publicUrl: file.publicUrl,
        expiresAtIso,
      })),
      verifyUploadedFile: jest.fn().mockResolvedValue(undefined),
      saveUploadedFile: jest.fn().mockResolvedValue(undefined),
      readUploadedFile: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FilesService(
      repository,
      {
        uploadUrlBase: 'http://localhost:3000/api/files/uploads',
        publicUrlBase: 'https://cdn.example.com',
        uploadExpiresInSeconds: 900,
        now: () => now,
      },
      previewUrlSigner,
      storageProvider,
    );
    // "RIFF" + size + "WEBP" header.
    const webpContent = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP', 'ascii'),
      Buffer.from([0x00, 0x00]),
    ]);
    const webpIntent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.webp',
      contentType: 'image/webp',
      byteSize: webpContent.length,
    });

    await expect(
      service.uploadLocalFile('user-1', webpIntent.id, webpContent),
    ).resolves.toMatchObject({ id: webpIntent.id, status: 'uploaded' });

    const unknownContent = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const unknownIntent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.png',
      contentType: 'image/png',
      byteSize: unknownContent.length,
    });

    await expect(
      service.uploadLocalFile('user-1', unknownIntent.id, unknownContent),
    ).rejects.toMatchObject({
      code: 'FILE_STATE_INVALID',
      message: '上传内容类型与上传意图不一致，请重新选择文件',
    });
  });

  it('counts failed provider deletions when purging rejected objects', async () => {
    let currentTime = new Date('2026-07-06T03:00:00.000Z');
    const repository = new InMemoryFilesRepository(() => currentTime);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => currentTime,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const storageProvider = {
      createPublicUrl: jest.fn(() => 'https://storage.example.com/cargo.jpg'),
      createUploadTarget: jest.fn((file, expiresAtIso) => ({
        uploadUrl: `http://localhost:3000/api/files/uploads/${file.id}`,
        publicUrl: file.publicUrl,
        expiresAtIso,
      })),
      verifyUploadedFile: jest.fn().mockResolvedValue(undefined),
      saveUploadedFile: jest.fn().mockResolvedValue(undefined),
      readUploadedFile: jest.fn(),
      deleteObject: jest.fn().mockRejectedValue(new Error('provider down')),
    };
    const service = new FilesService(
      repository,
      {
        uploadUrlBase: 'http://localhost:3000/api/files/uploads',
        publicUrlBase: 'https://cdn.example.com',
        uploadExpiresInSeconds: 900,
        now: () => currentTime,
      },
      previewUrlSigner,
      storageProvider,
    );
    await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    currentTime = new Date('2026-07-06T03:20:00.000Z');
    await service.rejectExpiredPendingFiles();

    await expect(service.deleteRejectedFileObjects()).resolves.toMatchObject({
      attemptedObjectCount: 1,
      deletedObjectCount: 0,
      failedObjectDeletionCount: 1,
    });
  });

  it('rejects a storage callback for a pending file whose intent already expired', async () => {
    let currentTime = new Date('2026-07-06T03:00:00.000Z');
    const repository = new InMemoryFilesRepository(() => currentTime);
    const previewUrlSigner = new LocalFilePreviewUrlSigner({
      now: () => currentTime,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-file-preview-secret',
    });
    const service = new FilesService(
      repository,
      {
        uploadUrlBase: 'http://localhost:3000/api/files/uploads',
        publicUrlBase: 'https://cdn.example.com',
        uploadExpiresInSeconds: 900,
        storageCallbackSigningSecret: 'unit-test-storage-callback-secret',
        now: () => currentTime,
      },
      previewUrlSigner,
    );
    const intent = await service.createUploadIntent('user-1', {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    });

    // Past the 900s upload window, but the pending file has not been swept yet.
    currentTime = new Date('2026-07-06T03:15:01.000Z');

    const callback = {
      fileId: intent.id,
      objectKey: intent.objectKey,
      byteSize: intent.byteSize,
      contentType: intent.contentType,
    };

    await expect(
      service.confirmStorageCallback({
        ...callback,
        signature: signStorageCallback(callback),
      }),
    ).rejects.toMatchObject({
      code: 'FILE_STATE_INVALID',
      message: '上传链接已过期，请重新选择文件',
    });
  });
});

function signStorageCallback(input: {
  fileId: string;
  objectKey: string;
  byteSize: number;
  contentType: string;
  etag?: string;
  versionId?: string;
}) {
  return createHmac('sha256', 'unit-test-storage-callback-secret')
    .update(
      [
        input.fileId,
        input.objectKey,
        String(input.byteSize),
        input.contentType,
        input.etag ?? '',
        input.versionId ?? '',
      ].join('\n'),
    )
    .digest('hex');
}
