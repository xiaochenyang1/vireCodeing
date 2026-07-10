import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
import { AdminOnlyGuard, DriverOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type {
  ReviewDriverCertificationRequest,
  SubmitDriverIdentityCertificationRequest,
  SubmitDriverVehicleCertificationRequest,
} from './dto';
import { DriverCertificationService } from './driver-certification.service';
import {
  parseListDriverCertificationQuery,
  parseReviewDriverCertificationRequest,
  parseSubmitDriverIdentityCertificationRequest,
  parseSubmitDriverVehicleCertificationRequest,
  reviewDriverCertificationSchema,
  submitDriverIdentityCertificationSchema,
  submitDriverVehicleCertificationSchema,
} from './driver-certification.validation';

@Controller('driver/certification')
@UseGuards(AccessTokenGuard, DriverOnlyGuard)
export class DriverCertificationController {
  constructor(
    private readonly driverCertificationService: DriverCertificationService,
  ) {}

  @Get()
  async getCertification(@Req() request: AuthenticatedRequest) {
    return ok(
      await this.driverCertificationService.getCertification(
        getCurrentDriver(request),
      ),
      getRequestId(request),
    );
  }

  @Put('identity')
  async submitIdentity(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(submitDriverIdentityCertificationSchema))
    body: SubmitDriverIdentityCertificationRequest,
  ) {
    return ok(
      await this.driverCertificationService.submitIdentity(
        getCurrentDriver(request),
        parseSubmitDriverIdentityCertificationRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Put('vehicle')
  async submitVehicle(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(submitDriverVehicleCertificationSchema))
    body: SubmitDriverVehicleCertificationRequest,
  ) {
    return ok(
      await this.driverCertificationService.submitVehicle(
        getCurrentDriver(request),
        parseSubmitDriverVehicleCertificationRequest(body),
      ),
      getRequestId(request),
    );
  }
}

@Controller('admin/driver-certifications')
@UseGuards(AccessTokenGuard, AdminOnlyGuard)
export class AdminDriverCertificationController {
  constructor(
    private readonly driverCertificationService: DriverCertificationService,
  ) {}

  @Get()
  async listCertifications(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return ok(
      await this.driverCertificationService.listCertifications(
        getCurrentAdmin(request),
        parseListDriverCertificationQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get(':driverId/review-events')
  async listReviewEvents(
    @Req() request: AuthenticatedRequest,
    @Param('driverId') driverId: string,
  ) {
    return ok(
      await this.driverCertificationService.listReviewEvents(
        getCurrentAdmin(request),
        driverId,
      ),
      getRequestId(request),
    );
  }

  @Get(':driverId/attachments')
  async getAttachmentPreviews(
    @Req() request: AuthenticatedRequest,
    @Param('driverId') driverId: string,
  ) {
    return ok(
      await this.driverCertificationService.getAttachmentPreviews(
        getCurrentAdmin(request),
        driverId,
      ),
      getRequestId(request),
    );
  }

  @Post(':driverId/identity/review')
  async reviewIdentity(
    @Req() request: AuthenticatedRequest,
    @Param('driverId') driverId: string,
    @Body(new ZodValidationPipe(reviewDriverCertificationSchema))
    body: ReviewDriverCertificationRequest,
  ) {
    return ok(
      await this.driverCertificationService.reviewIdentity(
        getCurrentAdmin(request),
        driverId,
        parseReviewDriverCertificationRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post(':driverId/vehicle/review')
  async reviewVehicle(
    @Req() request: AuthenticatedRequest,
    @Param('driverId') driverId: string,
    @Body(new ZodValidationPipe(reviewDriverCertificationSchema))
    body: ReviewDriverCertificationRequest,
  ) {
    return ok(
      await this.driverCertificationService.reviewVehicle(
        getCurrentAdmin(request),
        driverId,
        parseReviewDriverCertificationRequest(body),
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

function getCurrentDriver(request: AuthenticatedRequest): AuthenticatedUser {
  const currentUser = getCurrentUser(request);

  if (currentUser.userType !== 'driver') {
    throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是司机');
  }

  return currentUser;
}

function getCurrentAdmin(request: AuthenticatedRequest): AuthenticatedUser {
  const currentUser = getCurrentUser(request);

  if (currentUser.userType !== 'admin') {
    throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员');
  }

  return currentUser;
}

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];

  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}
