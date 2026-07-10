import { LocalFilePreviewUrlSigner } from './file-preview-url.signer';
import type { FileUploadRecord } from './dto';

describe('LocalFilePreviewUrlSigner', () => {
  const now = new Date('2026-07-06T08:00:00.000Z');

  it('creates a stable signed preview url through the local preview endpoint even when public url exists', () => {
    const signer = new LocalFilePreviewUrlSigner({
      now: () => now,
      previewUrlBase: 'https://files.example.com/previews',
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-secret',
    });

    expect(
      signer.signPreviewUrl(createFile({ publicUrl: 'https://cdn.example.com/a.png' })),
    ).toEqual({
      previewUrl:
        'https://files.example.com/previews/driver-1/identity/front.png?expiresAtIso=2026-07-06T08%3A10%3A00.000Z&signature=0dd93e84143d267ca72fc3f1804ae53c97655cec05929a2e88401f22718c75fe',
      previewExpiresAtIso: '2026-07-06T08:10:00.000Z',
    });
  });

  it('falls back to preview base url and object key when public url is missing', () => {
    const signer = new LocalFilePreviewUrlSigner({
      now: () => now,
      previewUrlBase: 'https://files.example.com/previews',
      previewExpiresInSeconds: 300,
      signingSecret: 'unit-test-secret',
    });

    expect(signer.signPreviewUrl(createFile())).toEqual({
      previewUrl:
        'https://files.example.com/previews/driver-1/identity/front.png?expiresAtIso=2026-07-06T08%3A05%3A00.000Z&signature=92ad73eab5d5a99628f721aff86b9d439b0335d31e275c3bf733645ff52f449d',
      previewExpiresAtIso: '2026-07-06T08:05:00.000Z',
    });
  });

  it('defaults signed preview urls to the local binary preview content endpoint', () => {
    const signer = new LocalFilePreviewUrlSigner({
      now: () => now,
      previewExpiresInSeconds: 300,
      signingSecret: 'unit-test-secret',
    });

    expect(signer.signPreviewUrl(createFile()).previewUrl).toBe(
      '/api/files/preview-contents/driver-1/identity/front.png?expiresAtIso=2026-07-06T08%3A05%3A00.000Z&signature=92ad73eab5d5a99628f721aff86b9d439b0335d31e275c3bf733645ff52f449d',
    );
  });

  it('encodes each object key path segment in generated preview urls', () => {
    const signer = new LocalFilePreviewUrlSigner({
      now: () => now,
      previewUrlBase: 'https://files.example.com/previews/',
      previewExpiresInSeconds: 300,
      signingSecret: 'unit-test-secret',
    });

    expect(
      signer.signPreviewUrl(
        createFile({
          objectKey: 'driver 1/identity/身份证 正面#1.png',
        }),
      ),
    ).toEqual({
      previewUrl:
        'https://files.example.com/previews/driver%201/identity/%E8%BA%AB%E4%BB%BD%E8%AF%81%20%E6%AD%A3%E9%9D%A2%231.png?expiresAtIso=2026-07-06T08%3A05%3A00.000Z&signature=195f765bf7443ad6e28e9a1c765a6301b64911f59e37967de4eefc00efff9191',
      previewExpiresAtIso: '2026-07-06T08:05:00.000Z',
    });
  });

  it('verifies generated preview signatures before they expire', () => {
    const signer = new LocalFilePreviewUrlSigner({
      now: () => now,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-secret',
    });
    const file = createFile();
    const signed = signer.signPreviewUrl(file);
    const signature = getSignatureParam(signed.previewUrl);

    expect(
      signer.verifyPreviewUrl(file, {
        expiresAtIso: signed.previewExpiresAtIso,
        signature,
      }),
    ).toBe(true);
  });

  it('rejects tampered or expired preview signatures', () => {
    const signer = new LocalFilePreviewUrlSigner({
      now: () => now,
      previewExpiresInSeconds: 600,
      signingSecret: 'unit-test-secret',
    });

    expect(
      signer.verifyPreviewUrl(createFile(), {
        expiresAtIso: '2026-07-06T08:10:00.000Z',
        signature: 'bad-signature',
      }),
    ).toBe(false);

    expect(
      signer.verifyPreviewUrl(createFile(), {
        expiresAtIso: '2026-07-06T07:59:59.999Z',
        signature:
          '6cf8fb4eb4643574535033058df1ed72db357e42f9cd050e245841d78bef7f32',
      }),
    ).toBe(false);
  });
});

function createFile(overrides: Partial<FileUploadRecord> = {}): FileUploadRecord {
  return {
    id: 'file-front',
    ownerUserId: 'driver-1',
    purpose: 'identity',
    contentType: 'image/png',
    byteSize: 2048,
    objectKey: 'driver-1/identity/front.png',
    status: 'uploaded',
    createdAtIso: '2026-07-06T07:55:00.000Z',
    ...overrides,
  };
}

function getSignatureParam(previewUrl: string) {
  return new URL(previewUrl, 'https://local.test').searchParams.get(
    'signature',
  )!;
}
