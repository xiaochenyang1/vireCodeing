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
    AdminOnlyGuard,
    ShipperOnlyGuard,
  ],
})
export class SupportTicketsModule {}
