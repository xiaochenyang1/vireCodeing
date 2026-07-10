import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaFilesRepository, type PrismaFilesClient } from '../files/files.repository';
import { ProfileVerificationController } from './profile-verification.controller';
import {
  PrismaProfileVerificationRepository,
  type PrismaProfileVerificationClient,
} from './profile-verification.repository';
import { ProfileVerificationService } from './profile-verification.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProfileVerificationController],
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
      provide: ProfileVerificationService,
      useFactory: (
        repository: PrismaProfileVerificationRepository,
        filesRepository: PrismaFilesRepository,
      ) => new ProfileVerificationService(repository, filesRepository),
      inject: [PrismaProfileVerificationRepository, PrismaFilesRepository],
    },
    ShipperOnlyGuard,
  ],
})
export class ProfileVerificationModule {}
