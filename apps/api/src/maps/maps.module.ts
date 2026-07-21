import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DriverOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  PrismaOrdersRepository,
  type PrismaOrdersClient,
} from '../orders/orders.repository';
import { MapsController } from './maps.controller';
import {
  PrismaMapsRepository,
  type MapsOrdersLookup,
} from './maps.repository';
import { MapsService } from './maps.service';
import { SandboxMapProvider } from './sandbox-map.provider';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [MapsController],
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
      provide: PrismaMapsRepository,
      useFactory: (
        prismaService: PrismaService,
        ordersRepository: PrismaOrdersRepository,
      ) =>
        new PrismaMapsRepository(
          prismaService as never,
          createOrdersLookup(ordersRepository),
        ),
      inject: [PrismaService, PrismaOrdersRepository],
    },
    {
      provide: SandboxMapProvider,
      useFactory: () => new SandboxMapProvider(),
    },
    {
      provide: MapsService,
      useFactory: (
        repository: PrismaMapsRepository,
        mapProvider: SandboxMapProvider,
      ) => new MapsService(repository, mapProvider, () => new Date()),
      inject: [PrismaMapsRepository, SandboxMapProvider],
    },
    ShipperOnlyGuard,
    DriverOnlyGuard,
  ],
  exports: [MapsService, SandboxMapProvider],
})
export class MapsModule {}

function createOrdersLookup(
  ordersRepository: PrismaOrdersRepository,
): MapsOrdersLookup {
  return {
    async findOrderLocationContext(orderId) {
      const order = await ordersRepository.findOrderById(orderId);
      if (!order) {
        return null;
      }

      return {
        id: order.id,
        orderNo: order.orderNo,
        shipperId: order.shipperId,
        assignedDriverId: order.assignedDriverId,
        status: order.status,
        pickup: {
          type: 'pickup',
          address: order.pickupAddress,
          latitude: order.pickupLatitude,
          longitude: order.pickupLongitude,
          contactName: order.pickupContact,
          contactPhone: order.pickupPhone,
        },
        delivery: {
          type: 'delivery',
          address: order.deliveryAddress,
          latitude: order.deliveryLatitude,
          longitude: order.deliveryLongitude,
          contactName: order.deliveryContact,
          contactPhone: order.deliveryPhone,
        },
      };
    },
  };
}
