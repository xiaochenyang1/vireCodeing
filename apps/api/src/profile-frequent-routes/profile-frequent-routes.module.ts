import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileFrequentRoutesController } from './profile-frequent-routes.controller';
import {
  PrismaProfileFrequentRoutesRepository,
  type PrismaProfileFrequentRoutesClient,
} from './profile-frequent-routes.repository';
import { ProfileFrequentRoutesService } from './profile-frequent-routes.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProfileFrequentRoutesController],
  providers: [
    {
      provide: PrismaProfileFrequentRoutesRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaProfileFrequentRoutesRepository(
          prismaService as unknown as PrismaProfileFrequentRoutesClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: ProfileFrequentRoutesService,
      useFactory: (repository: PrismaProfileFrequentRoutesRepository) =>
        new ProfileFrequentRoutesService(repository),
      inject: [PrismaProfileFrequentRoutesRepository],
    },
    ShipperOnlyGuard,
  ],
})
export class ProfileFrequentRoutesModule {}
