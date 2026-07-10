import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard, DriverOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  PrismaFilesRepository,
  type PrismaFilesClient,
} from '../files/files.repository';
import { createFilePreviewUrlSignerConfigFromEnv } from '../files/file-preview-url.config';
import { LocalFilePreviewUrlSigner } from '../files/file-preview-url.signer';
import {
  AdminDriverCertificationController,
  DriverCertificationController,
} from './driver-certification.controller';
import {
  PrismaDriverCertificationRepository,
  type PrismaDriverCertificationClient,
} from './driver-certification.repository';
import { DriverCertificationService } from './driver-certification.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [
    DriverCertificationController,
    AdminDriverCertificationController,
  ],
  providers: [
    {
      provide: PrismaDriverCertificationRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaDriverCertificationRepository(
          prismaService as unknown as PrismaDriverCertificationClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: PrismaFilesRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaFilesRepository(
          prismaService as unknown as PrismaFilesClient,
      ),
      inject: [PrismaService],
    },
    {
      provide: LocalFilePreviewUrlSigner,
      useFactory: () =>
        new LocalFilePreviewUrlSigner(
          createFilePreviewUrlSignerConfigFromEnv(process.env),
        ),
    },
    {
      provide: DriverCertificationService,
      useFactory: (
        repository: PrismaDriverCertificationRepository,
        filesRepository: PrismaFilesRepository,
        previewUrlSigner: LocalFilePreviewUrlSigner,
      ) =>
        new DriverCertificationService(
          repository,
          filesRepository,
          previewUrlSigner,
        ),
      inject: [
        PrismaDriverCertificationRepository,
        PrismaFilesRepository,
        LocalFilePreviewUrlSigner,
      ],
    },
    AdminOnlyGuard,
    DriverOnlyGuard,
  ],
})
export class DriverCertificationModule {}
