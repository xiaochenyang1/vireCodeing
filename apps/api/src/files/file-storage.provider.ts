import { createHash, createHmac } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'path';
import type { FileUploadRecord } from './dto';

export type FileUploadTarget = {
  uploadUrl: string;
  publicUrl?: string;
  expiresAtIso: string;
};

export interface FileStorageProvider {
  createPublicUrl(objectKey: string): string | undefined;
  createUploadTarget(
    file: FileUploadRecord,
    expiresAtIso: string,
  ): FileUploadTarget;
  verifyUploadedFile(file: FileUploadRecord): Promise<void>;
  saveUploadedFile(file: FileUploadRecord, content: Buffer): Promise<void>;
  readUploadedFile(file: FileUploadRecord): Promise<Buffer>;
  deleteObject(file: FileUploadRecord): Promise<void>;
}

export type LocalFileStorageProviderConfig = {
  uploadUrlBase?: string;
  publicUrlBase?: string;
  storageRoot?: string;
};

export type S3CompatibleFileStorageProviderConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  publicUrlBase?: string;
  now?: () => Date;
  fetcher?: S3HeadFetcher;
};

export type S3HeadFetcher = (
  url: string,
  init: { method: 'HEAD' | 'DELETE' },
) => Promise<{
  ok: boolean;
  status: number;
  headers: {
    get(name: string): string | null;
  };
}>;

export class LocalFileStorageProvider implements FileStorageProvider {
  constructor(private readonly config: LocalFileStorageProviderConfig = {}) {}

  createPublicUrl(objectKey: string) {
    if (!this.config.publicUrlBase) {
      return undefined;
    }

    return `${normalizeBaseUrl(this.config.publicUrlBase)}/${objectKey}`;
  }

  createUploadTarget(file: FileUploadRecord, expiresAtIso: string) {
    const publicUrl = this.createPublicUrl(file.objectKey);

    return {
      uploadUrl: `${normalizeBaseUrl(
        this.config.uploadUrlBase ?? '/api/files/uploads',
      )}/${file.id}`,
      ...(publicUrl ? { publicUrl } : {}),
      expiresAtIso,
    };
  }

  async saveUploadedFile(file: FileUploadRecord, content: Buffer) {
    const filePath = this.resolveFilePath(file);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  async readUploadedFile(file: FileUploadRecord) {
    return readFile(this.resolveFilePath(file));
  }

  async deleteObject(file: FileUploadRecord) {
    await rm(this.resolveFilePath(file), { force: true });
  }

  async verifyUploadedFile(_file: FileUploadRecord) {
    return undefined;
  }

  private resolveFilePath(file: FileUploadRecord) {
    const storageRoot = resolve(this.config.storageRoot ?? 'local-file-storage');
    const filePath = resolve(storageRoot, ...file.objectKey.split('/'));

    if (!isPathInside(filePath, storageRoot)) {
      throw new Error('File object key resolves outside storage root');
    }

    return filePath;
  }
}

export class S3CompatibleFileStorageProvider implements FileStorageProvider {
  private readonly endpoint: URL;

  constructor(
    private readonly config: S3CompatibleFileStorageProviderConfig,
  ) {
    this.endpoint = new URL(config.endpoint);
  }

  createPublicUrl(objectKey: string) {
    if (!this.config.publicUrlBase) {
      return undefined;
    }

    return `${normalizeBaseUrl(this.config.publicUrlBase)}/${objectKey}`;
  }

  createUploadTarget(file: FileUploadRecord, expiresAtIso: string) {
    const now = this.config.now ? this.config.now() : new Date();
    const uploadUrl = createS3PresignedObjectUrl({
      endpoint: this.endpoint,
      bucket: this.config.bucket,
      objectKey: file.objectKey,
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      forcePathStyle: this.config.forcePathStyle ?? true,
      now,
      expiresInSeconds: secondsUntil(now, expiresAtIso),
      method: 'PUT',
    });
    const publicUrl = this.createPublicUrl(file.objectKey);

    return {
      uploadUrl,
      ...(publicUrl ? { publicUrl } : {}),
      expiresAtIso,
    };
  }

  async saveUploadedFile(
    _file: FileUploadRecord,
    _content: Buffer,
  ): Promise<void> {
    throw new Error('S3 compatible storage does not support local byte uploads');
  }

  async readUploadedFile(_file: FileUploadRecord): Promise<Buffer> {
    throw new Error('S3 compatible storage does not support local byte reads');
  }

