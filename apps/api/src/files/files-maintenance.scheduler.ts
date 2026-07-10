import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FilesService } from './files.service';

export type FilesMaintenanceSchedulerConfig = {
  intervalSeconds?: number;
};

export type FilesMaintenanceSchedulerLogger = Pick<Logger, 'error'>;

@Injectable()
export class FilesMaintenanceScheduler implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: NodeJS.Timeout;
  private cleanupInFlight = false;

  constructor(
    private readonly filesService: Pick<
      FilesService,
      'rejectExpiredPendingFiles' | 'deleteRejectedFileObjects'
    >,
    private readonly config: FilesMaintenanceSchedulerConfig = {},
    private readonly logger: FilesMaintenanceSchedulerLogger = new Logger(
      FilesMaintenanceScheduler.name,
    ),
  ) {}

  onModuleInit() {
    if (!this.config.intervalSeconds) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.runCleanup();
    }, this.config.intervalSeconds * 1000);
  }

  onModuleDestroy() {
    if (!this.cleanupTimer) {
      return;
    }

    clearInterval(this.cleanupTimer);
    this.cleanupTimer = undefined;
  }

  private async runCleanup() {
    if (this.cleanupInFlight) {
      return;
    }

    this.cleanupInFlight = true;

    try {
      try {
        await this.filesService.rejectExpiredPendingFiles();
      } catch (error) {
        this.logger.error('Expired pending file cleanup failed', error);
        return;
      }

      try {
        await this.filesService.deleteRejectedFileObjects();
      } catch (error) {
        this.logger.error('Rejected file object deletion retry failed', error);
      }
    } finally {
      this.cleanupInFlight = false;
    }
  }
}
