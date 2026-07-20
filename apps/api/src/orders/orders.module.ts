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
  imports: [AuthModule, PrismaModule],
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
      ) =>
        new OrdersService(
          repository,
          filesRepository,
          previewUrlSigner,
          () => new Date(),
          createOrderMutationIdempotencyConfigFromEnv(process.env).ttlSeconds,
        ),
      inject: [
        PrismaOrdersRepository,
        PrismaFilesRepository,
        LocalFilePreviewUrlSigner,
      ],
    },
    AdminOnlyGuard,
    ShipperOnlyGuard,
  ],
})
export class OrdersModule {}
