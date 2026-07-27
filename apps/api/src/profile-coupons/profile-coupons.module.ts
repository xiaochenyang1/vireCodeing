import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminProfileCouponsController,
  ProfileCouponsController,
} from './profile-coupons.controller';
import {
  PrismaProfileCouponsRepository,
  type PrismaProfileCouponsClient,
} from './profile-coupons.repository';
import { ProfileCouponsService } from './profile-coupons.service';
import { createCouponIssueIdempotencyConfigFromEnv } from './profile-coupons.idempotency';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProfileCouponsController, AdminProfileCouponsController],
  providers: [
    {
      provide: PrismaProfileCouponsRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaProfileCouponsRepository(
          prismaService as unknown as PrismaProfileCouponsClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: ProfileCouponsService,
      useFactory: (repository: PrismaProfileCouponsRepository) =>
        new ProfileCouponsService(
          repository,
          () => new Date(),
          createCouponIssueIdempotencyConfigFromEnv(process.env).ttlSeconds,
        ),
      inject: [PrismaProfileCouponsRepository],
    },
    ShipperOnlyGuard,
    AdminOnlyGuard,
  ],
})
export class ProfileCouponsModule {}
