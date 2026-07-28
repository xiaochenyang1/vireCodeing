import type { AuthenticatedUser } from '../auth/dto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { FileUploadRecord } from '../files/dto';
import {
  LocalFilePreviewUrlSigner,
  type FilePreviewUrlSigner,
} from '../files/file-preview-url.signer';
import type { FilesRepository } from '../files/files.repository';
import type {
  AdminEvaluationAuditAttachmentPreview,
  AdminEvaluationDirection,
  AdminEvaluationAuditListQuery,
  AdminEvaluationAuditListResult,
  AdminEvaluationAuditRecord,
  AdminEvaluationModerationEventRecord,
  AdminEvaluationModerationSnapshot,
  EvaluationAppealCaseListResult,
  EvaluationAppealEventRecord,
  EvaluationAppealSnapshot,
  ModerateAdminEvaluationRequest,
  ResolveAdminEvaluationAppealRequest,
  SubmitEvaluationAppealRequest,
  ShipperProfileEvaluationOrderEventRecord,
  ShipperProfileEvaluationOrderRecord,
  ShipperProfileEvaluationRecord,
  ShipperProfileEvaluationSnapshot,
  ShipperReceivedEvaluationRecord,
  ShipperReceivedEvaluationSnapshot,
} from './dto';
import type { ProfileEvaluationsRepository } from './profile-evaluations.repository';

type DriverOrderEventSnapshot = {
  driverName?: string;
};

