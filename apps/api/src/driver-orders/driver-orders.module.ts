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
  PrismaDriverBankCardsRepository,
  type PrismaDriverBankCardsClient,
} from './driver-bank-cards.repository';
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
import { createOrderMutationIdempotencyConfigFromEnv } from '../orders/order-mutation-idempotency';
import {
  PrismaDriverFinanceRepository,
  type PrismaDriverFinanceClient,
} from '../payments/driver-finance.repository';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';
import { MapsModule } from '../maps/maps.module';
import { MapsService } from '../maps/maps.service';
import { DriverOrdersController } from './driver-orders.controller';
import { DriverOrdersService } from './driver-orders.service';

@Module({
  imports: [AuthModule, PrismaModule, NotificationsModule, MapsModule],
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
      provide: PrismaDriverBankCardsRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaDriverBankCardsRepository(
          prismaService as unknown as PrismaDriverBankCardsClient,
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
      provide: PrismaDriverFinanceRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaDriverFinanceRepository(
          prismaService as unknown as PrismaDriverFinanceClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: DriverOrdersService,
      useFactory: (
        repository: PrismaOrdersRepository,
        certificationRepository: PrismaDriverCertificationRepository,
        acceptanceSettingsRepository: PrismaDriverAcceptanceSettingsRepository,
        driverBankCardsRepository: PrismaDriverBankCardsRepository,
        driverWithdrawalsRepository: PrismaDriverWithdrawalsRepository,
        filesRepository: PrismaFilesRepository,
        driverFinanceRepository: PrismaDriverFinanceRepository,
        notificationsService: NotificationsService,
        mapsService: MapsService,
      ) =>
        new DriverOrdersService(
          repository,
          certificationRepository,
          acceptanceSettingsRepository,
          driverBankCardsRepository,
          driverWithdrawalsRepository,
          filesRepository,
          () => new Date(),
          createOrderMutationIdempotencyConfigFromEnv(process.env).ttlSeconds,
          driverFinanceRepository,
          notificationsService,
          mapsService,
        ),
      inject: [
        PrismaOrdersRepository,
        PrismaDriverCertificationRepository,
        PrismaDriverAcceptanceSettingsRepository,
        PrismaDriverBankCardsRepository,
        PrismaDriverWithdrawalsRepository,
        PrismaFilesRepository,
        PrismaDriverFinanceRepository,
        NotificationsService,
        MapsService,
      ],
    },
    DriverOnlyGuard,
  ],
})
export class DriverOrdersModule {}
