import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  PrismaFilesRepository,
  type PrismaFilesClient,
} from '../files/files.repository';
import { createFilePreviewUrlSignerConfigFromEnv } from '../files/file-preview-url.config';
import { LocalFilePreviewUrlSigner } from '../files/file-preview-url.signer';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';
import { MapsModule } from '../maps/maps.module';
import { MapsService } from '../maps/maps.service';
import {
  AdminOrdersController,
  OrdersController,
} from './orders.controller';
import {
  PrismaOrdersRepository,
  type PrismaOrdersClient,
} from './orders.repository';
import { createOrderMutationIdempotencyConfigFromEnv } from './order-mutation-idempotency';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, PrismaModule, NotificationsModule, MapsModule],
  controllers: [OrdersController, AdminOrdersController],
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
        notificationsService: NotificationsService,
        mapsService: MapsService,
      ) =>
        new OrdersService(
          repository,
          filesRepository,
          previewUrlSigner,
          () => new Date(),
          createOrderMutationIdempotencyConfigFromEnv(process.env).ttlSeconds,
          notificationsService,
          mapsService,
        ),
      inject: [
        PrismaOrdersRepository,
        PrismaFilesRepository,
        LocalFilePreviewUrlSigner,
        NotificationsService,
        MapsService,
      ],
    },
    AdminOnlyGuard,
    ShipperOnlyGuard,
  ],
})
export class OrdersModule {}
