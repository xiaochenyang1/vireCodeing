import { createFilePreviewUrlSignerConfigFromEnv } from '../files/file-preview-url.config';

describe('DriverCertificationModule file preview signer config', () => {
  it('builds file preview signer config from environment values', () => {
    expect(
      createFilePreviewUrlSignerConfigFromEnv({
        NODE_ENV: 'test',
        FILE_PREVIEW_URL_BASE: 'https://files.example.com/previews',
        FILE_PREVIEW_EXPIRES_IN_SECONDS: '300',
        FILE_PREVIEW_SIGNING_SECRET: 'test-file-preview-secret',
      }),
    ).toEqual({
      previewUrlBase: 'https://files.example.com/previews',
      previewExpiresInSeconds: 300,
      signingSecret: 'test-file-preview-secret',
    });
  });

  it('rejects production config without a file preview signing secret', () => {
    expect(() =>
      createFilePreviewUrlSignerConfigFromEnv({
        NODE_ENV: 'production',
      }),
    ).toThrow('FILE_PREVIEW_SIGNING_SECRET is required in production');
  });

  it('rejects weak file preview signing secrets in production', () => {
    expect(() =>
      createFilePreviewUrlSignerConfigFromEnv({
        NODE_ENV: 'production',
        FILE_PREVIEW_SIGNING_SECRET: 'short-secret',
      }),
    ).toThrow(
      'FILE_PREVIEW_SIGNING_SECRET must be at least 32 characters in production',
    );
  });

  it('rejects invalid file preview expiry config', () => {
    expect(() =>
      createFilePreviewUrlSignerConfigFromEnv({
        NODE_ENV: 'test',
        FILE_PREVIEW_EXPIRES_IN_SECONDS: '0',
      }),
    ).toThrow('FILE_PREVIEW_EXPIRES_IN_SECONDS must be a positive integer');
  });
});
