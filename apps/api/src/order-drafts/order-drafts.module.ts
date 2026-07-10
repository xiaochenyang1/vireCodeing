import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { OrderDraftsController } from './order-drafts.controller';
import {
  PrismaOrderDraftsRepository,
  type PrismaOrderDraftsClient,
} from './order-drafts.repository';
import { OrderDraftsService } from './order-drafts.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [OrderDraftsController],
  providers: [
    {
      provide: PrismaOrderDraftsRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaOrderDraftsRepository(
          prismaService as unknown as PrismaOrderDraftsClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: OrderDraftsService,
      useFactory: (repository: PrismaOrderDraftsRepository) =>
        new OrderDraftsService(repository),
      inject: [PrismaOrderDraftsRepository],
    },
    ShipperOnlyGuard,
  ],
})
export class OrderDraftsModule {}
