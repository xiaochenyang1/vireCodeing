import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import type { AuthenticatedUser } from '../auth/dto';
import { DriverOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { SaveDriverProfileRequest } from './dto';
import { ProfileDriverService } from './profile-driver.service';
import {
  parseSaveDriverProfileRequest,
  saveDriverProfileSchema,
} from './profile-driver.validation';

@Controller('driver/profile/account')
@UseGuards(AccessTokenGuard, DriverOnlyGuard)
@ApiBearerAuth('access-token')
@ApiTags('司机个人资料 (Driver Profile)')
export class ProfileDriverController {
  constructor(private readonly profileDriverService: ProfileDriverService) {}

  @Get()
  @ApiOperation({ summary: '获取司机个人资料', description: '获取当前登录司机的个人资料信息，包括昵称、头像、通知设置等' })
  async getProfile(@Req() request: AuthenticatedRequest) {
    const currentUser = getCurrentDriver(request);

    return ok(
      (await this.profileDriverService.getProfile(
        currentUser.id,
        currentUser.phone,
      )) ?? null,
      getRequestId(request),
    );
  }

  @Put()
  @ApiOperation({ summary: '更新司机个人资料', description: '更新当前登录司机的昵称、头像、通知偏好等资料' })
  async saveProfile(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(saveDriverProfileSchema))
    body: SaveDriverProfileRequest,
  ) {
    const currentUser = getCurrentDriver(request);

    return ok(
      await this.profileDriverService.saveProfile(
        currentUser.id,
        currentUser.phone,
        parseSaveDriverProfileRequest(body),
      ),
      getRequestId(request),
    );
  }
}

function getCurrentDriver(request: AuthenticatedRequest): AuthenticatedUser {
  const currentUser = request.currentUser;

  if (!currentUser) {
    throw new BusinessError(
      ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      '访问令牌无效',
    );
  }

  if (currentUser.userType !== 'driver') {
    throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是司机');
  }

  return currentUser;
}

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];

  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}
