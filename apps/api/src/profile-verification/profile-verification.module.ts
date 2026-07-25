import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { createFilePreviewUrlSignerConfigFromEnv } from '../files/file-preview-url.config';
import { LocalFilePreviewUrlSigner } from '../files/file-preview-url.signer';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaFilesRepository, type PrismaFilesClient } from '../files/files.repository';
import {
  AdminShipperVerificationController,
  ProfileVerificationController,
} from './profile-verification.controller';
import {
  PrismaProfileVerificationRepository,
  type PrismaProfileVerificationClient,
} from './profile-verification.repository';
import { ProfileVerificationService } from './profile-verification.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [
    ProfileVerificationController,
    AdminShipperVerificationController,
  ],
  providers: [
    {
      provide: PrismaProfileVerificationRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaProfileVerificationRepository(
          prismaService as unknown as PrismaProfileVerificationClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: PrismaFilesRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaFilesRepository(prismaService as unknown as PrismaFilesClient),
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
      provide: ProfileVerificationService,
      useFactory: (
        repository: PrismaProfileVerificationRepository,
        filesRepository: PrismaFilesRepository,
        previewUrlSigner: LocalFilePreviewUrlSigner,
      ) =>
        new ProfileVerificationService(
          repository,
          filesRepository,
          previewUrlSigner,
        ),
      inject: [
        PrismaProfileVerificationRepository,
        PrismaFilesRepository,
        LocalFilePreviewUrlSigner,
      ],
    },
    ShipperOnlyGuard,
    AdminOnlyGuard,
  ],
})
export class ProfileVerificationModule {}
