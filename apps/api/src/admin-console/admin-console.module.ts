import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { AdminConsoleController } from './admin-console.controller';
import {
  PrismaAdminConsoleOverviewRepository,
  type PrismaAdminConsoleOverviewClient,
} from './admin-console-overview.repository';
import { AdminConsoleOverviewService } from './admin-console-overview.service';
import { AdminPermissionMatrixService } from './admin-permission-matrix.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AdminConsoleController],
  providers: [
    {
      provide: PrismaAdminConsoleOverviewRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaAdminConsoleOverviewRepository(
          prismaService as unknown as PrismaAdminConsoleOverviewClient,
          {
            ...(process.env.S3_UPLOAD_EXPIRES_IN_SECONDS
              ? {
                  fileUploadExpiresInSeconds: Number(
                    process.env.S3_UPLOAD_EXPIRES_IN_SECONDS,
                  ),
                }
              : {}),
          },
        ),
      inject: [PrismaService],
    },
    {
      provide: AdminConsoleOverviewService,
      useFactory: (repository: PrismaAdminConsoleOverviewRepository) =>
        new AdminConsoleOverviewService(repository),
      inject: [PrismaAdminConsoleOverviewRepository],
    },
    AdminPermissionMatrixService,
    AdminOnlyGuard,
  ],
})
export class AdminConsoleModule {}
