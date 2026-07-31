import {
  Body,
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
import { AdminOnlyGuard, DriverOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiTags } from '@nestjs/swagger';
import type {
  AppealOrderExceptionCaseRequest,
  AssignOrderExceptionCaseRequest,
  ClaimOrderExceptionCaseRequest,
  ExecuteOrderExceptionCaseCompensationRequest,
  ResolveOrderExceptionCaseRequest,
  UpdateOrderExceptionCaseRequest,
} from './dto';
import { OrderExceptionCaseOverdueEscalationService } from './order-exception-case-overdue-escalation.service';
import { OrderExceptionCasesService } from './order-exception-cases.service';
import {
  appealOrderExceptionCaseSchema,
  assignOrderExceptionCaseSchema,
  claimOrderExceptionCaseSchema,
  executeOrderExceptionCaseCompensationSchema,
  orderExceptionCaseListQuerySchema,
  parseAppealOrderExceptionCaseRequest,
  parseAssignOrderExceptionCaseRequest,
  parseClaimOrderExceptionCaseRequest,
  parseExecuteOrderExceptionCaseCompensationRequest,
  parseOrderExceptionCaseId,
  parseOrderExceptionCaseAttachmentFileId,
  parseOrderExceptionCaseListQuery,
  parseOrderExceptionOrderId,
  parseResolveOrderExceptionCaseRequest,
  parseUpdateOrderExceptionCaseRequest,
  resolveOrderExceptionCaseSchema,
  updateOrderExceptionCaseSchema,
} from './order-exception-cases.validation';
import type { AuthenticatedUser } from '../auth/dto';

@Controller('orders')
@UseGuards(AccessTokenGuard)
@ApiTags('异常工单 (Exception Cases)')
export class OrderExceptionCaseAttachmentPreviewsController {
  constructor(private readonly service: OrderExceptionCasesService) {}

  @Get(':orderId/exception-cases/:caseId/attachments/:fileId/preview')
  async getAttachmentPreview(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Param('caseId') caseId: string,
    @Param('fileId') fileId: string,
  ) {
    return ok(
      await this.service.getAttachmentPreview(
        getCurrentUser(request),
        parseOrderExceptionOrderId(orderId),
        parseOrderExceptionCaseId(caseId),
        parseOrderExceptionCaseAttachmentFileId(fileId),
      ),
      getRequestId(request),
    );
  }
}

@Controller('shipper/orders')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
@ApiTags('异常工单 (Exception Cases)')
export class ShipperOrderExceptionCasesController {
  constructor(private readonly service: OrderExceptionCasesService) {}

  @Get(':orderId/exception-cases')
  async listCases(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return ok(
      await this.service.listForShipper(
        getCurrentUserId(request, 'shipper'),
        parseOrderExceptionOrderId(orderId),
      ),
      getRequestId(request),
    );
  }

  @Post(':orderId/exception-cases/:caseId/appeal')
  async appealCase(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Param('caseId') caseId: string,
    @Body(new ZodValidationPipe(appealOrderExceptionCaseSchema))
    body: AppealOrderExceptionCaseRequest,
  ) {
    return ok(
      await this.service.appealForShipper(
        getCurrentUserId(request, 'shipper'),
        parseOrderExceptionOrderId(orderId),
        parseOrderExceptionCaseId(caseId),
        parseAppealOrderExceptionCaseRequest(body),
      ),
      getRequestId(request),
    );
  }
}

@Controller('driver/orders')
@UseGuards(AccessTokenGuard, DriverOnlyGuard)
@ApiTags('异常工单 (Exception Cases)')
export class DriverOrderExceptionCasesController {
  constructor(private readonly service: OrderExceptionCasesService) {}

  @Get(':orderId/exception-cases')
  async listCases(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return ok(
      await this.service.listForDriver(
        getCurrentUserId(request, 'driver'),
        parseOrderExceptionOrderId(orderId),
      ),
      getRequestId(request),
    );
  }

  @Post(':orderId/exception-cases/:caseId/appeal')
  async appealCase(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Param('caseId') caseId: string,
    @Body(new ZodValidationPipe(appealOrderExceptionCaseSchema))
    body: AppealOrderExceptionCaseRequest,
  ) {
    return ok(
      await this.service.appealForDriver(
        getCurrentUserId(request, 'driver'),
        parseOrderExceptionOrderId(orderId),
        parseOrderExceptionCaseId(caseId),
        parseAppealOrderExceptionCaseRequest(body),
      ),
      getRequestId(request),
    );
  }
}

@Controller('admin/order-exception-cases')
@UseGuards(AccessTokenGuard, AdminOnlyGuard)
@ApiTags('异常工单 (Exception Cases)')
export class AdminOrderExceptionCasesController {
  constructor(
    private readonly service: OrderExceptionCasesService,
    private readonly overdueEscalationService: OrderExceptionCaseOverdueEscalationService,
  ) {}

  @Get()
  async listCases(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(orderExceptionCaseListQuerySchema)) query: unknown,
  ) {
    getCurrentUserId(request, 'admin');

    return ok(
      await this.service.listForAdmin(
        parseOrderExceptionCaseListQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Post('overdue-escalations/sweep')
  async sweepOverdueCases(@Req() request: AuthenticatedRequest) {
    getCurrentUserId(request, 'admin');

    return ok(
      await this.overdueEscalationService.sweepOverdueCases('admin'),
      getRequestId(request),
    );
  }

  @Get(':caseId')
  async getCase(
    @Req() request: AuthenticatedRequest,
    @Param('caseId') caseId: string,
  ) {
    getCurrentUserId(request, 'admin');

    return ok(
      await this.service.getForAdmin(parseOrderExceptionCaseId(caseId)),
      getRequestId(request),
    );
  }

  @Post(':caseId/process')
  async processCase(
    @Req() request: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body(new ZodValidationPipe(updateOrderExceptionCaseSchema))
    body: UpdateOrderExceptionCaseRequest,
  ) {
    return this.mutate(request, caseId, body, 'processCase');
  }

  @Post(':caseId/claim')
  async claimCase(
    @Req() request: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body(new ZodValidationPipe(claimOrderExceptionCaseSchema))
    body: ClaimOrderExceptionCaseRequest,
  ) {
    const adminUserId = getCurrentUserId(request, 'admin');
    const result = await this.service.claimCase(
      adminUserId,
      parseOrderExceptionCaseId(caseId),
      parseClaimOrderExceptionCaseRequest(body),
    );

    return ok(result, getRequestId(request));
  }

  @Post(':caseId/takeover')
  async takeoverCase(
    @Req() request: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body(new ZodValidationPipe(claimOrderExceptionCaseSchema))
    body: ClaimOrderExceptionCaseRequest,
  ) {
    const adminUserId = getCurrentUserId(request, 'admin');
    const result = await this.service.takeoverCase(
      adminUserId,
      parseOrderExceptionCaseId(caseId),
      parseClaimOrderExceptionCaseRequest(body),
    );

    return ok(result, getRequestId(request));
  }

  @Post(':caseId/assign')
  async assignCase(
    @Req() request: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body(new ZodValidationPipe(assignOrderExceptionCaseSchema))
    body: AssignOrderExceptionCaseRequest,
  ) {
    const adminUserId = getCurrentUserId(request, 'admin');
    const result = await this.service.assignCase(
      adminUserId,
      parseOrderExceptionCaseId(caseId),
      parseAssignOrderExceptionCaseRequest(body),
    );

    return ok(result, getRequestId(request));
  }

  @Post(':caseId/unclaim')
  async unclaimCase(
    @Req() request: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body(new ZodValidationPipe(claimOrderExceptionCaseSchema))
    body: ClaimOrderExceptionCaseRequest,
  ) {
    const adminUserId = getCurrentUserId(request, 'admin');
    const result = await this.service.unclaimCase(
      adminUserId,
      parseOrderExceptionCaseId(caseId),
      parseClaimOrderExceptionCaseRequest(body),
    );

    return ok(result, getRequestId(request));
  }

  @Post(':caseId/resolve')
  async resolveCase(
    @Req() request: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body(new ZodValidationPipe(resolveOrderExceptionCaseSchema))
    body: ResolveOrderExceptionCaseRequest,
  ) {
    const adminUserId = getCurrentUserId(request, 'admin');
    const result = await this.service.resolveCase(
      adminUserId,
      parseOrderExceptionCaseId(caseId),
      parseResolveOrderExceptionCaseRequest(body),
    );

    return ok(result, getRequestId(request));
  }

  @Post(':caseId/close')
  async closeCase(
    @Req() request: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body(new ZodValidationPipe(updateOrderExceptionCaseSchema))
    body: UpdateOrderExceptionCaseRequest,
  ) {
    return this.mutate(request, caseId, body, 'closeCase');
  }

  @Post(':caseId/compensation/execute')
  async executeCompensation(
    @Req() request: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body(new ZodValidationPipe(executeOrderExceptionCaseCompensationSchema))
    body: ExecuteOrderExceptionCaseCompensationRequest,
  ) {
    const adminUserId = getCurrentUserId(request, 'admin');
    const result = await this.service.executeCompensation(
      adminUserId,
      parseOrderExceptionCaseId(caseId),
      getRequestId(request) ?? '',
      parseExecuteOrderExceptionCaseCompensationRequest(body),
    );

    return ok(result, getRequestId(request));
  }

  private async mutate(
    request: AuthenticatedRequest,
    caseId: string,
    body: UpdateOrderExceptionCaseRequest,
    method: 'processCase' | 'closeCase',
  ) {
    const adminUserId = getCurrentUserId(request, 'admin');
    const result = await this.service[method](
      adminUserId,
      parseOrderExceptionCaseId(caseId),
      parseUpdateOrderExceptionCaseRequest(body),
    );

    return ok(result, getRequestId(request));
  }
}

function getCurrentUserId(
  request: AuthenticatedRequest,
  expectedRole: 'shipper' | 'driver' | 'admin',
) {
  const currentUser = request.currentUser;

  if (!currentUser) {
    throw new BusinessError(
      ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      '访问令牌无效',
    );
  }

  if (currentUser.userType !== expectedRole) {
    throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号角色不匹配');
  }

  return currentUser.id;
}

function getCurrentUser(request: AuthenticatedRequest): AuthenticatedUser {
  if (!request.currentUser) {
    throw new BusinessError(
      ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      '访问令牌无效',
    );
  }

  return request.currentUser;
}

function getRequestId(request: AuthenticatedRequest) {
  const value = request.headers?.['x-request-id'];

  return Array.isArray(value) ? value[0] : value;
}
