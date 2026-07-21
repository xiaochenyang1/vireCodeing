import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard, DriverOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  PrismaOrdersRepository,
  type PrismaOrdersClient,
} from '../orders/orders.repository';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AdminOrderExceptionCasesController,
  DriverOrderExceptionCasesController,
  ShipperOrderExceptionCasesController,
} from './order-exception-cases.controller';
import { OrderExceptionCasesService } from './order-exception-cases.service';

@Module({
  imports: [AuthModule, PrismaModule, NotificationsModule],
  controllers: [
    ShipperOrderExceptionCasesController,
    DriverOrderExceptionCasesController,
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
      provide: OrderExceptionCasesService,
      useFactory: (
        repository: PrismaOrdersRepository,
        notificationsService: NotificationsService,
      ) => new OrderExceptionCasesService(repository, notificationsService),
      inject: [PrismaOrdersRepository, NotificationsService],
    },
    ShipperOnlyGuard,
    DriverOnlyGuard,
    AdminOnlyGuard,
  ],
})
export class OrderExceptionCasesModule {}
