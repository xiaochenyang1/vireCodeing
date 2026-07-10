import { FilesMaintenanceScheduler } from './files-maintenance.scheduler';
import type { FilesService } from './files.service';

describe('FilesMaintenanceScheduler', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not start cleanup when no interval is configured', async () => {
    jest.useFakeTimers();
    const service = createFilesService();
    const scheduler = new FilesMaintenanceScheduler(service, {});

    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(60_000);

    expect(service.rejectExpiredPendingFiles).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });

  it('runs expired pending file cleanup on the configured interval', async () => {
    jest.useFakeTimers();
    const service = createFilesService();
    const scheduler = new FilesMaintenanceScheduler(service, {
      intervalSeconds: 30,
    });

    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(29_999);
    expect(service.rejectExpiredPendingFiles).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);

    expect(service.rejectExpiredPendingFiles).toHaveBeenCalledTimes(1);
    expect(service.deleteRejectedFileObjects).toHaveBeenCalledTimes(1);
    scheduler.onModuleDestroy();
  });

  it('runs rejected file object deletion retry after expired pending cleanup', async () => {
    jest.useFakeTimers();
    const service = createFilesService();
    const scheduler = new FilesMaintenanceScheduler(service, {
      intervalSeconds: 30,
    });

    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(30_000);

    expect(service.rejectExpiredPendingFiles).toHaveBeenCalledTimes(1);
    expect(service.deleteRejectedFileObjects).toHaveBeenCalledTimes(1);
    expect(
      service.deleteRejectedFileObjects.mock.invocationCallOrder[0],
    ).toBeGreaterThan(
      service.rejectExpiredPendingFiles.mock.invocationCallOrder[0],
    );
    scheduler.onModuleDestroy();
  });

  it('does not start overlapping cleanup runs', async () => {
    jest.useFakeTimers();
    let resolveCleanup: () => void = () => undefined;
    const service = createFilesService();
    service.rejectExpiredPendingFiles.mockReturnValue(
      new Promise(resolve => {
        resolveCleanup = () =>
          resolve({
            rejectedCount: 1,
            deletedObjectCount: 1,
            failedObjectDeletionCount: 0,
            cutoffIso: '2026-07-07T05:00:00.000Z',
          });
      }),
    );
    const scheduler = new FilesMaintenanceScheduler(service, {
      intervalSeconds: 10,
    });

    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(10_000);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(service.rejectExpiredPendingFiles).toHaveBeenCalledTimes(1);
    expect(service.deleteRejectedFileObjects).not.toHaveBeenCalled();

    resolveCleanup();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(10_000);

    expect(service.rejectExpiredPendingFiles).toHaveBeenCalledTimes(2);
    expect(service.deleteRejectedFileObjects).toHaveBeenCalledTimes(2);
    scheduler.onModuleDestroy();
  });

  it('logs rejected object deletion retry failures and keeps future intervals alive', async () => {
    jest.useFakeTimers();
    const service = createFilesService();
    const logger = {
      error: jest.fn(),
    };
    service.deleteRejectedFileObjects
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce({
        attemptedObjectCount: 0,
        deletedObjectCount: 0,
        failedObjectDeletionCount: 0,
      });
    const scheduler = new FilesMaintenanceScheduler(
      service,
      {
        intervalSeconds: 10,
      },
      logger,
    );

    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(10_000);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(service.rejectExpiredPendingFiles).toHaveBeenCalledTimes(2);
    expect(service.deleteRejectedFileObjects).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      'Rejected file object deletion retry failed',
      expect.any(Error),
    );
    scheduler.onModuleDestroy();
  });

  it('logs cleanup failures and keeps future intervals alive', async () => {
    jest.useFakeTimers();
    const service = createFilesService();
    const logger = {
      error: jest.fn(),
    };
    service.rejectExpiredPendingFiles
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({
        rejectedCount: 0,
        deletedObjectCount: 0,
        failedObjectDeletionCount: 0,
        cutoffIso: '2026-07-07T05:00:00.000Z',
      });
    const scheduler = new FilesMaintenanceScheduler(
      service,
      {
        intervalSeconds: 10,
      },
      logger,
    );

    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(10_000);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(service.rejectExpiredPendingFiles).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      'Expired pending file cleanup failed',
      expect.any(Error),
    );
    scheduler.onModuleDestroy();
  });

  it('clears the cleanup timer on module destroy', async () => {
    jest.useFakeTimers();
    const service = createFilesService();
    const scheduler = new FilesMaintenanceScheduler(service, {
      intervalSeconds: 10,
    });

    scheduler.onModuleInit();
    scheduler.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(10_000);

    expect(service.rejectExpiredPendingFiles).not.toHaveBeenCalled();
  });
});

function createFilesService() {
  return {
    rejectExpiredPendingFiles: jest.fn().mockResolvedValue({
      rejectedCount: 0,
      deletedObjectCount: 0,
      failedObjectDeletionCount: 0,
      cutoffIso: '2026-07-07T05:00:00.000Z',
    }),
    deleteRejectedFileObjects: jest.fn().mockResolvedValue({
      attemptedObjectCount: 0,
      deletedObjectCount: 0,
      failedObjectDeletionCount: 0,
    }),
  } as unknown as jest.Mocked<
    Pick<FilesService, 'rejectExpiredPendingFiles' | 'deleteRejectedFileObjects'>
  >;
}
