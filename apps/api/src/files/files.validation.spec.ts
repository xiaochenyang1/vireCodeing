import { ZodError } from 'zod';
import {
  parseFileMaintenanceReportQuery,
  parseConfirmFileUploadedRequest,
  parseConfirmStorageCallbackRequest,
  parseCreateFileUploadIntentRequest,
  parseListMaintenanceFilesQuery,
  parseRunFileMaintenanceBatchGovernanceRequest,
} from './files.validation';

describe('files validation', () => {
  it('normalizes a file upload intent request', () => {
    expect(
      parseCreateFileUploadIntentRequest({
        purpose: 'identity',
        fileName: ' 身份证正面.png ',
        contentType: ' Image/PNG ',
        byteSize: 2048,
      }),
    ).toEqual({
      purpose: 'identity',
      fileName: '身份证正面.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
  });

  it('accepts evaluation files as first-class upload intent purpose', () => {
    expect(
      parseCreateFileUploadIntentRequest({
        purpose: 'evaluation',
        fileName: '评价图片.png',
        contentType: 'image/png',
        byteSize: 2048,
      }),
    ).toEqual({
      purpose: 'evaluation',
      fileName: '评价图片.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
  });

  it('accepts avatar files as first-class upload intent purpose', () => {
    expect(
      parseCreateFileUploadIntentRequest({
        purpose: 'avatar',
        fileName: '头像.png',
        contentType: 'image/png',
        byteSize: 2048,
      }),
    ).toEqual({
      purpose: 'avatar',
      fileName: '头像.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
  });

  it('rejects invalid file upload intent requests', () => {
    const validRequest = {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    };

    for (const request of [
      { ...validRequest, purpose: 'unknown-purpose' },
      { ...validRequest, fileName: ' ' },
      { ...validRequest, contentType: 'text/plain' },
      { ...validRequest, byteSize: 0 },
      { ...validRequest, byteSize: 10 * 1024 * 1024 + 1 },
    ]) {
      expect(() => parseCreateFileUploadIntentRequest(request)).toThrow(
        ZodError,
      );
    }
  });

  it('normalizes an optional uploaded public url', () => {
    expect(
      parseConfirmFileUploadedRequest({
        publicUrl: ' https://cdn.example.com/files/a.png ',
      }),
    ).toEqual({
      publicUrl: 'https://cdn.example.com/files/a.png',
    });

    expect(parseConfirmFileUploadedRequest({ publicUrl: ' ' })).toEqual({});
  });

  it('rejects invalid uploaded public urls', () => {
    expect(() =>
      parseConfirmFileUploadedRequest({ publicUrl: 'ftp://example.com/a.png' }),
    ).toThrow(ZodError);
  });

  it('normalizes a storage callback confirmation request', () => {
    expect(
      parseConfirmStorageCallbackRequest({
        fileId: ' file-1 ',
        objectKey: ' user-1/cargo/file.jpg ',
        byteSize: 1024,
        contentType: ' Image/JPEG ',
        etag: ' "abc123" ',
        versionId: ' version-1 ',
        signature: ' signature-value ',
      }),
    ).toEqual({
      fileId: 'file-1',
      objectKey: 'user-1/cargo/file.jpg',
      byteSize: 1024,
      contentType: 'image/jpeg',
      etag: '"abc123"',
      versionId: 'version-1',
      signature: 'signature-value',
    });
  });

  it('rejects invalid storage callback confirmation requests', () => {
    const validRequest = {
      fileId: 'file-1',
      objectKey: 'user-1/cargo/file.jpg',
      byteSize: 1024,
      contentType: 'image/jpeg',
      signature: 'signature-value',
    };

    for (const request of [
      { ...validRequest, fileId: '' },
      { ...validRequest, objectKey: '' },
      { ...validRequest, byteSize: 0 },
      { ...validRequest, contentType: 'text/plain' },
      { ...validRequest, signature: '' },
      { ...validRequest, fileId: 'f'.repeat(121) },
      { ...validRequest, objectKey: 'o'.repeat(513) },
      { ...validRequest, etag: 'e'.repeat(257) },
      { ...validRequest, versionId: 'v'.repeat(257) },
      { ...validRequest, signature: 'a'.repeat(129) },
    ]) {
      expect(() => parseConfirmStorageCallbackRequest(request)).toThrow(
        ZodError,
      );
    }
  });

  it('normalizes a file maintenance list query and defaults paging', () => {
    expect(
      parseListMaintenanceFilesQuery({
        status: 'pending',
        purpose: 'identity',
        ownerUserId: ' user-1 ',
        keyword: ' front ',
        page: '2',
        pageSize: '10',
      }),
    ).toEqual({
      status: 'pending',
      purpose: 'identity',
      ownerUserId: 'user-1',
      keyword: 'front',
      page: 2,
      pageSize: 10,
    });

    expect(parseListMaintenanceFilesQuery({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('rejects invalid file maintenance list queries', () => {
    for (const query of [
      { page: 0 },
      { pageSize: 0 },
      { pageSize: 51 },
      { status: 'archived' },
      { purpose: 'unknown-purpose' },
      { ownerUserId: 'u'.repeat(121) },
      { keyword: 'k'.repeat(121) },
    ]) {
      expect(() => parseListMaintenanceFilesQuery(query)).toThrow(ZodError);
    }
  });

  it('normalizes a file maintenance batch governance request and deduplicates file ids', () => {
    expect(
      parseRunFileMaintenanceBatchGovernanceRequest({
        action: 'reject_pending',
        fileIds: [' file-1 ', 'file-2', 'file-1'],
      }),
    ).toEqual({
      action: 'reject_pending',
      fileIds: ['file-1', 'file-2'],
    });
  });

  it('rejects invalid file maintenance batch governance requests', () => {
    for (const request of [
      {},
      { action: 'reject_pending', fileIds: [] },
      { action: 'delete_all', fileIds: ['file-1'] },
      { action: 'delete_rejected_objects', fileIds: [''] },
      {
        action: 'delete_rejected_objects',
        fileIds: Array.from({ length: 51 }, (_, index) => `file-${index + 1}`),
      },
      {
        action: 'delete_rejected_objects',
        fileIds: ['f'.repeat(121)],
      },
    ]) {
      expect(() => parseRunFileMaintenanceBatchGovernanceRequest(request)).toThrow(
        ZodError,
      );
    }
  });

  it('normalizes a file maintenance report query and defaults top owner limit', () => {
    expect(
      parseFileMaintenanceReportQuery({
        topOwnersLimit: '8',
      }),
    ).toEqual({
      topOwnersLimit: 8,
    });

    expect(parseFileMaintenanceReportQuery({})).toEqual({
      topOwnersLimit: 5,
    });
  });

  it('rejects invalid file maintenance report queries', () => {
    for (const query of [
      { topOwnersLimit: 0 },
      { topOwnersLimit: 21 },
      { topOwnersLimit: '1.2' },
      { topOwnersLimit: 'nope' },
    ]) {
      expect(() => parseFileMaintenanceReportQuery(query)).toThrow(ZodError);
    }
  });
});
