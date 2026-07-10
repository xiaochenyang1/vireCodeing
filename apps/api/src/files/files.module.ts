import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { FilesController } from './files.controller';
import { createFilePreviewUrlSignerConfigFromEnv } from './file-preview-url.config';
import { LocalFilePreviewUrlSigner } from './file-preview-url.signer';
import {
  LocalFileStorageProvider,
  S3CompatibleFileStorageProvider,
} from './file-storage.provider';
import {
  PrismaFilesRepository,
  type PrismaFilesClient,
} from './files.repository';
import { FilesMaintenanceScheduler } from './files-maintenance.scheduler';
import { FilesService } from './files.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [FilesController],
  providers: [
    {
      provide: PrismaFilesRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaFilesRepository(
          prismaService as unknown as PrismaFilesClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: FilesService,
      useFactory: (repository: PrismaFilesRepository) =>
        new FilesService(
          repository,
          createFileStorageConfigFromEnv(process.env),
          new LocalFilePreviewUrlSigner(
            createFilePreviewUrlSignerConfigFromEnv(process.env),
          ),
          createFileStorageProviderFromEnv(process.env),
        ),
      inject: [PrismaFilesRepository],
    },
    {
      provide: FilesMaintenanceScheduler,
      useFactory: (filesService: FilesService) =>
        new FilesMaintenanceScheduler(
          filesService,
          createFilesMaintenanceSchedulerConfigFromEnv(process.env),
        ),
      inject: [FilesService],
    },
  ],
})
export class FilesModule {}

export function createFileStorageProviderFromEnv(env: NodeJS.ProcessEnv) {
  if (env.FILE_STORAGE_PROVIDER === 's3-compatible') {
    return new S3CompatibleFileStorageProvider({
      endpoint: requireEnv(env, 'S3_ENDPOINT'),
      region: requireEnv(env, 'S3_REGION'),
      bucket: requireEnv(env, 'S3_BUCKET'),
      accessKeyId: requireEnv(env, 'S3_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv(env, 'S3_SECRET_ACCESS_KEY'),
      ...(env.S3_FORCE_PATH_STYLE
        ? { forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false' }
        : {}),
      ...(env.S3_PUBLIC_URL_BASE
        ? { publicUrlBase: env.S3_PUBLIC_URL_BASE }
        : {}),
    });
  }

  return new LocalFileStorageProvider(createFileStorageConfigFromEnv(env));
}

function createFileStorageConfigFromEnv(env: NodeJS.ProcessEnv) {
  return {
    ...(env.FILE_UPLOAD_URL_BASE
      ? { uploadUrlBase: env.FILE_UPLOAD_URL_BASE }
      : {}),
    ...(env.FILE_PUBLIC_URL_BASE
      ? { publicUrlBase: env.FILE_PUBLIC_URL_BASE }
      : {}),
    ...(env.FILE_STORAGE_ROOT ? { storageRoot: env.FILE_STORAGE_ROOT } : {}),
    ...(env.S3_UPLOAD_EXPIRES_IN_SECONDS
      ? { uploadExpiresInSeconds: Number(env.S3_UPLOAD_EXPIRES_IN_SECONDS) }
      : {}),
    ...(env.FILE_STORAGE_CALLBACK_SIGNING_SECRET
      ? { storageCallbackSigningSecret: env.FILE_STORAGE_CALLBACK_SIGNING_SECRET }
      : {}),
  };
}

export function createFilesMaintenanceSchedulerConfigFromEnv(
  env: NodeJS.ProcessEnv,
) {
  return {
    ...(env.FILE_PENDING_CLEANUP_INTERVAL_SECONDS
      ? {
          intervalSeconds: Number(env.FILE_PENDING_CLEANUP_INTERVAL_SECONDS),
        }
      : {}),
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key];

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}
