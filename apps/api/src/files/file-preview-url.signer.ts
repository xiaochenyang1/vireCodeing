import { createHmac, timingSafeEqual } from 'crypto';
import type { FileUploadRecord } from './dto';

export type FilePreviewUrl = {
  previewUrl: string;
  previewExpiresAtIso: string;
};

export type VerifyFilePreviewUrlInput = {
  expiresAtIso: string;
  signature: string;
};

export interface FilePreviewUrlSigner {
  signPreviewUrl(file: FileUploadRecord): FilePreviewUrl;
}

export interface FilePreviewUrlVerifier {
  verifyPreviewUrl(
    file: FileUploadRecord,
    input: VerifyFilePreviewUrlInput,
  ): boolean;
}

export type LocalFilePreviewUrlSignerConfig = {
  previewUrlBase?: string;
  previewExpiresInSeconds?: number;
  signingSecret?: string;
  now?: () => Date;
};

const defaultPreviewExpiresInSeconds = 10 * 60;
const defaultPreviewUrlBase = '/api/files/preview-contents';
const defaultSigningSecret = 'local-file-preview-secret';

export class LocalFilePreviewUrlSigner
  implements FilePreviewUrlSigner, FilePreviewUrlVerifier
{
  constructor(private readonly config: LocalFilePreviewUrlSignerConfig = {}) {}

  signPreviewUrl(file: FileUploadRecord): FilePreviewUrl {
    const now = this.config.now ? this.config.now() : new Date();
    const previewExpiresAtIso = new Date(
      now.getTime() +
        (this.config.previewExpiresInSeconds ??
          defaultPreviewExpiresInSeconds) *
          1000,
    ).toISOString();
    const signature = this.sign(file, previewExpiresAtIso);

    return {
      previewUrl: appendSignatureParams(
        this.getPreviewUrlTarget(file),
        previewExpiresAtIso,
        signature,
      ),
      previewExpiresAtIso,
    };
  }

  verifyPreviewUrl(
    file: FileUploadRecord,
    input: VerifyFilePreviewUrlInput,
  ): boolean {
    const expiresAt = Date.parse(input.expiresAtIso);

    if (!Number.isFinite(expiresAt)) {
      return false;
    }

    const now = this.config.now ? this.config.now() : new Date();

    if (expiresAt < now.getTime()) {
      return false;
    }

    const expectedSignature = this.sign(file, input.expiresAtIso);

    return safeEqualHex(input.signature, expectedSignature);
  }

  private getPreviewUrlTarget(file: FileUploadRecord) {
    return `${normalizeBaseUrl(
      this.config.previewUrlBase ?? defaultPreviewUrlBase,
    )}/${encodeObjectKeyPath(file.objectKey)}`;
  }

  private sign(file: FileUploadRecord, previewExpiresAtIso: string) {
    return createHmac(
      'sha256',
      this.config.signingSecret ?? defaultSigningSecret,
    )
      .update(`${file.id}:${file.objectKey}:${previewExpiresAtIso}`)
      .digest('hex');
  }
}

function safeEqualHex(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) {
    return false;
  }

  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function appendSignatureParams(
  targetUrl: string,
  previewExpiresAtIso: string,
  signature: string,
) {
  const separator = targetUrl.includes('?') ? '&' : '?';
  const params = new URLSearchParams({
    expiresAtIso: previewExpiresAtIso,
    signature,
  });

  return `${targetUrl}${separator}${params.toString()}`;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

function encodeObjectKeyPath(objectKey: string) {
  return objectKey.split('/').map(encodeURIComponent).join('/');
}
