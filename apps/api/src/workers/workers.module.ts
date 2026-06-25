import { Module } from '@nestjs/common';
import { ShiftsModule } from '../shifts/shifts.module';
import { WorkersController } from './workers.controller';
import { WorkersWeeklyService } from './workers-weekly.service';
import { WorkersService } from './workers.service';

@Module({
  imports: [ShiftsModule],
  controllers: [WorkersController],
  providers: [WorkersService, WorkersWeeklyService],
  exports: [WorkersService, WorkersWeeklyService],
})
export class WorkersModule {}
