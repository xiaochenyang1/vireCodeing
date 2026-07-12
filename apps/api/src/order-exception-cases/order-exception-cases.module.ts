import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard, DriverOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  PrismaOrdersRepository,
  type PrismaOrdersClient,
} from '../orders/orders.repository';
import {
  AdminOrderExceptionCasesController,
  DriverOrderExceptionCasesController,
  ShipperOrderExceptionCasesController,
} from './order-exception-cases.controller';
import { OrderExceptionCasesService } from './order-exception-cases.service';

@Module({
  imports: [AuthModule, PrismaModule],
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
      useFactory: (repository: PrismaOrdersRepository) =>
        new OrderExceptionCasesService(repository),
      inject: [PrismaOrdersRepository],
    },
    ShipperOnlyGuard,
    DriverOnlyGuard,
    AdminOnlyGuard,
  ],
})
export class OrderExceptionCasesModule {}
