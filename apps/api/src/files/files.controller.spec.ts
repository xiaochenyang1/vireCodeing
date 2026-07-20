import { type INestApplication } from '@nestjs/common';
import { StreamableFile } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AdminOnlyGuard } from '../auth/role.guard';
import { BusinessErrorFilter } from '../common/business-error.filter';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

describe('FilesController', () => {
  it('creates a file upload intent for the current user', async () => {
    const service = {
      createUploadIntent: jest.fn().mockResolvedValue({
        id: 'file-1',
        ownerUserId: 'user-1',
        purpose: 'identity',
        objectKey: 'user-1/identity/file-1.png',
        status: 'pending',
        uploadUrl: 'http://localhost:3000/api/files/uploads/file-1',
        expiresAtIso: '2026-07-06T03:15:00.000Z',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    } as unknown as FilesService;
    const controller = new FilesController(service);
    const body = {
      purpose: 'identity',
      fileName: '身份证正面.png',
      contentType: 'image/png',
      byteSize: 2048,
    } as const;

    await expect(
      controller.createUploadIntent(createRequest('user-1'), body),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'file-1',
        status: 'pending',
        uploadUrl: 'http://localhost:3000/api/files/uploads/file-1',
      },
      requestId: 'req_files_test',
    });
    expect(service.createUploadIntent).toHaveBeenCalledWith('user-1', body);
  });

  it('confirms a current user file upload', async () => {
    const service = {
      confirmUploaded: jest.fn().mockResolvedValue({
        id: 'file-1',
        ownerUserId: 'user-1',
        purpose: 'identity',
        objectKey: 'user-1/identity/file-1.png',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/user-1/identity/file-1.png',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    } as unknown as FilesService;
    const controller = new FilesController(service);

    await expect(
      controller.confirmUploaded(createRequest('user-1'), 'file-1', {
        publicUrl: 'https://cdn.example.com/user-1/identity/file-1.png',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'file-1',
        status: 'uploaded',
      },
      requestId: 'req_files_test',
    });
    expect(service.confirmUploaded).toHaveBeenCalledWith('user-1', 'file-1', {
      publicUrl: 'https://cdn.example.com/user-1/identity/file-1.png',
    });
  });

  it('confirms a S3 compatible storage callback without requiring bearer auth', async () => {
    const callback = {
      fileId: 'file-1',
      objectKey: 'user-1/cargo/file-1.jpg',
      byteSize: 1024,
      contentType: 'image/jpeg',
      etag: '"etag-1"',
      versionId: 'version-1',
      signature: 'signature-value',
    };
    const service = {
      confirmStorageCallback: jest.fn().mockResolvedValue({
        id: 'file-1',
        ownerUserId: 'user-1',
        purpose: 'cargo',
        contentType: 'image/jpeg',
        byteSize: 1024,
        objectKey: 'user-1/cargo/file-1.jpg',
        etag: '"etag-1"',
        versionId: 'version-1',
        status: 'uploaded',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    } as unknown as FilesService;
    const controller = new FilesController(service);

    await expect(
      controller.confirmStorageCallback(callback, {
        headers: { 'x-request-id': 'req_storage_callback' },
      } as AuthenticatedRequest),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'file-1',
        status: 'uploaded',
        etag: '"etag-1"',
        versionId: 'version-1',
      },
      requestId: 'req_storage_callback',
    });
    expect(service.confirmStorageCallback).toHaveBeenCalledWith(callback);
  });

  it('rejects expired pending files through an admin maintenance endpoint', async () => {
    const service = {
      rejectExpiredPendingFiles: jest.fn().mockResolvedValue({
        rejectedCount: 2,
        cutoffIso: '2026-07-06T03:05:00.000Z',
      }),
    } as unknown as FilesService;
    const controller = new FilesController(service);

    await expect(
      controller.rejectExpiredPendingFiles({
        headers: { 'x-request-id': 'req_file_cleanup' },
        currentUser: {
          id: 'admin-1',
          phone: '13900139000',
          userType: 'admin',
        },
      } as AuthenticatedRequest),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        rejectedCount: 2,
        cutoffIso: '2026-07-06T03:05:00.000Z',
      },
      requestId: 'req_file_cleanup',
    });
    expect(service.rejectExpiredPendingFiles).toHaveBeenCalledWith();
  });

  it('routes expired pending file maintenance requests through admin auth with HTTP 200', async () => {
    const service = {
      rejectExpiredPendingFiles: jest.fn().mockResolvedValue({
        rejectedCount: 2,
        cutoffIso: '2026-07-06T03:05:00.000Z',
      }),
    } as unknown as FilesService;
    const authService = {
      getCurrentUser: jest.fn().mockResolvedValue({
        id: 'admin-1',
        phone: '13900139000',
        userType: 'admin',
      }),
    };
    const app = await createFilesControllerTestApp(service, authService);

    try {
      const response = await fetch(
        `${await app.getUrl()}/files/maintenance/reject-expired-pending`,
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer access.admin-1.900',
            'x-request-id': 'req_file_cleanup_http',
          },
        },
      );

      await expect(response.json()).resolves.toMatchObject({
        code: 'OK',
        data: {
          rejectedCount: 2,
          cutoffIso: '2026-07-06T03:05:00.000Z',
        },
        requestId: 'req_file_cleanup_http',
      });
      expect(response.status).toBe(200);
      expect(authService.getCurrentUser).toHaveBeenCalledWith(
        'access.admin-1.900',
      );
      expect(service.rejectExpiredPendingFiles).toHaveBeenCalledWith();
    } finally {
      await app.close();
    }
  });

  it('gets file maintenance summary through an admin endpoint', async () => {
    const service = {
      getMaintenanceSummary: jest.fn().mockResolvedValue({
        totalCount: 3,
        pendingCount: 2,
        uploadedCount: 1,
        rejectedCount: 0,
        expiredPendingCount: 1,
        cutoffIso: '2026-07-06T03:05:00.000Z',
      }),
    } as unknown as FilesService;
    const controller = new FilesController(service);

    await expect(
      controller.getMaintenanceSummary({
        headers: { 'x-request-id': 'req_file_summary' },
        currentUser: {
          id: 'admin-1',
          phone: '13900139000',
          userType: 'admin',
        },
      } as AuthenticatedRequest),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        totalCount: 3,
        pendingCount: 2,
        uploadedCount: 1,
        rejectedCount: 0,
        expiredPendingCount: 1,
        cutoffIso: '2026-07-06T03:05:00.000Z',
      },
      requestId: 'req_file_summary',
    });
    expect(service.getMaintenanceSummary).toHaveBeenCalledWith();
  });

  it('gets file maintenance report through an admin endpoint', async () => {
    const service = {
      getMaintenanceReport: jest.fn().mockResolvedValue({
        generatedAtIso: '2026-07-18T09:00:00.000Z',
        cutoffIso: '2026-07-18T08:45:00.000Z',
        purposeBreakdown: [
          {
            purpose: 'identity',
            totalCount: 2,
            pendingCount: 1,
            uploadedCount: 0,
            rejectedCount: 1,
            expiredPendingCount: 1,
          },
        ],
        topOwners: [
          {
            ownerUserId: 'user-1',
            totalCount: 2,
            pendingCount: 1,
            uploadedCount: 0,
            rejectedCount: 1,
            expiredPendingCount: 1,
            latestCreatedAtIso: '2026-07-18T08:30:00.000Z',
          },
        ],
      }),
    } as unknown as FilesService;
    const controller = new FilesController(service);

    await expect(
      controller.getMaintenanceReport(
        {
          headers: { 'x-request-id': 'req_file_report' },
          currentUser: {
            id: 'admin-1',
            phone: '13900139000',
            userType: 'admin',
          },
        } as AuthenticatedRequest,
        {
          topOwnersLimit: '8',
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        generatedAtIso: '2026-07-18T09:00:00.000Z',
        cutoffIso: '2026-07-18T08:45:00.000Z',
        purposeBreakdown: [
          expect.objectContaining({
            purpose: 'identity',
            totalCount: 2,
            expiredPendingCount: 1,
          }),
        ],
        topOwners: [
          expect.objectContaining({
            ownerUserId: 'user-1',
            latestCreatedAtIso: '2026-07-18T08:30:00.000Z',
          }),
        ],
      },
      requestId: 'req_file_report',
    });
    expect(service.getMaintenanceReport).toHaveBeenCalledWith({
      topOwnersLimit: 8,
    });
  });

  it('lists file maintenance records through an admin endpoint', async () => {
    const service = {
      listMaintenanceFiles: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'file-1',
            ownerUserId: 'user-1',
            purpose: 'identity',
            contentType: 'image/png',
            byteSize: 2048,
            objectKey: 'user-1/identity/front.png',
            status: 'pending',
            createdAtIso: '2026-07-06T03:00:00.000Z',
            isExpiredPending: true,
          },
        ],
        page: 2,
        pageSize: 10,
        total: 11,
      }),
    } as unknown as FilesService;
    const controller = new FilesController(service);

    await expect(
      controller.listMaintenanceFiles(
        {
          headers: { 'x-request-id': 'req_file_list' },
          currentUser: {
            id: 'admin-1',
            phone: '13900139000',
            userType: 'admin',
          },
        } as AuthenticatedRequest,
        {
          status: 'pending',
          purpose: 'identity',
          ownerUserId: ' user-1 ',
          keyword: ' front ',
          page: '2',
          pageSize: '10',
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        items: [
          expect.objectContaining({
            id: 'file-1',
            isExpiredPending: true,
          }),
        ],
        page: 2,
        pageSize: 10,
        total: 11,
      },
      requestId: 'req_file_list',
    });
    expect(service.listMaintenanceFiles).toHaveBeenCalledWith({
      status: 'pending',
      purpose: 'identity',
      ownerUserId: 'user-1',
      keyword: 'front',
      page: 2,
      pageSize: 10,
    });
  });

  it('retries rejected file object deletion through an admin endpoint', async () => {
    const service = {
      deleteRejectedFileObjects: jest.fn().mockResolvedValue({
        attemptedObjectCount: 2,
        deletedObjectCount: 1,
        failedObjectDeletionCount: 1,
      }),
    } as unknown as FilesService;
    const controller = new FilesController(service);

    await expect(
      controller.deleteRejectedFileObjects({
        headers: { 'x-request-id': 'req_file_delete_rejected' },
        currentUser: {
          id: 'admin-1',
          phone: '13900139000',
          userType: 'admin',
        },
      } as AuthenticatedRequest),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        attemptedObjectCount: 2,
        deletedObjectCount: 1,
        failedObjectDeletionCount: 1,
      },
      requestId: 'req_file_delete_rejected',
    });
    expect(service.deleteRejectedFileObjects).toHaveBeenCalledWith();
  });

  it('runs file maintenance batch governance through an admin endpoint', async () => {
    const service = {
      runMaintenanceBatchGovernance: jest.fn().mockResolvedValue({
        action: 'reject_pending',
        requestedCount: 3,
        matchedCount: 2,
        processedCount: 1,
        skippedFileIds: ['file-2'],
        deletedObjectCount: 1,
        failedObjectDeletionCount: 0,
      }),
    } as unknown as FilesService;
    const controller = new FilesController(service);

    await expect(
      controller.runMaintenanceBatchGovernance(
        {
          headers: { 'x-request-id': 'req_file_batch_governance' },
          currentUser: {
            id: 'admin-1',
            phone: '13900139000',
            userType: 'admin',
          },
        } as AuthenticatedRequest,
        {
          action: 'reject_pending',
          fileIds: [' file-1 ', 'file-2', 'file-1'],
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        action: 'reject_pending',
        requestedCount: 3,
        matchedCount: 2,
        processedCount: 1,
        skippedFileIds: ['file-2'],
        deletedObjectCount: 1,
        failedObjectDeletionCount: 0,
      },
      requestId: 'req_file_batch_governance',
    });
    expect(service.runMaintenanceBatchGovernance).toHaveBeenCalledWith({
      action: 'reject_pending',
      fileIds: ['file-1', 'file-2'],
    });
  });

  it('routes file maintenance list requests before file id metadata routes', async () => {
    const service = {
      listMaintenanceFiles: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
      getFileMetadata: jest.fn(),
    } as unknown as FilesService;
    const authService = {
      getCurrentUser: jest.fn().mockResolvedValue({
        id: 'admin-1',
        phone: '13900139000',
        userType: 'admin',
      }),
    };
    const app = await createFilesControllerTestApp(service, authService);

    try {
      const response = await fetch(
        `${await app.getUrl()}/files/maintenance/files?page=1&pageSize=20`,
        {
          headers: {
            authorization: 'Bearer access.admin-1.900',
            'x-request-id': 'req_file_list_http',
          },
        },
      );

      await expect(response.json()).resolves.toMatchObject({
        code: 'OK',
        data: {
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
        },
        requestId: 'req_file_list_http',
      });
      expect(response.status).toBe(200);
      expect(service.listMaintenanceFiles).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
      });
      expect(service.getFileMetadata).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('routes file maintenance summary requests before file id metadata routes', async () => {
    const service = {
      getMaintenanceSummary: jest.fn().mockResolvedValue({
        totalCount: 3,
        pendingCount: 2,
        uploadedCount: 1,
        rejectedCount: 0,
        expiredPendingCount: 1,
        cutoffIso: '2026-07-06T03:05:00.000Z',
      }),
      getFileMetadata: jest.fn(),
    } as unknown as FilesService;
    const authService = {
      getCurrentUser: jest.fn().mockResolvedValue({
        id: 'admin-1',
        phone: '13900139000',
        userType: 'admin',
      }),
    };
    const app = await createFilesControllerTestApp(service, authService);

    try {
      const response = await fetch(
        `${await app.getUrl()}/files/maintenance/summary`,
        {
          headers: {
            authorization: 'Bearer access.admin-1.900',
            'x-request-id': 'req_file_summary_http',
          },
        },
      );

      await expect(response.json()).resolves.toMatchObject({
        code: 'OK',
        data: {
          totalCount: 3,
          expiredPendingCount: 1,
        },
        requestId: 'req_file_summary_http',
      });
      expect(response.status).toBe(200);
      expect(service.getMaintenanceSummary).toHaveBeenCalledWith();
      expect(service.getFileMetadata).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('routes file maintenance report requests before file id metadata routes', async () => {
    const service = {
      getMaintenanceReport: jest.fn().mockResolvedValue({
        generatedAtIso: '2026-07-18T09:00:00.000Z',
        cutoffIso: '2026-07-18T08:45:00.000Z',
        purposeBreakdown: [],
        topOwners: [],
      }),
      getFileMetadata: jest.fn(),
    } as unknown as FilesService;
    const authService = {
      getCurrentUser: jest.fn().mockResolvedValue({
        id: 'admin-1',
        phone: '13900139000',
        userType: 'admin',
      }),
    };
    const app = await createFilesControllerTestApp(service, authService);

    try {
      const response = await fetch(
        `${await app.getUrl()}/files/maintenance/report?topOwnersLimit=6`,
        {
          headers: {
            authorization: 'Bearer access.admin-1.900',
            'x-request-id': 'req_file_report_http',
          },
        },
      );

      await expect(response.json()).resolves.toMatchObject({
        code: 'OK',
        data: {
          generatedAtIso: '2026-07-18T09:00:00.000Z',
          purposeBreakdown: [],
          topOwners: [],
        },
        requestId: 'req_file_report_http',
      });
      expect(response.status).toBe(200);
      expect(service.getMaintenanceReport).toHaveBeenCalledWith({
        topOwnersLimit: 6,
      });
      expect(service.getFileMetadata).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('routes S3 compatible storage callback requests without bearer auth', async () => {
    const callback = {
      fileId: 'file-1',
      objectKey: 'user-1/cargo/file-1.jpg',
      byteSize: 1024,
      contentType: 'image/jpeg',
      etag: '"etag-1"',
      versionId: 'version-1',
      signature: 'signature-value',
    };
    const service = {
      confirmStorageCallback: jest.fn().mockResolvedValue({
        id: 'file-1',
        ownerUserId: 'user-1',
        purpose: 'cargo',
        contentType: 'image/jpeg',
        byteSize: 1024,
        objectKey: 'user-1/cargo/file-1.jpg',
        etag: '"etag-1"',
        versionId: 'version-1',
        status: 'uploaded',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    } as unknown as FilesService;
    const app = await createFilesControllerTestApp(service);

    try {
      const response = await fetch(
        `${await app.getUrl()}/files/storage-callbacks/s3-compatible`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req_storage_callback_http',
          },
          body: JSON.stringify(callback),
        },
      );

      await expect(response.json()).resolves.toMatchObject({
        code: 'OK',
        data: {
          id: 'file-1',
          status: 'uploaded',
          etag: '"etag-1"',
          versionId: 'version-1',
        },
        requestId: 'req_storage_callback_http',
      });
      expect(response.status).toBe(200);
      expect(service.confirmStorageCallback).toHaveBeenCalledWith(callback);
    } finally {
      await app.close();
    }
  });

  it('returns a business error response for invalid storage callback signatures', async () => {
    const service = {
      confirmStorageCallback: jest
        .fn()
        .mockRejectedValue(
          new BusinessError(
            ApiErrorCode.FILE_STORAGE_CALLBACK_INVALID,
            '对象存储回调签名无效',
          ),
        ),
    } as unknown as FilesService;
    const app = await createFilesControllerTestApp(service);

    try {
      const response = await fetch(
        `${await app.getUrl()}/files/storage-callbacks/s3-compatible`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req_storage_callback_invalid',
          },
          body: JSON.stringify({
            fileId: 'file-1',
            objectKey: 'user-1/cargo/file-1.jpg',
            byteSize: 1024,
            contentType: 'image/jpeg',
            signature: 'bad-signature',
          }),
        },
      );

      await expect(response.json()).resolves.toMatchObject({
        code: 'FILE_STORAGE_CALLBACK_INVALID',
        message: '对象存储回调签名无效',
        requestId: 'req_storage_callback_invalid',
      });
      expect(response.status).toBe(400);
    } finally {
      await app.close();
    }
  });


  it('stores a current user local upload target request body', async () => {
    const service = {
      uploadLocalFile: jest.fn().mockResolvedValue({
        id: 'file-1',
        ownerUserId: 'user-1',
        purpose: 'identity',
        objectKey: 'user-1/identity/file-1.png',
        status: 'uploaded',
        publicUrl: 'http://localhost:3000/api/files/previews/user-1/identity/file-1.png',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    } as unknown as FilesService;
    const controller = new FilesController(service);
    const request = createReadableRequest('user-1', [
      Buffer.from('front-bytes'),
    ]);

    await expect(
      controller.uploadLocalFile(request, 'file-1'),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'file-1',
        status: 'uploaded',
      },
      requestId: 'req_files_test',
    });
    expect(service.uploadLocalFile).toHaveBeenCalledWith(
      'user-1',
      'file-1',
      Buffer.from('front-bytes'),
    );
  });

  it('gets current user file metadata', async () => {
    const service = {
      getFileMetadata: jest.fn().mockResolvedValue({
        id: 'file-1',
        ownerUserId: 'user-1',
        purpose: 'cargo',
        contentType: 'image/jpeg',
        byteSize: 1024,
        objectKey: 'user-1/cargo/file-1.jpg',
        status: 'uploaded',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    } as unknown as FilesService;
    const controller = new FilesController(service);

    await expect(
      controller.getFileMetadata(createRequest('user-1'), 'file-1'),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'file-1',
        ownerUserId: 'user-1',
        status: 'uploaded',
      },
      requestId: 'req_files_test',
    });
    expect(service.getFileMetadata).toHaveBeenCalledWith(
      { id: 'user-1', phone: '13900139001', userType: 'shipper' },
      'file-1',
    );
  });

  it('returns signed preview metadata without requiring a current user', async () => {
    const service = {
      getPreviewMetadataByObjectKey: jest.fn().mockResolvedValue({
        id: 'file-1',
        ownerUserId: 'driver-1',
        purpose: 'identity',
        objectKey: 'driver-1/identity/front.png',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/driver-1/identity/front.png',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    } as unknown as FilesService;
    const controller = new FilesController(service);

    await expect(
      controller.getPreviewMetadata('driver-1/identity/front.png', {
        expiresAtIso: '2026-07-06T03:10:00.000Z',
        signature: 'valid-signature',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'file-1',
        objectKey: 'driver-1/identity/front.png',
        status: 'uploaded',
      },
    });
    expect(service.getPreviewMetadataByObjectKey).toHaveBeenCalledWith(
      'driver-1/identity/front.png',
      {
        expiresAtIso: '2026-07-06T03:10:00.000Z',
        signature: 'valid-signature',
      },
    );
  });

  it('returns signed preview content bytes without requiring a current user', async () => {
    const content = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const service = {
      getPreviewContentByObjectKey: jest.fn().mockResolvedValue({
        file: {
          id: 'file-1',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          contentType: 'image/png',
          byteSize: content.length,
          objectKey: 'driver-1/identity/front.png',
          status: 'uploaded',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        },
        content,
      }),
    } as unknown as FilesService;
    const controller = new FilesController(service);

    const result = await controller.getPreviewContent(
      'driver-1/identity/front.png',
      {
        expiresAtIso: '2026-07-06T03:10:00.000Z',
        signature: 'valid-signature',
      },
    );

    expect(result).toBeInstanceOf(StreamableFile);
    expect(service.getPreviewContentByObjectKey).toHaveBeenCalledWith(
      'driver-1/identity/front.png',
      {
        expiresAtIso: '2026-07-06T03:10:00.000Z',
        signature: 'valid-signature',
      },
    );
  });

  it('protects authenticated file operations while leaving signed previews public', () => {
    expect(getGuards(FilesController)).toEqual([]);
    expect(getGuards(FilesController.prototype.createUploadIntent)).toEqual([
      AccessTokenGuard,
    ]);
    expect(getGuards(FilesController.prototype.getFileMetadata)).toEqual([
      AccessTokenGuard,
    ]);
    expect(getGuards(FilesController.prototype.confirmUploaded)).toEqual([
      AccessTokenGuard,
    ]);
    expect(getGuards(FilesController.prototype.uploadLocalFile)).toEqual([
      AccessTokenGuard,
    ]);
    expect(
      getGuards(FilesController.prototype.rejectExpiredPendingFiles),
    ).toEqual([AccessTokenGuard, AdminOnlyGuard]);
    expect(getGuards(FilesController.prototype.getMaintenanceSummary)).toEqual([
      AccessTokenGuard,
      AdminOnlyGuard,
    ]);
    expect(getGuards(FilesController.prototype.getMaintenanceReport)).toEqual([
      AccessTokenGuard,
      AdminOnlyGuard,
    ]);
    expect(getGuards(FilesController.prototype.listMaintenanceFiles)).toEqual([
      AccessTokenGuard,
      AdminOnlyGuard,
    ]);
    expect(
      getGuards(FilesController.prototype.runMaintenanceBatchGovernance),
    ).toEqual([AccessTokenGuard, AdminOnlyGuard]);
    expect(
      getGuards(FilesController.prototype.deleteRejectedFileObjects),
    ).toEqual([AccessTokenGuard, AdminOnlyGuard]);
    expect(getGuards(FilesController.prototype.confirmStorageCallback)).toEqual(
      [],
    );
    expect(getGuards(FilesController.prototype.getPreviewMetadata)).toEqual([]);
  });

  it('routes signed preview metadata requests with slash-separated object keys', async () => {
    const service = {
      getPreviewMetadataByObjectKey: jest.fn().mockResolvedValue({
        id: 'file-1',
        ownerUserId: 'driver-1',
        purpose: 'identity',
        objectKey: 'driver-1/identity/front.png',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/driver-1/identity/front.png',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    } as unknown as FilesService;
    const app = await createFilesControllerTestApp(service);
    const query = new URLSearchParams({
      expiresAtIso: '2026-07-06T03:10:00.000Z',
      signature: 'valid-signature',
    });

    try {
      const response = await fetch(
        `${await app.getUrl()}/files/previews/driver-1/identity/front.png?${query.toString()}`,
        {
          headers: {
            'x-request-id': 'req_preview_http',
          },
        },
      );

      await expect(response.json()).resolves.toMatchObject({
        code: 'OK',
        data: {
          id: 'file-1',
          objectKey: 'driver-1/identity/front.png',
        },
        requestId: 'req_preview_http',
      });
      expect(response.status).toBe(200);
      expect(service.getPreviewMetadataByObjectKey).toHaveBeenCalledWith(
        'driver-1/identity/front.png',
        {
          expiresAtIso: '2026-07-06T03:10:00.000Z',
          signature: 'valid-signature',
        },
      );
    } finally {
      await app.close();
    }
  });

  it('routes signed preview content requests with slash-separated object keys', async () => {
    const content = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const service = {
      getPreviewContentByObjectKey: jest.fn().mockResolvedValue({
        file: {
          id: 'file-1',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          contentType: 'image/png',
          byteSize: content.length,
          objectKey: 'driver-1/identity/front.png',
          status: 'uploaded',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        },
        content,
      }),
    } as unknown as FilesService;
    const app = await createFilesControllerTestApp(service);
    const query = new URLSearchParams({
      expiresAtIso: '2026-07-06T03:10:00.000Z',
      signature: 'valid-signature',
    });

    try {
      const response = await fetch(
        `${await app.getUrl()}/files/preview-contents/driver-1/identity/front.png?${query.toString()}`,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(content);
      expect(service.getPreviewContentByObjectKey).toHaveBeenCalledWith(
        'driver-1/identity/front.png',
        {
          expiresAtIso: '2026-07-06T03:10:00.000Z',
          signature: 'valid-signature',
        },
      );
    } finally {
      await app.close();
    }
  });

  it('routes local upload target confirmation requests through the access token guard', async () => {
    const service = {
      uploadLocalFile: jest.fn().mockResolvedValue({
        id: 'file-1',
        ownerUserId: 'user-1',
        purpose: 'identity',
        objectKey: 'user-1/identity/front.png',
        status: 'uploaded',
        publicUrl: 'http://localhost:3000/api/files/previews/user-1/identity/front.png',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    } as unknown as FilesService;
    const authService = {
      getCurrentUser: jest.fn().mockResolvedValue({
        id: 'user-1',
        phone: '13900139001',
        userType: 'shipper',
      }),
    };
    const app = await createFilesControllerTestApp(service, authService);

    try {
      const response = await fetch(`${await app.getUrl()}/files/uploads/file-1`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer access.user-1.900',
          'content-type': 'application/octet-stream',
          'x-request-id': 'req_local_upload_http',
        },
        body: Buffer.from('front-bytes'),
      });

      await expect(response.json()).resolves.toMatchObject({
        code: 'OK',
        data: {
          id: 'file-1',
          status: 'uploaded',
        },
        requestId: 'req_local_upload_http',
      });
      expect(response.status).toBe(201);
      expect(authService.getCurrentUser).toHaveBeenCalledWith(
        'access.user-1.900',
      );
      expect(service.uploadLocalFile).toHaveBeenCalledWith(
        'user-1',
        'file-1',
        Buffer.from('front-bytes'),
      );
    } finally {
      await app.close();
    }
  });
});

function createRequest(userId: string): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_files_test' },
    currentUser: { id: userId, phone: '13900139001', userType: 'shipper' },
  };
}

function createReadableRequest(
  userId: string,
  chunks: Buffer[],
): AuthenticatedRequest & AsyncIterable<Buffer> {
  return {
    ...createRequest(userId),
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

function getGuards(target: unknown) {
  return Reflect.getMetadata(GUARDS_METADATA, target as object) ?? [];
}

async function createFilesControllerTestApp(
  service: FilesService,
  authService: Pick<AuthService, 'getCurrentUser'> | Record<string, never> = {},
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [FilesController],
    providers: [
      { provide: FilesService, useValue: service },
      { provide: AuthService, useValue: authService },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalFilters(new BusinessErrorFilter());
  await app.listen(0);

  return app;
}
