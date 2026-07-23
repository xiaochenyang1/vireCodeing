import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ShipperOnlyGuard } from '../auth/role.guard';
import {
  PrismaFilesRepository,
  type PrismaFilesClient,
} from '../files/files.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileAccountController } from './profile-account.controller';
import {
  PrismaProfileAccountRepository,
  type PrismaProfileAccountClient,
} from './profile-account.repository';
import { ProfileAccountService } from './profile-account.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProfileAccountController],
  providers: [
    {
      provide: PrismaProfileAccountRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaProfileAccountRepository(
          prismaService as unknown as PrismaProfileAccountClient,
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
      provide: ProfileAccountService,
      useFactory: (
        repository: PrismaProfileAccountRepository,
        filesRepository: PrismaFilesRepository,
      ) => new ProfileAccountService(repository, filesRepository),
      inject: [PrismaProfileAccountRepository, PrismaFilesRepository],
    },
    ShipperOnlyGuard,
  ],
})
export class ProfileAccountModule {}
