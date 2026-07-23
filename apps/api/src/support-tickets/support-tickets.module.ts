import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
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
  imports: [AuthModule, PrismaModule],
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
      useFactory: (repository: PrismaSupportTicketsRepository) =>
        new SupportTicketsService(repository),
      inject: [PrismaSupportTicketsRepository],
    },
    AdminOnlyGuard,
    ShipperOnlyGuard,
  ],
})
export class SupportTicketsModule {}
