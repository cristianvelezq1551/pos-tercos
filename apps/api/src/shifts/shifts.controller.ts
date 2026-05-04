import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  CloseShiftSchema,
  OpenShiftSchema,
  ShiftStatusEnum,
  type CloseShift,
  type OpenShift,
  type Shift,
} from '@pos-tercos/types';
import type { JwtAccessPayload } from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CashierAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ShiftsService } from './shifts.service';

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @CashierAccess()
  @Post('open')
  open(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(OpenShiftSchema)) body: OpenShift,
  ): Promise<Shift> {
    return this.shifts.open(body, user.sub);
  }

  /** FASE 11.A: cierre del turno + cálculo expectedCash + diff. */
  @CashierAccess()
  @Post(':id/close')
  close(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CloseShiftSchema)) body: CloseShift,
  ): Promise<Shift> {
    return this.shifts.close(id, body, user.sub);
  }

  @CashierAccess()
  @Get('current')
  current(@CurrentUser() user: JwtAccessPayload): Promise<Shift | null> {
    return this.shifts.getCurrent(user.sub);
  }

  @CashierAccess()
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Shift> {
    return this.shifts.getById(id);
  }

  @CashierAccess()
  @Get()
  list(
    @Query('cashier_id') cashierId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ): Promise<Shift[]> {
    const parsedStatus = status ? ShiftStatusEnum.parse(status) : undefined;
    return this.shifts.list({
      cashierId,
      status: parsedStatus,
      limit: limit ? Math.min(Number(limit), 200) : undefined,
    });
  }
}
