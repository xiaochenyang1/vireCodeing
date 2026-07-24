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
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type {
  CreateShipperInvoiceApplicationRequest,
  ReviewShipperInvoiceApplicationRequest,
} from './dto';
import { ProfileInvoicesService } from './profile-invoices.service';
import {
  createShipperInvoiceApplicationSchema,
  parseCreateShipperInvoiceApplicationRequest,
  parseListAdminShipperInvoiceQuery,
  parseReviewShipperInvoiceApplicationRequest,
  reviewShipperInvoiceApplicationSchema,
} from './profile-invoices.validation';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('shipper/profile/invoices')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
@ApiBearerAuth('access-token')
@ApiTags('个人资料 (Profile)')
export class ProfileInvoicesController {
  constructor(private readonly profileInvoicesService: ProfileInvoicesService) {}

  @Get()
  async listApplications(@Req() request: AuthenticatedRequest) {
    const currentUser = getCurrentShipper(request);

    return ok(
      await this.profileInvoicesService.listApplications(currentUser.id),
      getRequestId(request),
    );
  }

  @Post()
  async createApplication(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createShipperInvoiceApplicationSchema))
    body: CreateShipperInvoiceApplicationRequest,
  ) {
    const currentUser = getCurrentShipper(request);

    return ok(
      await this.profileInvoicesService.createApplication(
        currentUser.id,
        parseCreateShipperInvoiceApplicationRequest(body),
      ),
      getRequestId(request),
    );
  }
}

@Controller('admin/shipper-invoices')
@UseGuards(AccessTokenGuard, AdminOnlyGuard)
@ApiBearerAuth('access-token')
@ApiTags('管理员发票 (Admin Invoices)')
export class AdminShipperInvoicesController {
  constructor(private readonly profileInvoicesService: ProfileInvoicesService) {}

  @Get()
  async listAdminApplications(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return ok(
      await this.profileInvoicesService.listAdminApplications(
        getCurrentAdmin(request),
        parseListAdminShipperInvoiceQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Post(':applicationId/review')
  async reviewApplication(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId') applicationId: string,
    @Body(new ZodValidationPipe(reviewShipperInvoiceApplicationSchema))
    body: ReviewShipperInvoiceApplicationRequest,
  ) {
    return ok(
      await this.profileInvoicesService.reviewApplication(
        getCurrentAdmin(request),
        applicationId,
        parseReviewShipperInvoiceApplicationRequest(body),
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
