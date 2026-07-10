import { Controller, Get, Header } from '@nestjs/common';
import { renderDriverCertificationAdminConsole } from './driver-certification-admin-console';
import { renderOrderAttachmentAdminConsole } from './order-attachment-admin-console';
import { renderShipperCouponAdminConsole } from './shipper-coupon-admin-console';

@Controller('admin')
export class AdminConsoleController {
  @Get('driver-certification-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getDriverCertificationConsole() {
    return renderDriverCertificationAdminConsole();
  }

  @Get('order-attachment-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getOrderAttachmentAuditConsole() {
    return renderOrderAttachmentAdminConsole();
  }

  @Get('shipper-coupon-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getShipperCouponConsole() {
    return renderShipperCouponAdminConsole();
  }
}
