import type {
  SaveShipperProfileFrequentRoutesRequest,
  ShipperFrequentRoute,
  ShipperProfileFrequentRoutesRecord,
} from './dto';

export interface ProfileFrequentRoutesRepository {
  findFrequentRoutesByShipperId(
    shipperId: string,
  ): Promise<ShipperProfileFrequentRoutesRecord | undefined>;
  saveFrequentRoutes(
    shipperId: string,
    input: SaveShipperProfileFrequentRoutesRequest,
  ): Promise<ShipperProfileFrequentRoutesRecord>;
}

export class InMemoryProfileFrequentRoutesRepository
  implements ProfileFrequentRoutesRepository
{
  private readonly frequentRoutes = new Map<
    string,
    ShipperProfileFrequentRoutesRecord
  >();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async findFrequentRoutesByShipperId(shipperId: string) {
    return this.frequentRoutes.get(shipperId);
  }

  async saveFrequentRoutes(
    shipperId: string,
    input: SaveShipperProfileFrequentRoutesRequest,
  ): Promise<ShipperProfileFrequentRoutesRecord> {
    const frequentRoutes: ShipperProfileFrequentRoutesRecord = {
      shipperId,
      routes: input.routes,
      clientUpdatedAtIso: input.clientUpdatedAtIso,
      updatedAtIso: this.now().toISOString(),
    };

    this.frequentRoutes.set(shipperId, frequentRoutes);

    return frequentRoutes;
  }
}

export type PrismaProfileFrequentRoutesRecord = {
  shipperId: string;
  routes: unknown;
  clientUpdatedAt: Date | null;
  updatedAt: Date;
};

export type PrismaProfileFrequentRoutesClient = {
  shipperFrequentRoutes: {
    findUnique(args: {
      where: { shipperId: string };
    }): Promise<PrismaProfileFrequentRoutesRecord | null>;
    upsert(args: {
      where: { shipperId: string };
      create: {
        shipperId: string;
        routes: ShipperFrequentRoute[];
        clientUpdatedAt?: Date;
      };
      update: {
        routes: ShipperFrequentRoute[];
        clientUpdatedAt: Date | null;
      };
    }): Promise<PrismaProfileFrequentRoutesRecord>;
  };
};

export class PrismaProfileFrequentRoutesRepository
  implements ProfileFrequentRoutesRepository
{
  constructor(private readonly prisma: PrismaProfileFrequentRoutesClient) {}

  async findFrequentRoutesByShipperId(shipperId: string) {
    const frequentRoutes = await this.prisma.shipperFrequentRoutes.findUnique({
      where: { shipperId },
    });

    return frequentRoutes
      ? mapPrismaProfileFrequentRoutes(frequentRoutes)
      : undefined;
  }

  async saveFrequentRoutes(
    shipperId: string,
    input: SaveShipperProfileFrequentRoutesRequest,
  ): Promise<ShipperProfileFrequentRoutesRecord> {
    const clientUpdatedAt = input.clientUpdatedAtIso
      ? new Date(input.clientUpdatedAtIso)
      : undefined;
    const frequentRoutes = await this.prisma.shipperFrequentRoutes.upsert({
      where: { shipperId },
      create: {
        shipperId,
        routes: input.routes,
        clientUpdatedAt,
      },
      update: {
        routes: input.routes,
        clientUpdatedAt: clientUpdatedAt ?? null,
      },
    });

    return mapPrismaProfileFrequentRoutes(frequentRoutes);
  }
}

function mapPrismaProfileFrequentRoutes(
  frequentRoutes: PrismaProfileFrequentRoutesRecord,
): ShipperProfileFrequentRoutesRecord {
  return {
    shipperId: frequentRoutes.shipperId,
    routes: toFrequentRoutes(frequentRoutes.routes),
    clientUpdatedAtIso: frequentRoutes.clientUpdatedAt?.toISOString(),
    updatedAtIso: frequentRoutes.updatedAt.toISOString(),
  };
}

function toFrequentRoutes(value: unknown): ShipperFrequentRoute[] {
  return Array.isArray(value) ? (value as ShipperFrequentRoute[]) : [];
}
