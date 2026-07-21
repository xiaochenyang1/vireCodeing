import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import { DriverOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type {
  GeocodeRequest,
  ReverseGeocodeRequest,
  ReportDriverLocationRequest,
} from './dto';
import { MapsService } from './maps.service';
import {
  geocodeRequestSchema,
  parseGeocodeRequest,
  parseOrderId,
  parseReverseGeocodeRequest,
  parseReportDriverLocationRequest,
  reverseGeocodeRequestSchema,
  reportDriverLocationSchema,
} from './maps.validation';

@Controller()
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  @Post('maps/geocode')
  @UseGuards(AccessTokenGuard)
  async geocode(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(geocodeRequestSchema)) body: GeocodeRequest,
  ) {
    assertAuthenticated(request);
    return ok(
      await this.mapsService.geocode(parseGeocodeRequest(body)),
      getRequestId(request),
    );
  }

  @Post('maps/reverse-geocode')
  @UseGuards(AccessTokenGuard)
  async reverseGeocode(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(reverseGeocodeRequestSchema))
    body: ReverseGeocodeRequest,
  ) {
    assertAuthenticated(request);
    return ok(
      await this.mapsService.reverseGeocode(parseReverseGeocodeRequest(body)),
      getRequestId(request),
    );
  }

  @Post('driver/location')
  @UseGuards(AccessTokenGuard, DriverOnlyGuard)
  async reportDriverLocation(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(reportDriverLocationSchema))
    body: ReportDriverLocationRequest,
  ) {
    return ok(
      await this.mapsService.reportDriverLocation(
        getCurrentUserId(request, 'driver'),
        parseReportDriverLocationRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Get('shipper/orders/:orderId/driver-location')
  @UseGuards(AccessTokenGuard, ShipperOnlyGuard)
  async getShipperDriverLocation(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return ok(
      await this.mapsService.getShipperDriverLocation(
        getCurrentUserId(request, 'shipper'),
        parseOrderId(orderId),
      ),
      getRequestId(request),
    );
  }

  @Get('driver/orders/:orderId/navigation-targets')
  @UseGuards(AccessTokenGuard, DriverOnlyGuard)
  async getDriverNavigationTargets(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return ok(
      await this.mapsService.getDriverNavigationTargets(
        getCurrentUserId(request, 'driver'),
        parseOrderId(orderId),
      ),
      getRequestId(request),
    );
  }
}

function assertAuthenticated(request: AuthenticatedRequest) {
  if (!request.currentUser) {
    throw new BusinessError(
      ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      '访问令牌无效',
    );
  }
}

function getCurrentUserId(
  request: AuthenticatedRequest,
  expectedRole: 'shipper' | 'driver',
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

function getRequestId(request: AuthenticatedRequest) {
  const value = request.headers?.['x-request-id'];
  return Array.isArray(value) ? value[0] : value;
}
