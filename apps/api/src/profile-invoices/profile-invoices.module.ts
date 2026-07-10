import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileInvoicesController } from './profile-invoices.controller';
import {
  PrismaProfileInvoicesRepository,
  type PrismaProfileInvoicesClient,
} from './profile-invoices.repository';
import { ProfileInvoicesService } from './profile-invoices.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProfileInvoicesController],
  providers: [
    {
      provide: PrismaProfileInvoicesRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaProfileInvoicesRepository(
          prismaService as unknown as PrismaProfileInvoicesClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: ProfileInvoicesService,
      useFactory: (repository: PrismaProfileInvoicesRepository) =>
        new ProfileInvoicesService(repository),
      inject: [PrismaProfileInvoicesRepository],
    },
    ShipperOnlyGuard,
  ],
})
export class ProfileInvoicesModule {}
