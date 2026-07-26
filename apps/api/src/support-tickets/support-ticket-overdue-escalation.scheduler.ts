import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SupportTicketOverdueEscalationService } from './support-ticket-overdue-escalation.service';

export type SupportTicketOverdueEscalationSchedulerConfig = {
  intervalSeconds?: number;
};

export type SupportTicketOverdueEscalationSchedulerLogger = Pick<Logger, 'error'>;

@Injectable()
export class SupportTicketOverdueEscalationScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private sweepTimer?: NodeJS.Timeout;
  private sweepInFlight = false;

  constructor(
    private readonly service: Pick<
      SupportTicketOverdueEscalationService,
      'sweepOverdueTickets'
    >,
    private readonly config: SupportTicketOverdueEscalationSchedulerConfig = {},
    private readonly logger: SupportTicketOverdueEscalationSchedulerLogger = new Logger(
      SupportTicketOverdueEscalationScheduler.name,
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
        await this.service.sweepOverdueTickets('scheduler');
      } catch (error) {
        this.logger.error('Support ticket overdue escalation sweep failed', error);
      }
    } finally {
      this.sweepInFlight = false;
    }
  }
}
