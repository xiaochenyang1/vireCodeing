import { readFileSync } from 'fs';
import { join } from 'path';

describe('maps location first slice migration', () => {
  const migrationSql = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      'prisma',
      'migrations',
      '20260721010000_maps_location_first_slice',
      'migration.sql',
    ),
    'utf8',
  );
  const schema = readFileSync(
    join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );

  it('adds order location coordinate fields', () => {
    expect(schema).toContain('enum OrderLocationGeocodeStatus');
    expect(schema).toContain('latitude      Decimal?');
    expect(schema).toContain('longitude     Decimal?');
    expect(schema).toContain('geocodeStatus OrderLocationGeocodeStatus');
    expect(migrationSql).toContain(
      'CREATE TYPE "OrderLocationGeocodeStatus" AS ENUM',
    );
    expect(migrationSql).toContain('ADD COLUMN "latitude" DECIMAL(10,7)');
    expect(migrationSql).toContain('ADD COLUMN "longitude" DECIMAL(10,7)');
    expect(migrationSql).toContain(
      'ADD COLUMN "geocodeStatus" "OrderLocationGeocodeStatus" NOT NULL DEFAULT \'none\'',
    );
  });

  it('creates the driver location snapshot table', () => {
    expect(schema).toContain('model DriverLocationSnapshot');
    expect(schema).toContain('enum DriverLocationSource');
    expect(migrationSql).toContain('CREATE TABLE "DriverLocationSnapshot"');
    expect(migrationSql).toContain(
      'CREATE TYPE "DriverLocationSource" AS ENUM',
    );
    expect(migrationSql).toContain(
      'DriverLocationSnapshot_order_recorded_idx',
    );
  });
});
