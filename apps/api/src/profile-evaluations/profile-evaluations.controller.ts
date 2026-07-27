import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import type { AuthenticatedUser } from '../auth/dto';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProfileEvaluationsService } from './profile-evaluations.service';
import type { ModerateAdminEvaluationRequest } from './dto';
import {
  adminEvaluationAuditListQuerySchema,
  moderateAdminEvaluationSchema,
  parseAdminEvaluationAuditListQuery,
  parseModerateAdminEvaluationRequest,
} from './profile-evaluations.validation';

@Controller('shipper/profile/evaluations')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
@ApiBearerAuth('access-token')
@ApiTags('个人资料 (Profile)')
export class ProfileEvaluationsController {
  constructor(
    private readonly profileEvaluationsService: ProfileEvaluationsService,
  ) {}

  @Get()
  async listRecords(@Req() request: AuthenticatedRequest) {
    const currentUser = getCurrentShipper(request);

    return ok(
      await this.profileEvaluationsService.listRecords(currentUser.id),
      getRequestId(request),
    );
  }

  @Get('received')
  async listReceivedRecords(@Req() request: AuthenticatedRequest) {
    const currentUser = getCurrentShipper(request);

    return ok(
      await this.profileEvaluationsService.listReceivedRecords(currentUser.id),
      getRequestId(request),
    );
  }
}

@Controller('admin/evaluations')
@UseGuards(AccessTokenGuard, AdminOnlyGuard)
@ApiBearerAuth('access-token')
@ApiTags('个人资料 (Profile)')
export class AdminProfileEvaluationsController {
  constructor(
    private readonly profileEvaluationsService: ProfileEvaluationsService,
  ) {}

  @Get()
  async listEvaluationAudits(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(adminEvaluationAuditListQuerySchema))
    query: unknown,
  ) {
    getCurrentAdmin(request);

    return ok(
      await this.profileEvaluationsService.listAdminEvaluationAudits(
        parseAdminEvaluationAuditListQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get(':evaluationId')
  async getEvaluationAudit(
    @Req() request: AuthenticatedRequest,
    @Param('evaluationId') evaluationId: string,
  ) {
    return ok(
      await this.profileEvaluationsService.getAdminEvaluationAudit(
        getCurrentAdmin(request),
        evaluationId,
      ),
      getRequestId(request),
    );
  }

  @Get(':evaluationId/attachments')
  async getEvaluationAttachments(
    @Req() request: AuthenticatedRequest,
    @Param('evaluationId') evaluationId: string,
  ) {
    return ok(
      await this.profileEvaluationsService.getAdminEvaluationAuditAttachments(
        getCurrentAdmin(request),
        evaluationId,
      ),
      getRequestId(request),
    );
  }

  @Get(':evaluationId/moderation-events')
  async listEvaluationModerationEvents(
    @Req() request: AuthenticatedRequest,
    @Param('evaluationId') evaluationId: string,
  ) {
    return ok(
      await this.profileEvaluationsService.listAdminEvaluationModerationEvents(
        getCurrentAdmin(request),
        evaluationId,
      ),
      getRequestId(request),
    );
  }

  @Put(':evaluationId/moderation')
  async moderateEvaluation(
    @Req() request: AuthenticatedRequest,
    @Param('evaluationId') evaluationId: string,
    @Body(new ZodValidationPipe(moderateAdminEvaluationSchema))
    body: ModerateAdminEvaluationRequest,
  ) {
    return ok(
      await this.profileEvaluationsService.moderateAdminEvaluation(
        getCurrentAdmin(request),
        evaluationId,
        parseModerateAdminEvaluationRequest(body),
      ),
      getRequestId(request),
    );
  }
}

function getCurrentShipper(request: AuthenticatedRequest): AuthenticatedUser {
  const currentUser = request.currentUser;

  if (!currentUser) {
    throw new BusinessError(
      ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      '访问令牌无效',
    );
  }

  if (currentUser.userType !== 'shipper') {
    throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主');
  }

  return currentUser;
}

function getCurrentAdmin(request: AuthenticatedRequest): AuthenticatedUser {
  const currentUser = request.currentUser;

  if (!currentUser) {
    throw new BusinessError(
      ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      '访问令牌无效',
    );
  }

  if (currentUser.userType !== 'admin') {
    throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员');
  }

  return currentUser;
}

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];

  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}
