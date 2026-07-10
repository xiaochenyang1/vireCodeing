import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import type { AuthenticatedUser } from '../auth/dto';
import { ShipperOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { SaveShipperProfileAddressBookRequest } from './dto';
import { ProfileAddressBookService } from './profile-address-book.service';
import {
  parseSaveShipperProfileAddressBookRequest,
  saveShipperProfileAddressBookSchema,
} from './profile-address-book.validation';

@Controller('shipper/profile/address-book')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
export class ProfileAddressBookController {
  constructor(
    private readonly profileAddressBookService: ProfileAddressBookService,
  ) {}

  @Get()
  async getAddressBook(@Req() request: AuthenticatedRequest) {
    const addressBook = await this.profileAddressBookService.getAddressBook(
      getCurrentShipperId(request),
    );

    return ok(
      addressBook ?? null,
      getRequestId(request),
    );
  }

  @Put()
  async saveAddressBook(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(saveShipperProfileAddressBookSchema))
    body: SaveShipperProfileAddressBookRequest,
  ) {
    return ok(
      await this.profileAddressBookService.saveAddressBook(
        getCurrentShipperId(request),
        parseSaveShipperProfileAddressBookRequest(body),
      ),
      getRequestId(request),
    );
  }
}

function getCurrentShipperId(request: AuthenticatedRequest) {
  const currentUser = getCurrentUser(request);

  if (currentUser.userType !== 'shipper') {
    throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主');
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

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];

  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}
