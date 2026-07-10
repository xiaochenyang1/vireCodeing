import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  PrismaFilesRepository,
  type PrismaFilesClient,
} from '../files/files.repository';
import {
  PrismaProfileCouponsRepository,
  type PrismaProfileCouponsClient,
} from '../profile-coupons/profile-coupons.repository';
import { ProfileCouponsService } from '../profile-coupons/profile-coupons.service';
import { createFilePreviewUrlSignerConfigFromEnv } from '../files/file-preview-url.config';
import { LocalFilePreviewUrlSigner } from '../files/file-preview-url.signer';
import {
  AdminOrderAttachmentsController,
  OrdersController,
} from './orders.controller';
import {
  PrismaOrdersRepository,
  type PrismaOrdersClient,
} from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [OrdersController, AdminOrderAttachmentsController],
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
      provide: PrismaFilesRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaFilesRepository(
          prismaService as unknown as PrismaFilesClient,
        ),
      inject: [PrismaService],
    },
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
    {
      provide: LocalFilePreviewUrlSigner,
      useFactory: () =>
        new LocalFilePreviewUrlSigner(
          createFilePreviewUrlSignerConfigFromEnv(process.env),
        ),
    },
    {
      provide: OrdersService,
      useFactory: (
        repository: PrismaOrdersRepository,
        filesRepository: PrismaFilesRepository,
        previewUrlSigner: LocalFilePreviewUrlSigner,
        profileCouponsService: ProfileCouponsService,
      ) =>
        new OrdersService(
          repository,
          filesRepository,
          previewUrlSigner,
          profileCouponsService,
        ),
      inject: [
        PrismaOrdersRepository,
        PrismaFilesRepository,
        LocalFilePreviewUrlSigner,
        ProfileCouponsService,
      ],
    },
    AdminOnlyGuard,
    ShipperOnlyGuard,
  ],
})
export class OrdersModule {}
