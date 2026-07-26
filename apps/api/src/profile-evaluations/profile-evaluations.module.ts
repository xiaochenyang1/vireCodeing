import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { createFilePreviewUrlSignerConfigFromEnv } from '../files/file-preview-url.config';
import { LocalFilePreviewUrlSigner } from '../files/file-preview-url.signer';
import {
  PrismaFilesRepository,
  type PrismaFilesClient,
} from '../files/files.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminProfileEvaluationsController,
  ProfileEvaluationsController,
} from './profile-evaluations.controller';
import {
  PrismaProfileEvaluationsRepository,
  type PrismaProfileEvaluationsClient,
} from './profile-evaluations.repository';
import { ProfileEvaluationsService } from './profile-evaluations.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProfileEvaluationsController, AdminProfileEvaluationsController],
  providers: [
    {
      provide: PrismaProfileEvaluationsRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaProfileEvaluationsRepository(
          prismaService as unknown as PrismaProfileEvaluationsClient,
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
      provide: ProfileEvaluationsService,
      useFactory: (
        repository: PrismaProfileEvaluationsRepository,
        filesRepository: PrismaFilesRepository,
        previewUrlSigner: LocalFilePreviewUrlSigner,
      ) =>
        new ProfileEvaluationsService(
          repository,
          filesRepository,
          previewUrlSigner,
        ),
      inject: [
        PrismaProfileEvaluationsRepository,
        PrismaFilesRepository,
        LocalFilePreviewUrlSigner,
      ],
    },
    AdminOnlyGuard,
    ShipperOnlyGuard,
  ],
})
export class ProfileEvaluationsModule {}
