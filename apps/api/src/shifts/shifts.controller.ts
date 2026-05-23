import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  CloseShiftSchema,
  CreateCashMovementSchema,
  OpenShiftSchema,
  ShiftStatusEnum,
  type AiSummary,
  type CashMovement,
  type CloseShift,
  type CreateCashMovement,
  type CurrentShiftStatus,
  type OpenShift,
  type Shift,
  type ShiftSessionDetail,
} from '@pos-tercos/types';
import type { JwtAccessPayload } from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, CashierAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ShiftsService } from './shifts.service';

const ADMIN_ROLES = new Set(['ADMIN_OPERATIVO', 'ADMIN_FINANCIERO', 'DUENO']);

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
    return this.shifts.close(id, body, user.sub, ADMIN_ROLES.has(user.role));
  }

  /** Registra una entrada/salida de efectivo en la caja (aparte de ventas). */
  @CashierAccess()
  @Post(':id/cash-movements')
  addCashMovement(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreateCashMovementSchema)) body: CreateCashMovement,
  ): Promise<CashMovement> {
    return this.shifts.addCashMovement(id, body, user.sub);
  }

  @CashierAccess()
  @Get(':id/cash-movements')
  cashMovements(@Param('id', ParseUUIDPipe) id: string): Promise<CashMovement[]> {
    return this.shifts.listCashMovements(id);
  }

  /** Reabre una caja cerrada por error (admin/dueño). Conserva la sesión del día. */
  @AdminAccess()
  @Post(':id/reopen')
  reopen(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Shift> {
    return this.shifts.reopen(id, user.sub);
  }

  @CashierAccess()
  @Get('current')
  current(@CurrentUser() user: JwtAccessPayload): Promise<Shift | null> {
    return this.shifts.getCurrent(user.sub);
  }

  /** Estado de caja para la UI: turno actual + si quedó abierto de un día previo. */
  @CashierAccess()
  @Get('current-status')
  currentStatus(@CurrentUser() user: JwtAccessPayload): Promise<CurrentShiftStatus> {
    return this.shifts.getCurrentStatus(user.sub);
  }

  /** Detalle consolidado de la sesión. Cajero: solo la suya. Admin: cualquiera. */
  /** Asistente de cierre (IA): explica el descuadre. On-demand. */
  @CashierAccess()
  @Get(':id/close-analysis')
  closeAnalysis(@Param('id', ParseUUIDPipe) id: string): Promise<AiSummary> {
    return this.shifts.analyzeClose(id);
  }

  @CashierAccess()
  @Get(':id/detail')
  async detail(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShiftSessionDetail> {
    const detail = await this.shifts.getSessionDetail(id);
    if (!ADMIN_ROLES.has(user.role) && detail.shift.cashierId !== user.sub) {
      throw new ForbiddenException('Solo podés ver el detalle de tu propia caja.');
    }
    return detail;
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