export class ProfileEvaluationsService {
  constructor(
    private readonly repository: ProfileEvaluationsRepository,
    private readonly filesRepository?: FilesRepository,
    private readonly previewUrlSigner: FilePreviewUrlSigner =
      new LocalFilePreviewUrlSigner(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listRecords(
    shipperId: string,
  ): Promise<ShipperProfileEvaluationSnapshot> {
    const items = (await this.repository.listOrders(shipperId))
      .flatMap(createEvaluationRecords)
      .sort((left, right) =>
        right.submittedAtIso.localeCompare(left.submittedAtIso),
      );

    return {
      shipperId,
      items,
    };
  }

  async listReceivedRecords(
    shipperId: string,
  ): Promise<ShipperReceivedEvaluationSnapshot> {
    const items = (await this.repository.listReceivedEvaluationOrders(shipperId))
      .flatMap(createReceivedEvaluationRecords)
      .sort((left, right) =>
        right.submittedAtIso.localeCompare(left.submittedAtIso),
      );

    return {
      shipperId,
      items,
    };
  }

  async listAdminEvaluationAudits(
    query: AdminEvaluationAuditListQuery,
  ): Promise<AdminEvaluationAuditListResult> {
    const baseItems = (await this.repository.listAdminEvaluationOrders()).flatMap(
      createAdminEvaluationAuditRecords,
    );
    const allItems = (
      await this.attachLatestEvaluationAppeals(baseItems)
    ).sort((left, right) =>
        right.submittedAtIso.localeCompare(left.submittedAtIso),
      );
    const filteredItems = allItems.filter(item =>
      matchesAdminEvaluationAuditQuery(item, query),
    );
    const offset = (query.page - 1) * query.pageSize;

    return {
      items: filteredItems.slice(offset, offset + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total: filteredItems.length,
    };
  }

  async listEvaluationAppealCases(
    currentUser: AuthenticatedUser,
  ): Promise<EvaluationAppealCaseListResult> {
    this.assertMobileUser(currentUser);
    const baseItems = (
      await this.repository.listAuthoredEvaluationOrders(currentUser.id)
    )
      .flatMap(createAdminEvaluationAuditRecords)
      .filter(item => item.reviewerUserId === currentUser.id);
    const items = (await this.attachLatestEvaluationAppeals(baseItems))
      .filter(
        item =>
          item.moderationStatus === 'hidden' || item.appealStatus !== 'none',
      )
      .sort((left, right) =>
        right.submittedAtIso.localeCompare(left.submittedAtIso),
      );

    return { userId: currentUser.id, items };
  }

  async submitEvaluationAppeal(
    currentUser: AuthenticatedUser,
    evaluationId: string,
    input: SubmitEvaluationAppealRequest,
  ): Promise<EvaluationAppealSnapshot> {
    this.assertMobileUser(currentUser);
    const result = await this.repository.submitEvaluationAppeal({
      ...input,
      evaluationId,
      appellantUserId: currentUser.id,
      submittedAtIso: this.now().toISOString(),
    });

    switch (result.kind) {
      case 'success':
        return result.appeal;
      case 'not-found':
        throw evaluationAuditNotFoundError();
      case 'not-allowed':
        throw new BusinessError(
          ApiErrorCode.EVALUATION_APPEAL_NOT_ALLOWED,
          '当前评价状态不允许申诉',
        );
      case 'conflict':
        throw new BusinessError(
          ApiErrorCode.EVALUATION_APPEAL_CONFLICT,
          '评价处置状态已更新，请刷新后重试',
        );
      case 'already-requested':
        throw new BusinessError(
          ApiErrorCode.EVALUATION_APPEAL_ALREADY_REQUESTED,
          '当前评价已有待处理申诉',
        );
    }
  }

  async getAdminEvaluationAudit(
    currentUser: AuthenticatedUser,
    evaluationId: string,
  ): Promise<AdminEvaluationAuditRecord> {
    this.assertAdmin(currentUser);

    return this.requireAdminEvaluationAudit(evaluationId);
  }

  async getAdminEvaluationAuditAttachments(
    currentUser: AuthenticatedUser,
    evaluationId: string,
  ): Promise<AdminEvaluationAuditAttachmentPreview> {
    this.assertAdmin(currentUser);
    const filesRepository = this.requireFilesRepository();
    const evaluation = await this.requireAdminEvaluationAudit(evaluationId);

    const photoFileIds = evaluation.photoFileIds ?? [];

    if (photoFileIds.length === 0) {
      return {
        evaluationId: evaluation.id,
        orderId: evaluation.orderId,
        orderNo: evaluation.orderNo,
        photoCount: evaluation.photoCount,
        items: [],
        missingFileIds: [],
      };
    }

    const files = await filesRepository.findFilesByIds(photoFileIds);
    const filesById = new Map(files.map(file => [file.id, file]));
    const items = photoFileIds.flatMap(fileId => {
      const file = filesById.get(fileId);

      return isPreviewableEvaluationAttachment(file)
        ? [mapAdminEvaluationAttachment(file, this.previewUrlSigner)]
        : [];
    });
    const missingFileIds = photoFileIds.filter(fileId => {
      const file = filesById.get(fileId);
      return !isPreviewableEvaluationAttachment(file);
    });

    return {
      evaluationId: evaluation.id,
      orderId: evaluation.orderId,
      orderNo: evaluation.orderNo,
      photoCount: evaluation.photoCount,
      items,
      missingFileIds,
    };
  }

  async listAdminEvaluationModerationEvents(
    currentUser: AuthenticatedUser,
    evaluationId: string,
  ): Promise<AdminEvaluationModerationEventRecord[]> {
    this.assertAdmin(currentUser);
    await this.requireAdminEvaluationAudit(evaluationId);

    return this.repository.listAdminEvaluationModerationEvents(evaluationId);
  }

  async listAdminEvaluationAppealEvents(
    currentUser: AuthenticatedUser,
    evaluationId: string,
  ): Promise<EvaluationAppealEventRecord[]> {
    this.assertAdmin(currentUser);
    await this.requireAdminEvaluationAudit(evaluationId);

    return this.repository.listEvaluationAppealEvents(evaluationId);
  }

  async resolveAdminEvaluationAppeal(
    currentUser: AuthenticatedUser,
    evaluationId: string,
    appealId: string,
    input: ResolveAdminEvaluationAppealRequest,
  ): Promise<AdminEvaluationAuditRecord> {
    this.assertAdmin(currentUser);
    const evaluation = await this.requireAdminEvaluationAudit(evaluationId);
    const result = await this.repository.resolveAdminEvaluationAppeal({
      ...input,
      evaluationId,
      appealId,
      adminUserId: currentUser.id,
      resolvedAtIso: this.now().toISOString(),
    });

    switch (result.kind) {
      case 'success':
        return applyLatestEvaluationAppeal(
          applyAdminEvaluationModeration(evaluation, result.moderation),
          result.appeal,
        );
      case 'not-found':
        throw new BusinessError(
          ApiErrorCode.EVALUATION_APPEAL_NOT_FOUND,
          '评价申诉不存在',
        );
      case 'not-allowed':
        throw new BusinessError(
          ApiErrorCode.EVALUATION_APPEAL_NOT_ALLOWED,
          '当前评价申诉状态不允许裁定',
        );
      case 'conflict':
        throw new BusinessError(
          ApiErrorCode.EVALUATION_APPEAL_CONFLICT,
          '评价或申诉状态已被其他管理员更新',
        );
    }
  }

  async moderateAdminEvaluation(
    currentUser: AuthenticatedUser,
    evaluationId: string,
    input: ModerateAdminEvaluationRequest,
  ): Promise<AdminEvaluationAuditRecord> {
    this.assertAdmin(currentUser);
    const evaluation = await this.requireAdminEvaluationAudit(evaluationId);
    const result = await this.repository.moderateAdminEvaluation({
      ...input,
      evaluationId,
      adminUserId: currentUser.id,
      moderatedAtIso: this.now().toISOString(),
    });

    if (result.kind === 'not-found') {
      throw evaluationAuditNotFoundError();
    }

    if (result.kind === 'conflict') {
      throw new BusinessError(
        ApiErrorCode.EVALUATION_MODERATION_CONFLICT,
        '评价处置状态已被其他管理员更新',
      );
    }

    if (result.kind === 'appeal-pending') {
      throw new BusinessError(
        ApiErrorCode.EVALUATION_APPEAL_PENDING,
        '当前评价存在待处理申诉，请先完成申诉裁定',
      );
    }

    return applyAdminEvaluationModeration(evaluation, result.moderation);
  }

  private async requireAdminEvaluationAudit(evaluationId: string) {
    const order =
      await this.repository.findAdminEvaluationOrderByEventId(evaluationId);
    const evaluation = order
      ? findAdminEvaluationAuditRecordById(order, evaluationId)
      : undefined;

    if (!evaluation) {
      throw evaluationAuditNotFoundError();
    }

    const [withAppeal] = await this.attachLatestEvaluationAppeals([evaluation]);

    return withAppeal;
  }

  private async attachLatestEvaluationAppeals(
    items: AdminEvaluationAuditRecord[],
  ) {
    const appeals = await this.repository.listLatestEvaluationAppeals(
      items.map(item => item.id),
    );
    const appealByEvaluationId = new Map(
      appeals.map(appeal => [appeal.evaluationId, appeal]),
    );

    return items.map(item =>
      applyLatestEvaluationAppeal(item, appealByEvaluationId.get(item.id)),
    );
  }

  private assertAdmin(currentUser: AuthenticatedUser) {
    if (currentUser.userType !== 'admin') {
      throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员');
    }
  }

  private assertMobileUser(currentUser: AuthenticatedUser) {
    if (
      currentUser.userType !== 'shipper' &&
      currentUser.userType !== 'driver'
    ) {
      throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不能申诉评价');
    }
  }

  private requireFilesRepository() {
    if (!this.filesRepository) {
      throw new Error('Files repository is required for evaluation attachments');
    }

    return this.filesRepository;
  }
}

function matchesAdminEvaluationAuditQuery(
  item: AdminEvaluationAuditRecord,
  query: AdminEvaluationAuditListQuery,
) {
  if (query.direction && item.direction !== query.direction) {
    return false;
  }

  if (
    query.moderationStatus &&
    item.moderationStatus !== query.moderationStatus
  ) {
    return false;
  }

  if (query.appealStatus && item.appealStatus !== query.appealStatus) {
    return false;
  }

  if (query.rating !== undefined && item.rating !== query.rating) {
    return false;
  }

  if (!query.keyword) {
    return true;
  }

  const normalizedKeyword = query.keyword.trim().toLowerCase();

  if (!normalizedKeyword) {
    return true;
  }

  return buildAdminEvaluationAuditSearchText(item).includes(normalizedKeyword);
}

function buildAdminEvaluationAuditSearchText(item: AdminEvaluationAuditRecord) {
  return [
    item.orderNo,
    item.reviewerUserId,
    item.reviewerName,
    item.revieweeUserId,
    item.revieweeName,
    item.content,
    item.submittedAtIso,
    item.direction,
    item.moderationStatus,
    item.moderationReason ?? '',
    item.appealStatus,
    item.latestAppeal?.reason ?? '',
    item.latestAppeal?.resolutionReason ?? '',
    item.direction === 'shipper_to_driver'
      ? '货主评价司机 平台货主 平台司机'
      : '司机评价货主 平台司机 平台货主',
    ...item.tags,
  ]
    .join('\n')
    .toLowerCase();
}

function createEvaluationRecords(
  order: ShipperProfileEvaluationOrderRecord,
): ShipperProfileEvaluationRecord[] {
  return order.events
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        event.eventType === 'evaluation_submitted' &&
        !isHiddenEvaluation(event),
    )
    .map(({ event, index }) => createEvaluationRecord(order, event, index))
    .filter(
      (
        record,
      ): record is ShipperProfileEvaluationRecord => record !== undefined,
    );
}

function createEvaluationRecord(
  order: ShipperProfileEvaluationOrderRecord,
  event: ShipperProfileEvaluationOrderEventRecord,
  eventIndex: number,
): ShipperProfileEvaluationRecord | undefined {
  const parsedEvaluation = parseEvaluationNote(event.noteText);

  if (!parsedEvaluation) {
    return undefined;
  }

  const photoFileIds = normalizeAttachmentFileIds(event.attachmentFileIds);
  const photoCount = photoFileIds.length || parsedEvaluation.photoCount;
  const acceptedEvent = findAcceptedDriverEvent(
    order,
    event.createdAtIso,
    eventIndex,
  );
  const driverName = resolveDriverName(
    order,
    acceptedEvent?.actorUserId,
    event.createdAtIso,
    eventIndex,
  );
  const driverReply = acceptedEvent?.actorUserId
    ? findLatestDriverReply(order, eventIndex, acceptedEvent.actorUserId)
    : undefined;

  return {
    id: event.id,
    orderId: order.id,
    orderNo: order.orderNo,
    driverName,
    rating: parsedEvaluation.rating,
    tags: parsedEvaluation.tags,
    content: parsedEvaluation.content,
    anonymous: parsedEvaluation.anonymous,
    photoCount,
    ...(photoFileIds.length > 0 ? { photoFileIds } : {}),
    submittedAtIso: event.createdAtIso,
    ...(driverReply
      ? {
          driverReplyText: driverReply.noteText.trim(),
          driverReplyAtIso: driverReply.createdAtIso,
        }
      : {}),
  };
}

function createReceivedEvaluationRecords(
  order: ShipperProfileEvaluationOrderRecord,
): ShipperReceivedEvaluationRecord[] {
  return order.events
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        event.eventType === 'shipper_evaluation_submitted' &&
        !isHiddenEvaluation(event),
    )
    .map(({ event, index }) => createReceivedEvaluationRecord(order, event, index))
    .filter(
      (
        record,
      ): record is ShipperReceivedEvaluationRecord => record !== undefined,
    );
}

function createReceivedEvaluationRecord(
  order: ShipperProfileEvaluationOrderRecord,
  event: ShipperProfileEvaluationOrderEventRecord,
  eventIndex: number,
): ShipperReceivedEvaluationRecord | undefined {
  const parsedEvaluation = parseEvaluationNote(event.noteText);

  if (!parsedEvaluation) {
    return undefined;
  }

  const photoFileIds = normalizeAttachmentFileIds(event.attachmentFileIds);
  const photoCount = photoFileIds.length || parsedEvaluation.photoCount;

  return {
    id: event.id,
    orderId: order.id,
    orderNo: order.orderNo,
    driverName: resolveDriverName(
      order,
      event.actorUserId,
      event.createdAtIso,
      eventIndex,
    ),
    rating: parsedEvaluation.rating,
    tags: parsedEvaluation.tags,
    content: parsedEvaluation.content,
    anonymous: parsedEvaluation.anonymous,
    photoCount,
    ...(photoFileIds.length > 0 ? { photoFileIds } : {}),
    submittedAtIso: event.createdAtIso,
  };
}

function createAdminEvaluationAuditRecords(
  order: ShipperProfileEvaluationOrderRecord,
): AdminEvaluationAuditRecord[] {
  return order.events
    .map((event, index) => ({ event, index }))
    .map(({ event, index }) => createAdminEvaluationAuditRecord(order, event, index))
    .filter(
      (record): record is AdminEvaluationAuditRecord => record !== undefined,
    );
}

function createAdminEvaluationAuditRecord(
  order: ShipperProfileEvaluationOrderRecord,
  event: ShipperProfileEvaluationOrderEventRecord,
  eventIndex: number,
): AdminEvaluationAuditRecord | undefined {
  if (
    event.eventType !== 'evaluation_submitted' &&
    event.eventType !== 'shipper_evaluation_submitted'
  ) {
    return undefined;
  }

  const parsedEvaluation = parseEvaluationNote(event.noteText);

  if (!parsedEvaluation) {
    return undefined;
  }

  const photoFileIds = normalizeAttachmentFileIds(event.attachmentFileIds);
  const photoCount = photoFileIds.length || parsedEvaluation.photoCount;

  if (event.eventType === 'shipper_evaluation_submitted') {
    const reviewerUserId = event.actorUserId ?? 'unknown-driver';

    return {
      id: event.id,
      orderId: order.id,
      orderNo: order.orderNo,
      direction: 'driver_to_shipper' satisfies AdminEvaluationDirection,
      reviewerUserId,
      reviewerName: resolveDriverName(
        order,
        reviewerUserId,
        event.createdAtIso,
        eventIndex,
      ),
      revieweeUserId: order.shipperId,
      revieweeName: formatShipperName(order.shipperId),
      rating: parsedEvaluation.rating,
      tags: parsedEvaluation.tags,
      content: parsedEvaluation.content,
      anonymous: parsedEvaluation.anonymous,
      photoCount,
      ...(photoFileIds.length > 0 ? { photoFileIds } : {}),
      submittedAtIso: event.createdAtIso,
      appealStatus: 'none',
      ...mapAdminEvaluationModeration(event.evaluationModeration),
    };
  }

  const acceptedEvent = findAcceptedDriverEvent(
    order,
    event.createdAtIso,
    eventIndex,
  );
  const reviewerUserId = event.actorUserId ?? order.shipperId;
  const revieweeUserId = acceptedEvent?.actorUserId ?? 'unknown-driver';

  return {
    id: event.id,
    orderId: order.id,
    orderNo: order.orderNo,
    direction: 'shipper_to_driver' satisfies AdminEvaluationDirection,
    reviewerUserId,
    reviewerName: formatShipperName(reviewerUserId),
    revieweeUserId,
    revieweeName: resolveDriverName(
      order,
      revieweeUserId,
      event.createdAtIso,
      eventIndex,
    ),
    rating: parsedEvaluation.rating,
    tags: parsedEvaluation.tags,
    content: parsedEvaluation.content,
    anonymous: parsedEvaluation.anonymous,
    photoCount,
    ...(photoFileIds.length > 0 ? { photoFileIds } : {}),
    submittedAtIso: event.createdAtIso,
    appealStatus: 'none',
    ...mapAdminEvaluationModeration(event.evaluationModeration),
  };
}

function mapAdminEvaluationModeration(
  moderation: AdminEvaluationModerationSnapshot | undefined,
): Pick<
  AdminEvaluationAuditRecord,
  | 'moderationStatus'
  | 'moderationVersion'
  | 'moderationReason'
  | 'moderatedByAdminId'
  | 'moderatedAtIso'
> {
  if (!moderation) {
    return {
      moderationStatus: 'visible',
      moderationVersion: 0,
    };
  }

  return {
    moderationStatus: moderation.status,
    moderationVersion: moderation.version,
    ...(moderation.reason ? { moderationReason: moderation.reason } : {}),
    ...(moderation.moderatedByAdminId
      ? { moderatedByAdminId: moderation.moderatedByAdminId }
      : {}),
    ...(moderation.moderatedAtIso
      ? { moderatedAtIso: moderation.moderatedAtIso }
      : {}),
  };
}

function applyAdminEvaluationModeration(
  evaluation: AdminEvaluationAuditRecord,
  moderation: AdminEvaluationModerationSnapshot,
): AdminEvaluationAuditRecord {
  return {
    ...evaluation,
    ...mapAdminEvaluationModeration(moderation),
  };
}

function applyLatestEvaluationAppeal(
  evaluation: AdminEvaluationAuditRecord,
  appeal: EvaluationAppealSnapshot | undefined,
): AdminEvaluationAuditRecord {
  return appeal
    ? {
        ...evaluation,
        appealStatus: appeal.status,
        latestAppeal: appeal,
      }
    : {
        ...evaluation,
        appealStatus: 'none',
      };
}

function isHiddenEvaluation(event: ShipperProfileEvaluationOrderEventRecord) {
  return event.evaluationModeration?.status === 'hidden';
}

function findAdminEvaluationAuditRecordById(
  order: ShipperProfileEvaluationOrderRecord,
  evaluationId: string,
) {
  const matchedEvent = order.events
    .map((event, index) => ({ event, index }))
    .find(({ event }) => event.id === evaluationId);

  if (!matchedEvent) {
    return undefined;
  }

  return createAdminEvaluationAuditRecord(
    order,
    matchedEvent.event,
    matchedEvent.index,
  );
}

function resolveDriverName(
  order: ShipperProfileEvaluationOrderRecord,
  driverId: string | undefined,
  submittedAtIso: string,
  eventIndex: number,
) {
  if (!driverId || driverId === 'unknown-driver') {
    return '未知司机';
  }

  const acceptedSnapshot = parseDriverAcceptedEvent(
    findLatestDriverAcceptedEvent(order, driverId, submittedAtIso, eventIndex)
      ?.noteText,
  ).driverSnapshot;

  if (acceptedSnapshot?.driverName) {
    return acceptedSnapshot.driverName;
  }

  const quoteSnapshot = parseDriverQuoteEvent(
    findLatestDriverQuoteEvent(order, driverId, submittedAtIso, eventIndex)
      ?.noteText,
  ).driverSnapshot;

  if (quoteSnapshot?.driverName) {
    return quoteSnapshot.driverName;
  }

  return formatDriverName(driverId);
}

function parseEvaluationNote(noteText?: string) {
  if (!noteText) {
    return undefined;
  }

  const noteParts = noteText.split('；');
  const ratingAndTagsText = noteParts.shift()?.trim();
  const ratingMatch = ratingAndTagsText?.match(/^([1-5]) 星：(.*)$/);

  if (!ratingMatch) {
    return undefined;
  }

  const tags = ratingMatch[2]
    .split('、')
    .map(tag => tag.trim())
    .filter(Boolean);

  if (tags.length === 0) {
    return undefined;
  }

  const evaluationInfoMatch = noteParts[0]
    ?.trim()
    .match(/^评价信息：(匿名|实名)$/);

  if (evaluationInfoMatch) {
    noteParts.shift();
    const photoCountMatch = noteParts[0]
      ?.trim()
      .match(/^图片凭证 (\d+) 张$/);
    const photoCount = photoCountMatch ? Number(photoCountMatch[1]) : 0;

    if (photoCountMatch) {
      noteParts.shift();
    }

    const versionedContent = noteParts.join('；').trim();
    const contentPrefix = '评价正文：';

    if (!versionedContent.startsWith(contentPrefix)) {
      return undefined;
    }

    const content = versionedContent.slice(contentPrefix.length).trim();

    if (!content) {
      return undefined;
    }

    return {
      rating: Number(ratingMatch[1]),
      tags,
      content,
      anonymous: evaluationInfoMatch[1] === '匿名',
      photoCount,
    };
  }

  let anonymous = false;
  let photoCount = 0;

  while (noteParts.length > 0) {
    const currentPart = noteParts[0].trim();
    const photoCountMatch = currentPart.match(/^图片凭证 (\d+) 张$/);

    if (currentPart === '匿名评价') {
      anonymous = true;
      noteParts.shift();
      continue;
    }

    if (photoCountMatch) {
      photoCount = Number(photoCountMatch[1]);
      noteParts.shift();
      continue;
    }

    break;
  }

  const content = noteParts.join('；').trim();

  if (!content) {
    return undefined;
  }

  return {
    rating: Number(ratingMatch[1]),
    tags,
    content,
    anonymous,
    photoCount,
  };
}

function findAcceptedDriverEvent(
  order: ShipperProfileEvaluationOrderRecord,
  submittedAtIso: string,
  evaluationEventIndex: number,
) {
  return findLatestOrderEvent(
    order,
    event => event.eventType === 'driver_accepted' && Boolean(event.actorUserId),
    submittedAtIso,
    evaluationEventIndex,
  );
}

function findLatestDriverAcceptedEvent(
  order: ShipperProfileEvaluationOrderRecord,
  driverId: string,
  submittedAtIso: string,
  eventIndex: number,
) {
  return findLatestOrderEvent(
    order,
    event =>
      event.eventType === 'driver_accepted' && event.actorUserId === driverId,
    submittedAtIso,
    eventIndex,
  );
}

function findLatestDriverQuoteEvent(
  order: ShipperProfileEvaluationOrderRecord,
  driverId: string,
  submittedAtIso: string,
  eventIndex: number,
) {
  return findLatestOrderEvent(
    order,
    event =>
      event.eventType === 'driver_quote_submitted' &&
      event.actorUserId === driverId,
    submittedAtIso,
    eventIndex,
  );
}

function findLatestDriverReply(
  order: ShipperProfileEvaluationOrderRecord,
  evaluationEventIndex: number,
  driverId: string,
) {
  return order.events
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event, index }) =>
        index > evaluationEventIndex &&
        event.eventType === 'evaluation_replied' &&
        event.actorUserId === driverId &&
        Boolean(event.noteText?.trim()),
    )
    .reduce<
      | {
          event: ShipperProfileEvaluationOrderEventRecord & { noteText: string };
          index: number;
        }
      | undefined
    >((latestEvent, currentEvent) => {
      if (!latestEvent) {
        return {
          event: {
            ...currentEvent.event,
            noteText: currentEvent.event.noteText?.trim() ?? '',
          },
          index: currentEvent.index,
        };
      }

      if (currentEvent.event.createdAtIso > latestEvent.event.createdAtIso) {
        return {
          event: {
            ...currentEvent.event,
            noteText: currentEvent.event.noteText?.trim() ?? '',
          },
          index: currentEvent.index,
        };
      }

      if (
        currentEvent.event.createdAtIso === latestEvent.event.createdAtIso &&
        currentEvent.index > latestEvent.index
      ) {
        return {
          event: {
            ...currentEvent.event,
            noteText: currentEvent.event.noteText?.trim() ?? '',
          },
          index: currentEvent.index,
        };
      }

      return latestEvent;
    }, undefined)?.event;
}

