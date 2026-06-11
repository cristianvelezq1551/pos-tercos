import { Module } from '@nestjs/common';
import { WorkersController } from './workers.controller';
import { WorkersPaymentsService } from './workers-payments.service';
import { WorkersService } from './workers.service';

@Module({
  controllers: [WorkersController],
  providers: [WorkersService, WorkersPaymentsService],
  exports: [WorkersService],
})
export class WorkersModule {}
