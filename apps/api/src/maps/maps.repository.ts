import type {
  DriverLocationSnapshotRecord,
  DriverLocationSource,
  NavigationTarget,
  ReportDriverLocationRequest,
} from './dto';

export type DriverLocationOrderContext = {
  id: string;
  orderNo: string;
  shipperId: string;
  assignedDriverId?: string | null;
  status: string;
  pickup: NavigationTarget;
  delivery: NavigationTarget;
};

export type UpsertDriverLocationInput = ReportDriverLocationRequest & {
  driverId: string;
  recordedAt: Date;
};

export type MapsOrdersLookup = {
  findOrderLocationContext(orderId: string): Promise<DriverLocationOrderContext | null>;
};

export class InMemoryMapsRepository {
  private readonly snapshots = new Map<string, DriverLocationSnapshotRecord>();

  constructor(private readonly ordersLookup: MapsOrdersLookup) {}

  async upsertDriverLocation(
    input: UpsertDriverLocationInput,
  ): Promise<DriverLocationSnapshotRecord> {
    const recordedAtIso = input.recordedAt.toISOString();
    const record: DriverLocationSnapshotRecord = {
      driverId: input.driverId,
      ...(input.orderId ? { orderId: input.orderId } : {}),
      latitude: input.latitude,
      longitude: input.longitude,
      ...(input.accuracyMeters === undefined
        ? {}
        : { accuracyMeters: input.accuracyMeters }),
      source: input.source ?? 'device',
      recordedAtIso,
      updatedAtIso: recordedAtIso,
    };
    this.snapshots.set(input.driverId, record);
    return structuredClone(record);
  }

  async findDriverLocation(
    driverId: string,
  ): Promise<DriverLocationSnapshotRecord | null> {
    const snapshot = this.snapshots.get(driverId);
    return snapshot ? structuredClone(snapshot) : null;
  }

  async findOrderLocationContext(orderId: string) {
    return this.ordersLookup.findOrderLocationContext(orderId);
  }
}

type PrismaMapsClient = {
  driverLocationSnapshot: {
    upsert(args: {
      where: { driverId: string };
      create: {
        driverId: string;
        orderId: string | null;
        latitude: number;
        longitude: number;
        accuracyMeters: number | null;
        source: DriverLocationSource;
        recordedAt: Date;
        updatedAt: Date;
      };
      update: {
        orderId: string | null;
        latitude: number;
        longitude: number;
        accuracyMeters: number | null;
        source: DriverLocationSource;
        recordedAt: Date;
        updatedAt: Date;
      };
    }): Promise<{
      driverId: string;
      orderId: string | null;
      latitude: { toNumber(): number } | number;
      longitude: { toNumber(): number } | number;
      accuracyMeters: number | null;
      source: DriverLocationSource;
      recordedAt: Date;
      updatedAt: Date;
    }>;
    findUnique(args: {
      where: { driverId: string };
    }): Promise<{
      driverId: string;
      orderId: string | null;
      latitude: { toNumber(): number } | number;
      longitude: { toNumber(): number } | number;
      accuracyMeters: number | null;
      source: DriverLocationSource;
      recordedAt: Date;
      updatedAt: Date;
    } | null>;
  };
};

export class PrismaMapsRepository {
  constructor(
    private readonly prisma: PrismaMapsClient,
    private readonly ordersLookup: MapsOrdersLookup,
  ) {}

  async upsertDriverLocation(
    input: UpsertDriverLocationInput,
  ): Promise<DriverLocationSnapshotRecord> {
    const record = await this.prisma.driverLocationSnapshot.upsert({
      where: { driverId: input.driverId },
      create: {
        driverId: input.driverId,
        orderId: input.orderId ?? null,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMeters: input.accuracyMeters ?? null,
        source: input.source ?? 'device',
        recordedAt: input.recordedAt,
        updatedAt: input.recordedAt,
      },
      update: {
        orderId: input.orderId ?? null,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMeters: input.accuracyMeters ?? null,
        source: input.source ?? 'device',
        recordedAt: input.recordedAt,
        updatedAt: input.recordedAt,
      },
    });

    return mapSnapshot(record);
  }

  async findDriverLocation(
    driverId: string,
  ): Promise<DriverLocationSnapshotRecord | null> {
    const record = await this.prisma.driverLocationSnapshot.findUnique({
      where: { driverId },
    });
    return record ? mapSnapshot(record) : null;
  }

  async findOrderLocationContext(orderId: string) {
    return this.ordersLookup.findOrderLocationContext(orderId);
  }
}

function mapSnapshot(record: {
  driverId: string;
  orderId: string | null;
  latitude: { toNumber(): number } | number;
  longitude: { toNumber(): number } | number;
  accuracyMeters: number | null;
  source: DriverLocationSource;
  recordedAt: Date;
  updatedAt: Date;
}): DriverLocationSnapshotRecord {
  return {
    driverId: record.driverId,
    ...(record.orderId ? { orderId: record.orderId } : {}),
    latitude: decimalToNumber(record.latitude),
    longitude: decimalToNumber(record.longitude),
    ...(record.accuracyMeters === null
      ? {}
      : { accuracyMeters: record.accuracyMeters }),
    source: record.source,
    recordedAtIso: record.recordedAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
  };
}

function decimalToNumber(value: { toNumber(): number } | number) {
  return typeof value === 'number' ? value : value.toNumber();
}
