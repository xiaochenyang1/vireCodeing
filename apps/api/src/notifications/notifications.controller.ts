import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import type { AuthenticatedUser } from '../auth/dto';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationsService } from './notifications.service';
import {
  listInboxMessagesQuerySchema,
  parseListInboxMessagesQuery,
  parseMessageId,
} from './notifications.validation';

@Controller('me/messages')
@UseGuards(AccessTokenGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async listMessages(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(listInboxMessagesQuerySchema))
    query: unknown,
  ) {
    const currentUser = getCurrentUser(request);
    return ok(
      await this.notificationsService.listMessages(
        currentUser.id,
        parseListInboxMessagesQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Post('read-all')
  async markAllRead(@Req() request: AuthenticatedRequest) {
    const currentUser = getCurrentUser(request);
    return ok(
      await this.notificationsService.markAllMessagesRead(currentUser.id),
      getRequestId(request),
    );
  }

  @Post(':messageId/read')
  async markRead(
    @Req() request: AuthenticatedRequest,
    @Param('messageId') messageId: string,
  ) {
    const currentUser = getCurrentUser(request);
    return ok(
      await this.notificationsService.markMessageRead(
        currentUser.id,
        parseMessageId(messageId),
      ),
      getRequestId(request),
    );
  }
}

function getCurrentUser(request: AuthenticatedRequest): AuthenticatedUser {
  const currentUser = request.currentUser;
  if (!currentUser) {
    throw new BusinessError(
      ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      '访问令牌无效',
    );
  }
  return currentUser;
}

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];
  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}
