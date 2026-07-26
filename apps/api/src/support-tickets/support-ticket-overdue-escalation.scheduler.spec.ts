import { SupportTicketOverdueEscalationScheduler } from './support-ticket-overdue-escalation.scheduler';
import type { SupportTicketOverdueEscalationService } from './support-ticket-overdue-escalation.service';

describe('SupportTicketOverdueEscalationScheduler', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not start sweep when no interval is configured', async () => {
    jest.useFakeTimers();
    const service = createService();
    const scheduler = new SupportTicketOverdueEscalationScheduler(service, {});

    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(60_000);

    expect(service.sweepOverdueTickets).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });

  it('runs overdue sweep on the configured interval', async () => {
    jest.useFakeTimers();
    const service = createService();
    const scheduler = new SupportTicketOverdueEscalationScheduler(service, {
      intervalSeconds: 30,
    });

    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(29_999);
    expect(service.sweepOverdueTickets).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);

    expect(service.sweepOverdueTickets).toHaveBeenCalledTimes(1);
    expect(service.sweepOverdueTickets).toHaveBeenCalledWith('scheduler');
    scheduler.onModuleDestroy();
  });

  it('does not start overlapping overdue sweeps', async () => {
    jest.useFakeTimers();
    let resolveSweep: () => void = () => undefined;
    const service = createService();
    service.sweepOverdueTickets.mockReturnValue(
      new Promise(resolve => {
        resolveSweep = () =>
          resolve({
            trigger: 'scheduler',
            triggeredAtIso: '2026-07-22T10:00:00.000Z',
            scannedCount: 1,
            overdueCount: 1,
            escalatedCount: 1,
            skippedCount: 0,
            conflictCount: 0,
            escalatedTicketIds: ['ticket-1'],
          });
      }),
    );
    const scheduler = new SupportTicketOverdueEscalationScheduler(service, {
      intervalSeconds: 10,
    });

    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(10_000);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(service.sweepOverdueTickets).toHaveBeenCalledTimes(1);

    resolveSweep();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(10_000);

    expect(service.sweepOverdueTickets).toHaveBeenCalledTimes(2);
    scheduler.onModuleDestroy();
  });

  it('logs failures and keeps future intervals alive', async () => {
    jest.useFakeTimers();
    const service = createService();
    const logger = {
      error: jest.fn(),
    };
    service.sweepOverdueTickets
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({
        trigger: 'scheduler',
        triggeredAtIso: '2026-07-22T10:00:00.000Z',
        scannedCount: 0,
        overdueCount: 0,
        escalatedCount: 0,
        skippedCount: 0,
        conflictCount: 0,
        escalatedTicketIds: [],
      });
    const scheduler = new SupportTicketOverdueEscalationScheduler(
      service,
      {
        intervalSeconds: 10,
      },
      logger,
    );

    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(10_000);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(service.sweepOverdueTickets).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      'Support ticket overdue escalation sweep failed',
      expect.any(Error),
    );
    scheduler.onModuleDestroy();
  });

  it('clears the timer on module destroy', async () => {
    jest.useFakeTimers();
    const service = createService();
    const scheduler = new SupportTicketOverdueEscalationScheduler(service, {
      intervalSeconds: 10,
    });

    scheduler.onModuleInit();
    scheduler.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(10_000);

    expect(service.sweepOverdueTickets).not.toHaveBeenCalled();
  });
});

function createService() {
  return {
    sweepOverdueTickets: jest.fn().mockResolvedValue({
      trigger: 'scheduler',
      triggeredAtIso: '2026-07-22T10:00:00.000Z',
      scannedCount: 0,
      overdueCount: 0,
      escalatedCount: 0,
      skippedCount: 0,
      conflictCount: 0,
      escalatedTicketIds: [],
    }),
  } as unknown as jest.Mocked<
    Pick<SupportTicketOverdueEscalationService, 'sweepOverdueTickets'>
  >;
}
