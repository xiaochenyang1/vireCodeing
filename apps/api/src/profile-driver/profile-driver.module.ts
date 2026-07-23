import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DriverOnlyGuard } from '../auth/role.guard';
import {
  PrismaFilesRepository,
  type PrismaFilesClient,
} from '../files/files.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileDriverController } from './profile-driver.controller';
import {
  PrismaProfileDriverRepository,
  type PrismaProfileDriverClient,
} from './profile-driver.repository';
import { ProfileDriverService } from './profile-driver.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProfileDriverController],
  providers: [
    {
      provide: PrismaProfileDriverRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaProfileDriverRepository(
          prismaService as unknown as PrismaProfileDriverClient,
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
      provide: ProfileDriverService,
      useFactory: (
        repository: PrismaProfileDriverRepository,
        filesRepository: PrismaFilesRepository,
      ) => new ProfileDriverService(repository, filesRepository),
      inject: [PrismaProfileDriverRepository, PrismaFilesRepository],
    },
    DriverOnlyGuard,
  ],
})
export class ProfileDriverModule {}
