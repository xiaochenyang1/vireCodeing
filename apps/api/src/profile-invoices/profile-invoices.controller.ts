import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import type { AuthenticatedUser } from '../auth/dto';
import { ShipperOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { CreateShipperInvoiceApplicationRequest } from './dto';
import { ProfileInvoicesService } from './profile-invoices.service';
import {
  createShipperInvoiceApplicationSchema,
  parseCreateShipperInvoiceApplicationRequest,
} from './profile-invoices.validation';

@Controller('shipper/profile/invoices')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
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

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];

  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}