function findLatestOrderEvent(
  order: ShipperProfileEvaluationOrderRecord,
  predicate: (event: ShipperProfileEvaluationOrderEventRecord) => boolean,
  submittedAtIso: string,
  eventIndex: number,
) {
  return order.events
    .map((event, index) => ({ event, index }))
    .filter(({ event, index }) => {
      if (!predicate(event)) {
        return false;
      }

      return isEventBeforeOrAtCurrentIndex(
        event.createdAtIso,
        index,
        submittedAtIso,
        eventIndex,
      );
    })
    .reduce<
      | {
          event: ShipperProfileEvaluationOrderEventRecord;
          index: number;
        }
      | undefined
    >((latestEvent, currentEvent) => {
      if (!latestEvent) {
        return currentEvent;
      }

      if (currentEvent.event.createdAtIso > latestEvent.event.createdAtIso) {
        return currentEvent;
      }

      if (
        currentEvent.event.createdAtIso === latestEvent.event.createdAtIso &&
        currentEvent.index > latestEvent.index
      ) {
        return currentEvent;
      }

      return latestEvent;
    }, undefined)?.event;
}

function isEventBeforeOrAtCurrentIndex(
  eventCreatedAtIso: string,
  eventIndex: number,
  submittedAtIso: string,
  currentEventIndex: number,
) {
  return (
    eventCreatedAtIso < submittedAtIso ||
    (eventCreatedAtIso === submittedAtIso && eventIndex < currentEventIndex)
  );
}

