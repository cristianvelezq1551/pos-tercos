import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  CheckInSchema,
  CheckOutSchema,
  CreateCommissionSchema,
  type CheckIn,
  type CheckOut,
  type CreateCommission,
  type JwtAccessPayload,
  type PayrollPeriodReport,
  type WorkerAttendance,
  type WorkerCommission,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WorkersService } from './workers.service';

/**
 * Endpoints RRHH ligero (FASE 14.B). Todo Admin/Dueño — solo el dueño/
 * admin operativo registra asistencia y configura comisiones.
 */
@Controller('workers')
@AdminAccess()
export class WorkersController {
  constructor(private readonly workers: WorkersService) {}

  // -----------------------
  // Attendance
  // -----------------------

  @Get('attendance')
  listAttendance(
    @Query('user_id') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('only_open') onlyOpen?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<WorkerAttendance[]> {
    const limit = limitRaw ? Math.min(Math.max(Number(limitRaw) || 200, 1), 500) : 200;
    return this.workers.listAttendance({
      userId,
      from: from ? parseDate(from) : undefined,
      to: to ? parseDate(to, true) : undefined,
      onlyOpen: onlyOpen === 'true',
      limit,
    });
  }

  @Post(':userId/check-in')
  checkIn(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CheckInSchema)) body: CheckIn,
  ): Promise<WorkerAttendance> {
    return this.workers.checkIn(userId, body, user.sub);
  }

  @Post('attendance/:id/check-out')
  checkOut(
    @Param('id', ParseUUIDPipe) attendanceId: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CheckOutSchema)) body: CheckOut,
  ): Promise<WorkerAttendance> {
    return this.workers.checkOut(attendanceId, body, user.sub);
  }

  // -----------------------
  // Commissions
  // -----------------------

  @Get('commissions')
  listCommissions(
    @Query('user_id') userId?: string,
  ): Promise<WorkerCommission[]> {
    return this.workers.listCommissions(userId);
  }

  @Post(':userId/commission')
  createCommission(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CreateCommissionSchema)) body: CreateCommission,
  ): Promise<WorkerCommission> {
    return this.workers.createCommission(userId, body, user.sub);
  }

  // -----------------------
  // Payroll period
  // -----------------------

  @Get('payroll-period')
  getPayrollPeriod(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
  ): Promise<PayrollPeriodReport> {
    if (!from || !to) {
      throw new BadRequestException('?from y ?to requeridos (YYYY-MM-DD)');
    }
    return this.workers.getPayrollPeriod(parseDate(from), parseDate(to, true));
  }
}

function parseDate(s: string, endOfDay = false): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new BadRequestException(`Fecha inválida: ${s}`);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}
