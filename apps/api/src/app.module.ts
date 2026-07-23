import { Module } from '@nestjs/common';
import { AdminConsoleModule } from './admin-console/admin-console.module';
import { AuthModule } from './auth/auth.module';
import { DriverCertificationModule } from './driver-certification/driver-certification.module';
import { DriverOrdersModule } from './driver-orders/driver-orders.module';
import { FilesModule } from './files/files.module';
import { HealthController } from './health/health.controller';
import { MapsModule } from './maps/maps.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrderDraftsModule } from './order-drafts/order-drafts.module';
import { OrderExceptionCasesModule } from './order-exception-cases/order-exception-cases.module';
import { OrdersModule } from './orders/orders.module';
import { ProfileAccountModule } from './profile-account/profile-account.module';
import { ProfileAddressBookModule } from './profile-address-book/profile-address-book.module';
import { ProfileCouponsModule } from './profile-coupons/profile-coupons.module';
import { ProfileDriverModule } from './profile-driver/profile-driver.module';
import { ProfileEvaluationsModule } from './profile-evaluations/profile-evaluations.module';
import { ProfileFrequentRoutesModule } from './profile-frequent-routes/profile-frequent-routes.module';
import { ProfileInvoicesModule } from './profile-invoices/profile-invoices.module';
import { ProfileSpendingModule } from './profile-spending/profile-spending.module';
import { ProfileVerificationModule } from './profile-verification/profile-verification.module';
import { PaymentsModule } from './payments/payments.module';
import { SupportTicketsModule } from './support-tickets/support-tickets.module';

@Module({
  imports: [
    AdminConsoleModule,
    AuthModule,
    DriverCertificationModule,
    DriverOrdersModule,
    FilesModule,
    MapsModule,
    NotificationsModule,
    OrdersModule,
    PaymentsModule,
    OrderExceptionCasesModule,
    OrderDraftsModule,
    ProfileAccountModule,
    ProfileAddressBookModule,
    ProfileCouponsModule,
    ProfileDriverModule,
    ProfileEvaluationsModule,
    ProfileFrequentRoutesModule,
    ProfileInvoicesModule,
    ProfileSpendingModule,
    ProfileVerificationModule,
    SupportTicketsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
