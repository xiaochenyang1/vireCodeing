import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminSupportTicketsController,
  SupportTicketsController,
} from './support-tickets.controller';
import { SupportTicketOverdueEscalationScheduler } from './support-ticket-overdue-escalation.scheduler';
import { SupportTicketOverdueEscalationService } from './support-ticket-overdue-escalation.service';
import {
  PrismaSupportTicketsRepository,
  type PrismaSupportTicketsClient,
} from './support-tickets.repository';
import { SupportTicketsService } from './support-tickets.service';

@Module({
  imports: [AuthModule, PrismaModule, NotificationsModule],
  controllers: [SupportTicketsController, AdminSupportTicketsController],
  providers: [
    {
      provide: PrismaSupportTicketsRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaSupportTicketsRepository(
          prismaService as unknown as PrismaSupportTicketsClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: SupportTicketsService,
      useFactory: (
        repository: PrismaSupportTicketsRepository,
        notificationsService: NotificationsService,
      ) => new SupportTicketsService(repository, undefined, notificationsService),
      inject: [PrismaSupportTicketsRepository, NotificationsService],
    },
    {
      provide: SupportTicketOverdueEscalationService,
      useFactory: (
        repository: PrismaSupportTicketsRepository,
        notificationsService: NotificationsService,
      ) =>
        new SupportTicketOverdueEscalationService(
          repository,
          undefined,
          notificationsService,
        ),
      inject: [PrismaSupportTicketsRepository, NotificationsService],
    },
    {
      provide: SupportTicketOverdueEscalationScheduler,
      useFactory: (service: SupportTicketOverdueEscalationService) =>
        new SupportTicketOverdueEscalationScheduler(
          service,
          createSupportTicketOverdueEscalationSchedulerConfigFromEnv(process.env),
        ),
      inject: [SupportTicketOverdueEscalationService],
    },
    AdminOnlyGuard,
    ShipperOnlyGuard,
  ],
})
export class SupportTicketsModule {}

export function createSupportTicketOverdueEscalationSchedulerConfigFromEnv(
  env: NodeJS.ProcessEnv,
) {
  return {
    ...(env.SUPPORT_TICKET_OVERDUE_ESCALATION_INTERVAL_SECONDS
      ? {
          intervalSeconds: Number(
            env.SUPPORT_TICKET_OVERDUE_ESCALATION_INTERVAL_SECONDS,
          ),
        }
      : {}),
  };
}
