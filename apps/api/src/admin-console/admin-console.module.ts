import { Module } from '@nestjs/common';
import { AdminConsoleController } from './admin-console.controller';

@Module({
  controllers: [AdminConsoleController],
})
export class AdminConsoleModule {}
