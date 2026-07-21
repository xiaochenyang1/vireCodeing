import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DriverOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  PrismaOrdersRepository,
  type PrismaOrdersClient,
} from '../orders/orders.repository';
import { AmapMapProvider } from './amap-map.provider';
import { MapsController } from './maps.controller';
import {
  PrismaMapsRepository,
  type MapsOrdersLookup,
} from './maps.repository';
import { MapsService } from './maps.service';
import type { MapProvider } from './map-provider';
import { SandboxMapProvider } from './sandbox-map.provider';

export const MAP_PROVIDER = Symbol('MAP_PROVIDER');

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
      provide: MAP_PROVIDER,
      useFactory: () => createMapProviderFromEnv(process.env),
    },
    {
      provide: MapsService,
      useFactory: (
        repository: PrismaMapsRepository,
        mapProvider: MapProvider,
      ) => new MapsService(repository, mapProvider, () => new Date()),
      inject: [PrismaMapsRepository, MAP_PROVIDER],
    },
    ShipperOnlyGuard,
    DriverOnlyGuard,
  ],
  exports: [MapsService, MAP_PROVIDER],
})
export class MapsModule {}

export function createMapProviderFromEnv(
  env: NodeJS.ProcessEnv,
): MapProvider {
  const provider = env.MAP_PROVIDER || 'sandbox';

  if (provider === 'sandbox') {
    return new SandboxMapProvider();
  }

  if (provider === 'amap') {
    return new AmapMapProvider({
      webKey: requireEnv(env, 'AMAP_WEB_KEY'),
      ...(env.AMAP_API_BASE_URL
        ? { apiBaseUrl: env.AMAP_API_BASE_URL }
        : {}),
      ...(env.AMAP_TIMEOUT_MS
        ? { timeoutMs: Number(env.AMAP_TIMEOUT_MS) }
        : {}),
    });
  }

  throw new Error(`Unsupported MAP_PROVIDER: ${provider}`);
}

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

function requireEnv(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}
