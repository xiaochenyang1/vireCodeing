import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OrderExceptionCaseOverdueEscalationService } from './order-exception-case-overdue-escalation.service';

export type OrderExceptionCaseOverdueEscalationSchedulerConfig = {
  intervalSeconds?: number;
};

export type OrderExceptionCaseOverdueEscalationSchedulerLogger = Pick<
  Logger,
  'error'
>;

@Injectable()
export class OrderExceptionCaseOverdueEscalationScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private sweepTimer?: NodeJS.Timeout;
  private sweepInFlight = false;

  constructor(
    private readonly service: Pick<
      OrderExceptionCaseOverdueEscalationService,
      'sweepOverdueCases'
    >,
    private readonly config: OrderExceptionCaseOverdueEscalationSchedulerConfig = {},
    private readonly logger: OrderExceptionCaseOverdueEscalationSchedulerLogger = new Logger(
      OrderExceptionCaseOverdueEscalationScheduler.name,
    ),
  ) {}

  onModuleInit() {
    if (!this.config.intervalSeconds) {
      return;
    }

    this.sweepTimer = setInterval(() => {
      this.runSweep();
    }, this.config.intervalSeconds * 1000);
  }

  onModuleDestroy() {
    if (!this.sweepTimer) {
      return;
    }

    clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
  }

  private async runSweep() {
    if (this.sweepInFlight) {
      return;
    }

    this.sweepInFlight = true;

    try {
      try {
        await this.service.sweepOverdueCases('scheduler');
      } catch (error) {
        this.logger.error(
          'Order exception case overdue escalation sweep failed',
          error,
        );
      }
    } finally {
      this.sweepInFlight = false;
    }
  }
}
