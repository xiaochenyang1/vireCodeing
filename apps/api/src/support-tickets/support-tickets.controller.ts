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
import type { AuthenticatedUser } from '../auth/dto';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type {
  CreateShipperSupportTicketRequest,
  UpdateShipperSupportTicketRequest,
} from './dto';
import { SupportTicketsService } from './support-tickets.service';
import {
  adminSupportTicketListQuerySchema,
  createShipperSupportTicketSchema,
  parseAdminSupportTicketListQuery,
  parseCreateShipperSupportTicketRequest,
  parseSupportTicketId,
  parseUpdateShipperSupportTicketRequest,
  updateShipperSupportTicketSchema,
} from './support-tickets.validation';

@Controller('shipper/support-tickets')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
@ApiTags('客服工单 (Support Tickets)')
export class SupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Get()
  async listSupportTickets(@Req() request: AuthenticatedRequest) {
    return ok(
      await this.supportTicketsService.listSupportTickets(
        getCurrentUserId(request, 'shipper'),
      ),
      getRequestId(request),
    );
  }

  @Post()
  async createSupportTicket(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createShipperSupportTicketSchema))
    body: CreateShipperSupportTicketRequest,
  ) {
    return ok(
      await this.supportTicketsService.createSupportTicket(
        getCurrentUserId(request, 'shipper'),
        parseCreateShipperSupportTicketRequest(body),
      ),
      getRequestId(request),
    );
  }
}

@Controller('admin/support-tickets')
@UseGuards(AccessTokenGuard, AdminOnlyGuard)
@ApiTags('客服工单 (Support Tickets)')
export class AdminSupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Get()
  async listSupportTickets(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(adminSupportTicketListQuerySchema)) query: unknown,
  ) {
    getCurrentUserId(request, 'admin');

    return ok(
      await this.supportTicketsService.listSupportTicketsForAdmin(
        parseAdminSupportTicketListQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get(':ticketId')
  async getSupportTicket(
    @Req() request: AuthenticatedRequest,
    @Param('ticketId') ticketId: string,
  ) {
    getCurrentUserId(request, 'admin');

    return ok(
      await this.supportTicketsService.getSupportTicketForAdmin(
        parseSupportTicketId(ticketId),
      ),
      getRequestId(request),
    );
  }

  @Post(':ticketId/process')
  async processSupportTicket(
    @Req() request: AuthenticatedRequest,
    @Param('ticketId') ticketId: string,
    @Body(new ZodValidationPipe(updateShipperSupportTicketSchema))
    body: UpdateShipperSupportTicketRequest,
  ) {
    return ok(
      await this.supportTicketsService.processSupportTicket(
        getCurrentUserId(request, 'admin'),
        parseSupportTicketId(ticketId),
        parseUpdateShipperSupportTicketRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post(':ticketId/resolve')
  async resolveSupportTicket(
    @Req() request: AuthenticatedRequest,
    @Param('ticketId') ticketId: string,
    @Body(new ZodValidationPipe(updateShipperSupportTicketSchema))
    body: UpdateShipperSupportTicketRequest,
  ) {
    return ok(
      await this.supportTicketsService.resolveSupportTicket(
        getCurrentUserId(request, 'admin'),
        parseSupportTicketId(ticketId),
        parseUpdateShipperSupportTicketRequest(body),
      ),
      getRequestId(request),
    );
  }
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

function getCurrentUserId(
  request: AuthenticatedRequest,
  expectedRole: 'shipper' | 'driver' | 'admin',
) {
  const currentUser = getCurrentUser(request);

  if (currentUser.userType !== expectedRole) {
    throw new BusinessError(
      ApiErrorCode.AUTH_FORBIDDEN,
      getRoleMismatchMessage(expectedRole),
    );
  }

  return currentUser.id;
}

function getRoleMismatchMessage(expectedRole: 'shipper' | 'driver' | 'admin') {
  switch (expectedRole) {
    case 'shipper':
      return '当前账号不是货主';
    case 'driver':
      return '当前账号不是司机';
    case 'admin':
      return '当前账号不是管理员';
  }
}

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];

  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}
