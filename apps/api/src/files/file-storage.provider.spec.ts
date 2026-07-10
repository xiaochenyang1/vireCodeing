import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FileUploadRecord } from './dto';
import {
  LocalFileStorageProvider,
  S3CompatibleFileStorageProvider,
} from './file-storage.provider';

describe('LocalFileStorageProvider', () => {
  const file: FileUploadRecord = {
    id: 'file-1',
    ownerUserId: 'user-1',
    purpose: 'identity',
    contentType: 'image/png',
    byteSize: 11,
    objectKey: 'user-1/identity/front.png',
    status: 'pending',
    createdAtIso: '2026-07-07T00:00:00.000Z',
  };

  it('creates local upload targets and public urls', () => {
    const provider = new LocalFileStorageProvider({
      uploadUrlBase: 'http://localhost:3000/api/files/uploads/',
      publicUrlBase: 'https://cdn.example.com/',
    });

    expect(provider.createPublicUrl(file.objectKey)).toBe(
      'https://cdn.example.com/user-1/identity/front.png',
    );
    expect(
      provider.createUploadTarget(file, '2026-07-07T00:15:00.000Z'),
    ).toEqual({
      uploadUrl: 'http://localhost:3000/api/files/uploads/file-1',
      publicUrl: 'https://cdn.example.com/user-1/identity/front.png',
      expiresAtIso: '2026-07-07T00:15:00.000Z',
    });
  });

  it('uses the API local upload endpoint when upload base is omitted', () => {
    const provider = new LocalFileStorageProvider();

    expect(
      provider.createUploadTarget(file, '2026-07-07T00:15:00.000Z'),
    ).toEqual({
      uploadUrl: '/api/files/uploads/file-1',
      expiresAtIso: '2026-07-07T00:15:00.000Z',
    });
  });

  it('stores uploaded bytes under the configured local storage root', async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), 'truck-files-'));
    const provider = new LocalFileStorageProvider({ storageRoot });

    try {
      await provider.saveUploadedFile(file, Buffer.from('front-bytes'));

      await expect(
        readFile(join(storageRoot, 'user-1', 'identity', 'front.png'), 'utf8'),
      ).resolves.toBe('front-bytes');
      await expect(provider.readUploadedFile(file)).resolves.toEqual(
        Buffer.from('front-bytes'),
      );
    } finally {
      await rm(storageRoot, { recursive: true, force: true });
    }
  });

  it('deletes local storage objects without escaping the storage root', async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), 'truck-files-'));
    const provider = new LocalFileStorageProvider({ storageRoot });

    try {
      await provider.saveUploadedFile(file, Buffer.from('front-bytes'));
      await provider.deleteObject(file);

      await expect(
        readFile(join(storageRoot, 'user-1', 'identity', 'front.png'), 'utf8'),
      ).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(storageRoot, { recursive: true, force: true });
    }
  });
});

