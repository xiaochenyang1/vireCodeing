import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import type { AuthenticatedUser } from '../auth/dto';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProfileEvaluationsService } from './profile-evaluations.service';
import {
  adminEvaluationAuditListQuerySchema,
  parseAdminEvaluationAuditListQuery,
} from './profile-evaluations.validation';

@Controller('shipper/profile/evaluations')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
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
