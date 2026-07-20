import type {
  ClaimedRefundOutboxEvent,
  FailRefundOutboxRequestInput,
  FailRefundOutboxRequestResult,
  PaymentsRepository,
} from './payments.repository';

export type RefundOutboxProcessor = {
  processRefundOutboxEvent(
    claim: ClaimedRefundOutboxEvent,
  ): Promise<void>;
};

type RefundOutboxRepository = Pick<
  PaymentsRepository,
  'claimRefundOutboxEvents'
> & {
  failRefundOutboxRequest(
    input: FailRefundOutboxRequestInput,
  ): Promise<FailRefundOutboxRequestResult>;
};

export class FinancialOutboxWorker {
  private readonly workerId: string;
  private readonly batchSize: number;
  private readonly leaseDurationMs: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly repository: RefundOutboxRepository,
    private readonly processor: RefundOutboxProcessor,
    options: {
      workerId: string;
      batchSize?: number;
      leaseDurationMs?: number;
      retryBaseDelayMs?: number;
      retryMaxDelayMs?: number;
      now?: () => Date;
    },
  ) {
    this.workerId = options.workerId;
    this.batchSize = options.batchSize ?? 20;
    this.leaseDurationMs = options.leaseDurationMs ?? 30_000;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 1_000;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 60_000;
    this.now = options.now ?? (() => new Date());
  }

  async runOnce() {
    const claims = await this.repository.claimRefundOutboxEvents({
      workerId: this.workerId,
      limit: this.batchSize,
      nowIso: this.now().toISOString(),
      leaseDurationMs: this.leaseDurationMs,
    });

    let succeededCount = 0;
    let failedCount = 0;
    let deadCount = 0;

    for (const claim of claims) {
      try {
        await this.processor.processRefundOutboxEvent(claim);
        succeededCount += 1;
      } catch (error) {
        const failedAt = this.now();
        const retryDelayMs = Math.min(
          this.retryBaseDelayMs * 2 ** (claim.event.attemptCount - 1),
          this.retryMaxDelayMs,
        );
        const failureResult = await this.repository.failRefundOutboxRequest({
          outboxEventId: claim.event.id,
          workerId: claim.event.claimedBy,
          claimAttempt: claim.event.attemptCount,
          failureCode: 'provider_request_failed',
          failureMessage:
            error instanceof Error ? error.message : 'Refund provider failed',
          failedAtIso: failedAt.toISOString(),
          nextAvailableAtIso: new Date(
            failedAt.getTime() + retryDelayMs,
          ).toISOString(),
        });
        if (failureResult.kind === 'dead') {
          deadCount += 1;
        }
        failedCount += 1;
      }
    }

    return {
      claimedCount: claims.length,
      succeededCount,
      failedCount,
      deadCount,
    };
  }
}
