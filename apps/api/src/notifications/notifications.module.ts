import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsController } from './notifications.controller';
import {
  InMemoryNotificationsRepository,
  PrismaNotificationsRepository,
  type PrismaNotificationsClient,
} from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { SandboxPushProvider } from './sandbox-push.provider';

export const NOTIFICATIONS_REPOSITORY = Symbol('NOTIFICATIONS_REPOSITORY');

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [NotificationsController],
  providers: [
    {
      provide: SandboxPushProvider,
      useFactory: () => new SandboxPushProvider(),
    },
    {
      provide: NOTIFICATIONS_REPOSITORY,
      useFactory: (prismaService: PrismaService) =>
        new PrismaNotificationsRepository(
          prismaService as unknown as PrismaNotificationsClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: NotificationsService,
      useFactory: (
        repository: PrismaNotificationsRepository | InMemoryNotificationsRepository,
        pushProvider: SandboxPushProvider,
      ) => new NotificationsService(repository, pushProvider),
      inject: [NOTIFICATIONS_REPOSITORY, SandboxPushProvider],
    },
  ],
  exports: [NotificationsService, SandboxPushProvider],
})
export class NotificationsModule {}
