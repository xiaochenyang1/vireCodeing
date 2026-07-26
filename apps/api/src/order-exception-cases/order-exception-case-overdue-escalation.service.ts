import { Injectable } from '@nestjs/common';
import type {
  OrderExceptionCaseOverdueEscalationSweepResult,
  OrderExceptionCaseOverdueEscalationSweepTrigger,
  OrderExceptionCaseRecord,
  OrderExceptionCaseSlaSnapshot,
  OrderExceptionCaseStatus,
} from './dto';
import {
  buildOrderExceptionCaseSlaSnapshot,
  createOrderExceptionCaseAutoEscalationAdminUserId,
} from './order-exception-case-helpers';
import type { OrdersRepository } from '../orders/orders.repository';

const EXCEPTION_CASE_SLA_MATCH_PAGE_SIZE = 200;

@Injectable()
export class OrderExceptionCaseOverdueEscalationService {
  constructor(
    private readonly repository: OrdersRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async sweepOverdueCases(
    trigger: OrderExceptionCaseOverdueEscalationSweepTrigger,
  ): Promise<OrderExceptionCaseOverdueEscalationSweepResult> {
    const triggeredAt = this.now();
    const triggeredAtIso = triggeredAt.toISOString();
    const openCases = await this.listOpenCases();
    const overdueCases = openCases
      .map(exceptionCase => ({
        exceptionCase,
        sla: buildOrderExceptionCaseSlaSnapshot(exceptionCase, triggeredAt),
      }))
      .filter(
        (
          candidate,
        ): candidate is {
          exceptionCase: OrderExceptionCaseRecord;
          sla: OrderExceptionCaseSlaSnapshot & { status: 'overdue' };
        } => candidate.sla.status === 'overdue',
      );
    const result: OrderExceptionCaseOverdueEscalationSweepResult = {
      trigger,
      triggeredAtIso,
      scannedCount: openCases.length,
      overdueCount: overdueCases.length,
      escalatedCount: 0,
      skippedCount: 0,
      conflictCount: 0,
      escalatedCaseIds: [],
    };

    for (const { exceptionCase, sla } of overdueCases) {
      if (hasOrderExceptionCaseAutoEscalation(exceptionCase, sla.stage)) {
        result.skippedCount += 1;
        continue;
      }

      const appendResult = await this.repository.appendOrderExceptionCaseAction(
        exceptionCase.id,
        createOrderExceptionCaseAutoEscalationAdminUserId(sla.stage),
        exceptionCase.status,
        {
          baseUpdatedAtIso: exceptionCase.updatedAtIso,
          content: createOrderExceptionCaseAutoEscalationContent(
            exceptionCase,
            sla,
          ),
        },
      );

      if (!appendResult || appendResult === 'conflict') {
        result.conflictCount += 1;
        continue;
      }

      if (appendResult === 'state-invalid') {
        result.skippedCount += 1;
        continue;
      }

      result.escalatedCount += 1;
      result.escalatedCaseIds.push(appendResult.id);
    }

    return result;
  }

  private async listOpenCases() {
    const [pendingCases, processingCases] = await Promise.all([
      this.listAllCasesByStatus('pending'),
      this.listAllCasesByStatus('processing'),
    ]);

    return [...pendingCases, ...processingCases].sort(
      (left, right) =>
        right.updatedAtIso.localeCompare(left.updatedAtIso) ||
        right.createdAtIso.localeCompare(left.createdAtIso),
    );
  }

  private async listAllCasesByStatus(status: OrderExceptionCaseStatus) {
    const items: OrderExceptionCaseRecord[] = [];
    let page = 1;

    while (true) {
      const result = await this.repository.listAdminOrderExceptionCases({
        page,
        pageSize: EXCEPTION_CASE_SLA_MATCH_PAGE_SIZE,
        status,
      });

      items.push(...result.items);

      if (result.items.length < EXCEPTION_CASE_SLA_MATCH_PAGE_SIZE) {
        return items;
      }

      page += 1;
    }
  }
}

function hasOrderExceptionCaseAutoEscalation(
  exceptionCase: OrderExceptionCaseRecord,
  stage: OrderExceptionCaseSlaSnapshot['stage'],
) {
  return exceptionCase.actions.some(
    action =>
      action.adminUserId ===
      createOrderExceptionCaseAutoEscalationAdminUserId(stage),
  );
}

function createOrderExceptionCaseAutoEscalationContent(
  exceptionCase: OrderExceptionCaseRecord,
  sla: OrderExceptionCaseSlaSnapshot & { status: 'overdue' },
) {
  const overdueMinutes = typeof sla.overdueMinutes === 'number' ? sla.overdueMinutes : 0;

  return sla.stage === 'acceptance'
    ? `系统检测到异常工单 ${exceptionCase.caseNo} 受理 SLA 已超时 ${overdueMinutes} 分钟，已自动升级给值班客服跟进。`
    : `系统检测到异常工单 ${exceptionCase.caseNo} 解决 SLA 已超时 ${overdueMinutes} 分钟，已自动升级给值班客服继续处理。`;
}
