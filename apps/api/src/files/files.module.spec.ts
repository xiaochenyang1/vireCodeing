import { createFilesMaintenanceSchedulerConfigFromEnv } from './files.module';

describe('FilesModule', () => {
  it('creates pending cleanup scheduler config from environment', () => {
    expect(
      createFilesMaintenanceSchedulerConfigFromEnv({
        FILE_PENDING_CLEANUP_INTERVAL_SECONDS: '3600',
      }),
    ).toEqual({
      intervalSeconds: 3600,
    });
  });

  it('leaves pending cleanup scheduler disabled by default', () => {
    expect(createFilesMaintenanceSchedulerConfigFromEnv({})).toEqual({});
  });
});