function parseDriverAcceptedEvent(noteText?: string): {
  driverSnapshot?: DriverOrderEventSnapshot;
} {
  if (!noteText) {
    return {};
  }

  try {
    const payload = JSON.parse(noteText) as {
      driverSnapshot?: unknown;
    };

    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }

    return {
      driverSnapshot: parseDriverEventSnapshot(payload.driverSnapshot),
    };
  } catch {
    return {};
  }
}

function parseDriverQuoteEvent(noteText?: string): {
  driverSnapshot?: DriverOrderEventSnapshot;
} {
  if (!noteText) {
    return {};
  }

  try {
    const payload = JSON.parse(noteText) as {
      driverSnapshot?: unknown;
    };

    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }

    return {
      driverSnapshot: parseDriverEventSnapshot(payload.driverSnapshot),
    };
  } catch {
    return {};
  }
}

function parseDriverEventSnapshot(
  input: unknown,
): DriverOrderEventSnapshot | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }

  const snapshot = input as {
    driverName?: unknown;
  };
  const driverName =
    typeof snapshot.driverName === 'string' ? snapshot.driverName.trim() : '';

  if (!driverName) {
    return undefined;
  }

  return {
    driverName,
  };
}

function normalizeAttachmentFileIds(fileIds?: string[]) {
  return Array.from(
    new Set((fileIds ?? []).map(fileId => fileId.trim()).filter(Boolean)),
  );
}

function isPreviewableEvaluationAttachment(
  file: FileUploadRecord | undefined,
): file is FileUploadRecord {
  return Boolean(
    file && file.purpose === 'evaluation' && file.status === 'uploaded',
  );
}

function mapAdminEvaluationAttachment(
  file: FileUploadRecord,
  previewUrlSigner: FilePreviewUrlSigner,
) {
  return {
    ...file,
    ...previewUrlSigner.signPreviewUrl(file),
  };
}

function formatDriverName(driverId: string) {
  return driverId === 'unknown-driver' ? '未知司机' : `平台司机 ${driverId}`;
}

function formatShipperName(shipperId: string) {
  return `平台货主 ${shipperId}`;
}

function evaluationAuditNotFoundError() {
  return new BusinessError(
    ApiErrorCode.EVALUATION_AUDIT_NOT_FOUND,
    '评价审计记录不存在',
  );
}
