import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileAccountController } from './profile-account.controller';
import {
  PrismaProfileAccountRepository,
  type PrismaProfileAccountClient,
} from './profile-account.repository';
import { ProfileAccountService } from './profile-account.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProfileAccountController],
  providers: [
    {
      provide: PrismaProfileAccountRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaProfileAccountRepository(
          prismaService as unknown as PrismaProfileAccountClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: ProfileAccountService,
      useFactory: (repository: PrismaProfileAccountRepository) =>
        new ProfileAccountService(repository),
      inject: [PrismaProfileAccountRepository],
    },
    ShipperOnlyGuard,
  ],
})
export class ProfileAccountModule {}