  async deleteObject(file: FileUploadRecord): Promise<void> {
    const now = this.config.now ? this.config.now() : new Date();
    const fetcher = this.config.fetcher ?? fetch;
    const response = await fetcher(
      createS3PresignedObjectUrl({
        endpoint: this.endpoint,
        bucket: this.config.bucket,
        objectKey: file.objectKey,
        region: this.config.region,
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        forcePathStyle: this.config.forcePathStyle ?? true,
        now,
        expiresInSeconds: 60,
        method: 'DELETE',
      }),
      { method: 'DELETE' },
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(
        `Remote object could not be deleted from S3 compatible storage: ${response.status}`,
      );
    }
  }

  async verifyUploadedFile(file: FileUploadRecord): Promise<void> {
    const now = this.config.now ? this.config.now() : new Date();
    const fetcher = this.config.fetcher ?? fetch;
    const response = await fetcher(
      createS3PresignedObjectUrl({
        endpoint: this.endpoint,
        bucket: this.config.bucket,
        objectKey: file.objectKey,
        region: this.config.region,
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        forcePathStyle: this.config.forcePathStyle ?? true,
        now,
        expiresInSeconds: 60,
        method: 'HEAD',
      }),
      { method: 'HEAD' },
    );

    if (!response.ok) {
      throw new Error(
        `Remote object is not readable from S3 compatible storage: ${response.status}`,
      );
    }

    const remoteByteSize = Number(response.headers.get('content-length'));

    if (remoteByteSize !== file.byteSize) {
      throw new Error('Remote object byte size does not match upload intent');
    }

    const remoteContentType = response.headers
      .get('content-type')
      ?.split(';')[0]
      .trim()
      .toLowerCase();

    if (remoteContentType !== file.contentType) {
      throw new Error('Remote object content type does not match upload intent');
    }
  }
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

function createS3PresignedObjectUrl(input: {
  endpoint: URL;
  bucket: string;
  objectKey: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  now: Date;
  expiresInSeconds: number;
  method: 'PUT' | 'HEAD' | 'DELETE';
}) {
  const target = createS3ObjectUrl(input);
  const amzDate = formatAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const signedHeaders = 'host';
  const query = canonicalQuery([
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${input.accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(input.expiresInSeconds)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ]);
  const canonicalRequest = [
    input.method,
    target.canonicalPath,
    query,
    `host:${target.host}\n`,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = hmacHex(
    createAwsSigningKey(input.secretAccessKey, dateStamp, input.region),
    stringToSign,
  );

  return `${target.baseUrl}${target.canonicalPath}?${query}&X-Amz-Signature=${signature}`;
}

function createS3ObjectUrl(input: {
  endpoint: URL;
  bucket: string;
  objectKey: string;
  forcePathStyle: boolean;
}) {
  const endpoint = input.endpoint;
  const encodedObjectKey = encodePath(input.objectKey);
  const endpointPath = trimSlashes(endpoint.pathname);

  if (input.forcePathStyle) {
    const canonicalPath = `/${[
      endpointPath,
      encodePathSegment(input.bucket),
      encodedObjectKey,
    ]
      .filter(Boolean)
      .join('/')}`;

    return {
      baseUrl: `${endpoint.protocol}//${endpoint.host}`,
      canonicalPath,
      host: endpoint.host,
    };
  }

  const host = `${input.bucket}.${endpoint.host}`;
  const canonicalPath = `/${[endpointPath, encodedObjectKey]
    .filter(Boolean)
    .join('/')}`;

  return {
    baseUrl: `${endpoint.protocol}//${host}`,
    canonicalPath,
    host,
  };
}

function secondsUntil(now: Date, expiresAtIso: string) {
  const expiresAt = new Date(expiresAtIso).getTime();
  const seconds = Math.floor((expiresAt - now.getTime()) / 1000);

  return Math.max(1, seconds);
}

function formatAmzDate(value: Date) {
  return value
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function canonicalQuery(entries: Array<[string, string]>) {
  return [...entries]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
}

function createAwsSigningKey(secretAccessKey: string, date: string, region: string) {
  const dateKey = hmacBuffer(`AWS4${secretAccessKey}`, date);
  const regionKey = hmacBuffer(dateKey, region);
  const serviceKey = hmacBuffer(regionKey, 's3');

  return hmacBuffer(serviceKey, 'aws4_request');
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function hmacBuffer(key: string | Buffer, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key: string | Buffer, value: string) {
  return createHmac('sha256', key).update(value).digest('hex');
}

function encodePath(value: string) {
  return value.split('/').map(encodePathSegment).join('/');
}

function encodePathSegment(value: string) {
  return encodeRfc3986(value);
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

function isPathInside(filePath: string, rootPath: string) {
  const relativePath = relative(rootPath, filePath);

  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== '..' &&
      !isAbsolute(relativePath))
  );
}
