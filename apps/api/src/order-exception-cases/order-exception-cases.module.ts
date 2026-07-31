import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard, DriverOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  PrismaFilesRepository,
  type PrismaFilesClient,
} from '../files/files.repository';
import { createFilePreviewUrlSignerConfigFromEnv } from '../files/file-preview-url.config';
import { LocalFilePreviewUrlSigner } from '../files/file-preview-url.signer';
import {
  PrismaOrdersRepository,
  type PrismaOrdersClient,
} from '../orders/orders.repository';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AdminOrderExceptionCasesController,
  DriverOrderExceptionCasesController,
  OrderExceptionCaseAttachmentPreviewsController,
  ShipperOrderExceptionCasesController,
} from './order-exception-cases.controller';
import { OrderExceptionCaseOverdueEscalationScheduler } from './order-exception-case-overdue-escalation.scheduler';
import { OrderExceptionCaseOverdueEscalationService } from './order-exception-case-overdue-escalation.service';
import { OrderExceptionCasesService } from './order-exception-cases.service';

@Module({
  imports: [AuthModule, PrismaModule, NotificationsModule],
  controllers: [
    ShipperOrderExceptionCasesController,
    DriverOrderExceptionCasesController,
    OrderExceptionCaseAttachmentPreviewsController,
    AdminOrderExceptionCasesController,
  ],
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
      provide: OrderExceptionCasesService,
      useFactory: (
        repository: PrismaOrdersRepository,
        notificationsService: NotificationsService,
        filesRepository: PrismaFilesRepository,
        previewUrlSigner: LocalFilePreviewUrlSigner,
      ) =>
        new OrderExceptionCasesService(
          repository,
          notificationsService,
          () => new Date(),
          filesRepository,
          previewUrlSigner,
        ),
      inject: [
        PrismaOrdersRepository,
        NotificationsService,
        PrismaFilesRepository,
        LocalFilePreviewUrlSigner,
      ],
    },
    {
      provide: OrderExceptionCaseOverdueEscalationService,
      useFactory: (
        repository: PrismaOrdersRepository,
        notificationsService: NotificationsService,
      ) =>
        new OrderExceptionCaseOverdueEscalationService(
          repository,
          undefined,
          notificationsService,
        ),
      inject: [PrismaOrdersRepository, NotificationsService],
    },
    {
      provide: OrderExceptionCaseOverdueEscalationScheduler,
      useFactory: (service: OrderExceptionCaseOverdueEscalationService) =>
        new OrderExceptionCaseOverdueEscalationScheduler(
          service,
          createOrderExceptionCaseOverdueEscalationSchedulerConfigFromEnv(
            process.env,
          ),
        ),
      inject: [OrderExceptionCaseOverdueEscalationService],
    },
    ShipperOnlyGuard,
    DriverOnlyGuard,
    AdminOnlyGuard,
  ],
})
export class OrderExceptionCasesModule {}

export function createOrderExceptionCaseOverdueEscalationSchedulerConfigFromEnv(
  env: NodeJS.ProcessEnv,
) {
  return {
    ...(env.ORDER_EXCEPTION_CASE_OVERDUE_ESCALATION_INTERVAL_SECONDS
      ? {
          intervalSeconds: Number(
            env.ORDER_EXCEPTION_CASE_OVERDUE_ESCALATION_INTERVAL_SECONDS,
          ),
        }
      : {}),
  };
}
