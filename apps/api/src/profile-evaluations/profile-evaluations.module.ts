import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminProfileEvaluationsController,
  ProfileEvaluationsController,
} from './profile-evaluations.controller';
import {
  PrismaProfileEvaluationsRepository,
  type PrismaProfileEvaluationsClient,
} from './profile-evaluations.repository';
import { ProfileEvaluationsService } from './profile-evaluations.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProfileEvaluationsController, AdminProfileEvaluationsController],
  providers: [
    {
      provide: PrismaProfileEvaluationsRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaProfileEvaluationsRepository(
          prismaService as unknown as PrismaProfileEvaluationsClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: ProfileEvaluationsService,
      useFactory: (repository: PrismaProfileEvaluationsRepository) =>
        new ProfileEvaluationsService(repository),
      inject: [PrismaProfileEvaluationsRepository],
    },
    AdminOnlyGuard,
    ShipperOnlyGuard,
  ],
})
export class ProfileEvaluationsModule {}
