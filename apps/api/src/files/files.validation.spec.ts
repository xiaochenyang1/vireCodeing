import { ZodError } from 'zod';
import {
  parseConfirmFileUploadedRequest,
  parseConfirmStorageCallbackRequest,
  parseCreateFileUploadIntentRequest,
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

  it('rejects invalid file upload intent requests', () => {
    const validRequest = {
      purpose: 'cargo',
      fileName: 'cargo.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
    };

    for (const request of [
      { ...validRequest, purpose: 'avatar' },
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
});
