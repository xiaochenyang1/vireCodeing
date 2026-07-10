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
        new ProfileCouponsService(repository),
      inject: [PrismaProfileCouponsRepository],
    },
    ShipperOnlyGuard,
    AdminOnlyGuard,
  ],
})
export class ProfileCouponsModule {}
