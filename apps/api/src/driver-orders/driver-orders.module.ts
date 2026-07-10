import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DriverOnlyGuard } from '../auth/role.guard';
import {
  PrismaFilesRepository,
  type PrismaFilesClient,
} from '../files/files.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  PrismaDriverAcceptanceSettingsRepository,
  type PrismaDriverAcceptanceSettingsClient,
} from './driver-acceptance-settings.repository';
import {
  PrismaDriverWithdrawalsRepository,
  type PrismaDriverWithdrawalsClient,
} from './driver-withdrawals.repository';
import {
  PrismaDriverCertificationRepository,
  type PrismaDriverCertificationClient,
} from '../driver-certification/driver-certification.repository';
import {
  PrismaOrdersRepository,
  type PrismaOrdersClient,
} from '../orders/orders.repository';
import { DriverOrdersController } from './driver-orders.controller';
import { DriverOrdersService } from './driver-orders.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [DriverOrdersController],
  providers: [
    {
      provide: PrismaOrdersRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaOrdersRepository(
          prismaService as unknown as PrismaOrdersClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: PrismaDriverCertificationRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaDriverCertificationRepository(
          prismaService as unknown as PrismaDriverCertificationClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: PrismaDriverAcceptanceSettingsRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaDriverAcceptanceSettingsRepository(
          prismaService as unknown as PrismaDriverAcceptanceSettingsClient,
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
      provide: PrismaDriverWithdrawalsRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaDriverWithdrawalsRepository(
          prismaService as unknown as PrismaDriverWithdrawalsClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: DriverOrdersService,
      useFactory: (
        repository: PrismaOrdersRepository,
        certificationRepository: PrismaDriverCertificationRepository,
        acceptanceSettingsRepository: PrismaDriverAcceptanceSettingsRepository,
        driverWithdrawalsRepository: PrismaDriverWithdrawalsRepository,
        filesRepository: PrismaFilesRepository,
      ) =>
        new DriverOrdersService(
          repository,
          certificationRepository,
          acceptanceSettingsRepository,
          driverWithdrawalsRepository,
          filesRepository,
        ),
      inject: [
        PrismaOrdersRepository,
        PrismaDriverCertificationRepository,
        PrismaDriverAcceptanceSettingsRepository,
        PrismaDriverWithdrawalsRepository,
        PrismaFilesRepository,
      ],
    },
    DriverOnlyGuard,
  ],
})
export class DriverOrdersModule {}
