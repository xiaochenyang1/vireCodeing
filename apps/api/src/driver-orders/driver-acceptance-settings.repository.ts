import type {
  DriverAcceptanceSettingsRecord,
  SaveDriverAcceptanceSettingsRequest,
} from './dto';

export interface DriverAcceptanceSettingsRepository {
  getAcceptanceSettings(
    driverId: string,
  ): Promise<DriverAcceptanceSettingsRecord>;
  saveAcceptanceSettings(
    driverId: string,
    input: SaveDriverAcceptanceSettingsRequest,
  ): Promise<DriverAcceptanceSettingsRecord>;
}

const DEFAULT_MAX_DISTANCE_KM = 50;

export class InMemoryDriverAcceptanceSettingsRepository
  implements DriverAcceptanceSettingsRepository
{
  private readonly settings = new Map<string, DriverAcceptanceSettingsRecord>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async getAcceptanceSettings(driverId: string) {
    return (
      this.settings.get(driverId) ??
      createDefaultDriverAcceptanceSettings(driverId, this.now().toISOString())
    );
  }

  async saveAcceptanceSettings(
    driverId: string,
    input: SaveDriverAcceptanceSettingsRequest,
  ) {
    const nowIso = this.now().toISOString();
    const current =
      this.settings.get(driverId) ??
      createDefaultDriverAcceptanceSettings(driverId, nowIso);
    const nextSettings: DriverAcceptanceSettingsRecord = {
      driverId,
      isOnline: input.isOnline,
      maxDistanceKm: input.maxDistanceKm,
      vehicleTypePreferences: [...input.vehicleTypePreferences],
      createdAtIso: current.createdAtIso,
      updatedAtIso: nowIso,
    };

    this.settings.set(driverId, nextSettings);

    return nextSettings;
  }
}

export type PrismaDriverAcceptanceSettingsRecord = {
  driverId: string;
  isOnline: boolean;
  maxDistanceKm: number;
  vehicleTypePreferences: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type PrismaDriverAcceptanceSettingsClient = {
  driverAcceptanceSettings: {
    findUnique(args: {
      where: { driverId: string };
    }): Promise<PrismaDriverAcceptanceSettingsRecord | null>;
    upsert(args: {
      where: { driverId: string };
      create: {
        driverId: string;
        isOnline: boolean;
        maxDistanceKm: number;
        vehicleTypePreferences: string[];
      };
      update: {
        isOnline: boolean;
        maxDistanceKm: number;
        vehicleTypePreferences: string[];
      };
    }): Promise<PrismaDriverAcceptanceSettingsRecord>;
  };
};

export class PrismaDriverAcceptanceSettingsRepository
  implements DriverAcceptanceSettingsRepository
{
  constructor(private readonly prisma: PrismaDriverAcceptanceSettingsClient) {}

  async getAcceptanceSettings(driverId: string) {
    const settings = await this.prisma.driverAcceptanceSettings.findUnique({
      where: { driverId },
    });

    return settings
      ? mapPrismaDriverAcceptanceSettings(settings)
      : createDefaultDriverAcceptanceSettings(driverId, new Date().toISOString());
  }

  async saveAcceptanceSettings(
    driverId: string,
    input: SaveDriverAcceptanceSettingsRequest,
  ) {
    const settings = await this.prisma.driverAcceptanceSettings.upsert({
      where: { driverId },
      create: {
        driverId,
        isOnline: input.isOnline,
        maxDistanceKm: input.maxDistanceKm,
        vehicleTypePreferences: input.vehicleTypePreferences,
      },
      update: {
        isOnline: input.isOnline,
        maxDistanceKm: input.maxDistanceKm,
        vehicleTypePreferences: input.vehicleTypePreferences,
      },
    });

    return mapPrismaDriverAcceptanceSettings(settings);
  }
}

function createDefaultDriverAcceptanceSettings(
  driverId: string,
  nowIso: string,
): DriverAcceptanceSettingsRecord {
  return {
    driverId,
    isOnline: true,
    maxDistanceKm: DEFAULT_MAX_DISTANCE_KM,
    vehicleTypePreferences: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}

function mapPrismaDriverAcceptanceSettings(
  record: PrismaDriverAcceptanceSettingsRecord,
): DriverAcceptanceSettingsRecord {
  return {
    driverId: record.driverId,
    isOnline: record.isOnline,
    maxDistanceKm: record.maxDistanceKm,
    vehicleTypePreferences: normalizeVehicleTypePreferences(
      record.vehicleTypePreferences,
    ),
    createdAtIso: record.createdAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
  };
}

function normalizeVehicleTypePreferences(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
}
