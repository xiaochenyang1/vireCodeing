import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import { AdminOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { AdminFinanceService } from './admin-finance.service';
import { parsePaymentIdempotencyKey } from './payments.validation';

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().trim().min(1).max(50).optional(),
  orderId: z.string().trim().min(1).max(100).optional(),
});

const adminWriteBodySchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(500),
});

export type AdminFinanceWriteBody = z.infer<typeof adminWriteBodySchema>;

@Controller('admin/finance')
@UseGuards(AccessTokenGuard, AdminOnlyGuard)
export class AdminFinanceController {
  constructor(private readonly adminFinanceService: AdminFinanceService) {}

  @Get('report')
  async getReport(@Req() request: AuthenticatedRequest) {
    return ok(
      await this.adminFinanceService.getReport(),
      getRequestId(request),
    );
  }

  @Get('payments')
  async listPayments(
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    return ok(
      await this.adminFinanceService.listPayments(parseListQuery(query)),
      getRequestId(request),
    );
  }

  @Get('refunds')
  async listRefunds(
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    return ok(
      await this.adminFinanceService.listRefunds(parseListQuery(query)),
      getRequestId(request),
    );
  }

  @Post('refunds/:refundId/retry')
  async retryRefund(
    @Req() request: AuthenticatedRequest,
    @Param('refundId') refundId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body() body: AdminFinanceWriteBody,
  ) {
    const currentAdmin = getCurrentAdmin(request);
    return ok(
      await this.adminFinanceService.retryRefund({
        refundId,
        adminId: currentAdmin.id,
        idempotencyKey: parsePaymentIdempotencyKey(idempotencyKey),
        requestId: getRequestId(request),
        ...parseWriteBody(body),
      }),
      getRequestId(request),
    );
  }

  @Get('settlements')
  async listSettlements(
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    return ok(
      await this.adminFinanceService.listSettlements(parseListQuery(query)),
      getRequestId(request),
    );
  }

  @Get('ledger-transactions/:transactionId')
  async getLedgerTransaction(
    @Req() request: AuthenticatedRequest,
    @Param('transactionId') transactionId: string,
  ) {
    return ok(
      await this.adminFinanceService.getLedgerTransaction(transactionId),
      getRequestId(request),
    );
  }

  @Get('withdrawals')
  async listWithdrawals(
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    return ok(
      await this.adminFinanceService.listWithdrawals(parseListQuery(query)),
      getRequestId(request),
    );
  }

  @Post('withdrawals/:withdrawalId/approve')
  approveWithdrawal(
    @Req() request: AuthenticatedRequest,
    @Param('withdrawalId') withdrawalId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body() body: AdminFinanceWriteBody,
  ) {
    return this.reviewWithdrawal(
      request,
      withdrawalId,
      idempotencyKey,
      'approve',
      body,
    );
  }

  @Post('withdrawals/:withdrawalId/reject')
  rejectWithdrawal(
    @Req() request: AuthenticatedRequest,
    @Param('withdrawalId') withdrawalId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body() body: AdminFinanceWriteBody,
  ) {
    return this.reviewWithdrawal(
      request,
      withdrawalId,
      idempotencyKey,
      'reject',
      body,
    );
  }

  private async reviewWithdrawal(
    request: AuthenticatedRequest,
    withdrawalId: string,
    idempotencyKey: unknown,
    action: 'approve' | 'reject',
    body: AdminFinanceWriteBody,
  ) {
    const currentAdmin = getCurrentAdmin(request);
    return ok(
      await this.adminFinanceService.reviewWithdrawal({
        withdrawalId,
        adminId: currentAdmin.id,
        action,
        idempotencyKey: parsePaymentIdempotencyKey(idempotencyKey),
        requestId: getRequestId(request),
        ...parseWriteBody(body),
      }),
      getRequestId(request),
    );
  }
}

function parseListQuery(value: unknown) {
  const result = listQuerySchema.safeParse(value);
  if (!result.success) {
    throw new BusinessError(ApiErrorCode.VALIDATION_ERROR, '财务分页参数无效');
  }
  return result.data;
}

function parseWriteBody(value: unknown) {
  const result = adminWriteBodySchema.safeParse(value);
  if (!result.success) {
    throw new BusinessError(ApiErrorCode.VALIDATION_ERROR, '财务操作参数无效');
  }
  return result.data;
}

function getCurrentAdmin(request: AuthenticatedRequest) {
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

function getRequestId(request: AuthenticatedRequest) {
  const value = request.headers?.['x-request-id'];
  return (Array.isArray(value) ? value[0] : value) ?? 'req_local';
}