describe('S3CompatibleFileStorageProvider', () => {
  const file: FileUploadRecord = {
    id: 'file-1',
    ownerUserId: 'user-1',
    purpose: 'cargo',
    contentType: 'image/jpeg',
    byteSize: 1024,
    objectKey: 'user-1/cargo/20260707000000000/cargo photo.jpg',
    status: 'pending',
    createdAtIso: '2026-07-07T00:00:00.000Z',
  };

  it('creates path-style S3 compatible signed upload targets', () => {
    const provider = new S3CompatibleFileStorageProvider({
      endpoint: 'https://s3.example.com',
      region: 'cn-north-1',
      bucket: 'truck-files',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      forcePathStyle: true,
      publicUrlBase: 'https://cdn.example.com/files/',
      now: () => new Date('2026-07-07T00:00:00.000Z'),
    });

    const target = provider.createUploadTarget(
      file,
      '2026-07-07T00:15:00.000Z',
    );
    const uploadUrl = new URL(target.uploadUrl);

    expect(uploadUrl.origin).toBe('https://s3.example.com');
    expect(uploadUrl.pathname).toBe(
      '/truck-files/user-1/cargo/20260707000000000/cargo%20photo.jpg',
    );
    expect(uploadUrl.searchParams.get('X-Amz-Algorithm')).toBe(
      'AWS4-HMAC-SHA256',
    );
    expect(uploadUrl.searchParams.get('X-Amz-Credential')).toBe(
      'test-access-key/20260707/cn-north-1/s3/aws4_request',
    );
    expect(uploadUrl.searchParams.get('X-Amz-Date')).toBe('20260707T000000Z');
    expect(uploadUrl.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(uploadUrl.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(uploadUrl.searchParams.get('X-Amz-Signature')).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(target.publicUrl).toBe(
      'https://cdn.example.com/files/user-1/cargo/20260707000000000/cargo photo.jpg',
    );
  });

  it('creates virtual-hosted S3 compatible signed upload targets', () => {
    const provider = new S3CompatibleFileStorageProvider({
      endpoint: 'https://s3.example.com',
      region: 'us-east-1',
      bucket: 'truck-files',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      forcePathStyle: false,
      now: () => new Date('2026-07-07T00:00:00.000Z'),
    });

    const uploadUrl = new URL(
      provider.createUploadTarget(file, '2026-07-07T00:10:00.000Z')
        .uploadUrl,
    );

    expect(uploadUrl.origin).toBe('https://truck-files.s3.example.com');
    expect(uploadUrl.pathname).toBe(
      '/user-1/cargo/20260707000000000/cargo%20photo.jpg',
    );
    expect(uploadUrl.searchParams.get('X-Amz-Expires')).toBe('600');
  });

  it('does not expose local byte operations for S3 compatible storage', async () => {
    const provider = new S3CompatibleFileStorageProvider({
      endpoint: 'https://s3.example.com',
      region: 'cn-north-1',
      bucket: 'truck-files',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      now: () => new Date('2026-07-07T00:00:00.000Z'),
    });

    await expect(
      provider.saveUploadedFile(file, Buffer.from('bytes')),
    ).rejects.toThrow(
      'S3 compatible storage does not support local byte uploads',
    );
    await expect(provider.readUploadedFile(file)).rejects.toThrow(
      'S3 compatible storage does not support local byte reads',
    );
  });

  it('verifies uploaded S3 compatible objects with a signed HEAD request', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => {
          const headers: Record<string, string> = {
            'content-length': '1024',
            'content-type': 'image/jpeg',
          };

          return headers[name.toLowerCase()] ?? null;
        },
      },
    });
    const provider = new S3CompatibleFileStorageProvider({
      endpoint: 'https://s3.example.com',
      region: 'cn-north-1',
      bucket: 'truck-files',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      forcePathStyle: true,
      now: () => new Date('2026-07-07T00:00:00.000Z'),
      fetcher,
    });

    await expect(provider.verifyUploadedFile(file)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/truck-files/user-1/cargo/'),
      { method: 'HEAD' },
    );
    const signedHeadUrl = new URL(fetcher.mock.calls[0][0]);

    expect(signedHeadUrl.searchParams.get('X-Amz-Algorithm')).toBe(
      'AWS4-HMAC-SHA256',
    );
    expect(signedHeadUrl.searchParams.get('X-Amz-Signature')).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it('deletes S3 compatible objects with a signed DELETE request', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: {
        get: () => null,
      },
    });
    const provider = new S3CompatibleFileStorageProvider({
      endpoint: 'https://s3.example.com',
      region: 'cn-north-1',
      bucket: 'truck-files',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      forcePathStyle: true,
      now: () => new Date('2026-07-07T00:00:00.000Z'),
      fetcher,
    });

    await expect(provider.deleteObject(file)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/truck-files/user-1/cargo/'),
      { method: 'DELETE' },
    );
    const signedDeleteUrl = new URL(fetcher.mock.calls[0][0]);

    expect(signedDeleteUrl.searchParams.get('X-Amz-Algorithm')).toBe(
      'AWS4-HMAC-SHA256',
    );
    expect(signedDeleteUrl.searchParams.get('X-Amz-Signature')).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it('rejects S3 compatible confirmation when the remote object metadata mismatches', async () => {
    const provider = new S3CompatibleFileStorageProvider({
      endpoint: 'https://s3.example.com',
      region: 'cn-north-1',
      bucket: 'truck-files',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      now: () => new Date('2026-07-07T00:00:00.000Z'),
      fetcher: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            const headers: Record<string, string> = {
              'content-length': '2',
              'content-type': 'image/jpeg',
            };

            return headers[name.toLowerCase()] ?? null;
          },
        },
      }),
    });

    await expect(provider.verifyUploadedFile(file)).rejects.toThrow(
      'Remote object byte size does not match upload intent',
    );
  });
});
