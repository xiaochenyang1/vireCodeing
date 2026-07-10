import { Module } from '@nestjs/common';
import { AdminConsoleModule } from './admin-console/admin-console.module';
import { AuthModule } from './auth/auth.module';
import { DriverCertificationModule } from './driver-certification/driver-certification.module';
import { DriverOrdersModule } from './driver-orders/driver-orders.module';
import { FilesModule } from './files/files.module';
import { HealthController } from './health/health.controller';
import { OrderDraftsModule } from './order-drafts/order-drafts.module';
import { OrdersModule } from './orders/orders.module';
import { ProfileAccountModule } from './profile-account/profile-account.module';
import { ProfileAddressBookModule } from './profile-address-book/profile-address-book.module';
import { ProfileCouponsModule } from './profile-coupons/profile-coupons.module';
import { ProfileEvaluationsModule } from './profile-evaluations/profile-evaluations.module';
import { ProfileFrequentRoutesModule } from './profile-frequent-routes/profile-frequent-routes.module';
import { ProfileInvoicesModule } from './profile-invoices/profile-invoices.module';
import { ProfileSpendingModule } from './profile-spending/profile-spending.module';
import { ProfileVerificationModule } from './profile-verification/profile-verification.module';

@Module({
  imports: [
    AdminConsoleModule,
    AuthModule,
    DriverCertificationModule,
    DriverOrdersModule,
    FilesModule,
    OrdersModule,
    OrderDraftsModule,
    ProfileAccountModule,
    ProfileAddressBookModule,
    ProfileCouponsModule,
    ProfileEvaluationsModule,
    ProfileFrequentRoutesModule,
    ProfileInvoicesModule,
    ProfileSpendingModule,
    ProfileVerificationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
