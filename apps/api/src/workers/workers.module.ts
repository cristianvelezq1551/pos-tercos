import { Module } from '@nestjs/common';
import { WorkersController } from './workers.controller';
import { WorkersWeeklyService } from './workers-weekly.service';
import { WorkersService } from './workers.service';

@Module({
  controllers: [WorkersController],
  providers: [WorkersService, WorkersWeeklyService],
  exports: [WorkersService, WorkersWeeklyService],
})
export class WorkersModule {}
