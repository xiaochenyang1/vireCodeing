import type { SaveShipperOrderDraftRequest } from './dto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { OrderDraftsRepository } from './order-drafts.repository';

const ORDER_DRAFT_EXPIRES_IN_MS = 24 * 60 * 60 * 1000;
const ORDER_DRAFT_CONFLICT_MESSAGE =
  '发单草稿已被其他设备更新，请先拉取最新草稿后再保存。';

export class OrderDraftsService {
  constructor(
    private readonly repository: OrderDraftsRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getDraft(shipperId: string) {
    const draft = await this.repository.findDraftByShipperId(shipperId);

    if (!draft || isExpiredDraft(draft.updatedAtIso, this.now())) {
      return undefined;
    }

    return draft;
  }

  async saveDraft(shipperId: string, input: SaveShipperOrderDraftRequest) {
    const currentDraft = await this.repository.findDraftByShipperId(shipperId);

    if (
      currentDraft &&
      !isExpiredDraft(currentDraft.updatedAtIso, this.now()) &&
      input.baseUpdatedAtIso &&
      !isSameInstant(currentDraft.updatedAtIso, input.baseUpdatedAtIso)
    ) {
      throw new BusinessError(
        ApiErrorCode.ORDER_DRAFT_CONFLICT,
        ORDER_DRAFT_CONFLICT_MESSAGE,
      );
    }

    return this.repository.saveDraft(shipperId, input);
  }
}

function isExpiredDraft(updatedAtIso: string, now: Date) {
  return now.getTime() - Date.parse(updatedAtIso) > ORDER_DRAFT_EXPIRES_IN_MS;
}

function isSameInstant(leftIso: string, rightIso: string) {
  return Date.parse(leftIso) === Date.parse(rightIso);
}
