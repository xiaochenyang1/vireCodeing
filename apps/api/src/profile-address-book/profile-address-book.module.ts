import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ShipperOnlyGuard } from '../auth/role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileAddressBookController } from './profile-address-book.controller';
import {
  PrismaProfileAddressBookRepository,
  type PrismaProfileAddressBookClient,
} from './profile-address-book.repository';
import { ProfileAddressBookService } from './profile-address-book.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProfileAddressBookController],
  providers: [
    {
      provide: PrismaProfileAddressBookRepository,
      useFactory: (prismaService: PrismaService) =>
        new PrismaProfileAddressBookRepository(
          prismaService as unknown as PrismaProfileAddressBookClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: ProfileAddressBookService,
      useFactory: (repository: PrismaProfileAddressBookRepository) =>
        new ProfileAddressBookService(repository),
      inject: [PrismaProfileAddressBookRepository],
    },
    ShipperOnlyGuard,
  ],
})
export class ProfileAddressBookModule {}
