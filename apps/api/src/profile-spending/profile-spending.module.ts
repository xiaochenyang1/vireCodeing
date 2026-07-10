import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileSpendingController } from './profile-spending.controller';
import {
  PrismaProfileSpendingRepository,
  type PrismaProfileSpendingClient,
} from './profile-spending.repository';
import { ProfileSpendingService } from './profile-spending.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProfileSpendingController],
  providers: [
    {
      provide: PrismaProfileSpendingRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaProfileSpendingRepository(
          prismaService as unknown as PrismaProfileSpendingClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: ProfileSpendingService,
      useFactory: (repository: PrismaProfileSpendingRepository) =>
        new ProfileSpendingService(repository),
      inject: [PrismaProfileSpendingRepository],
    },
    ShipperOnlyGuard,
  ],
})
export class ProfileSpendingModule {}
