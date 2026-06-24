import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  AddPayrollAdjustmentSchema,
  PayWeekDaysSchema,
  SetPayrollDaySchema,
  type AddPayrollAdjustment,
  type EmployeePanel,
  type JwtAccessPayload,
  type PagoReport,
  type PayrollAdjustment,
  type PayrollDay,
  type PayrollPayment,
  type PayrollWeekPayment,
  type SetPayrollDay,
  type WeeklyPayrollReport,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
import { detectImageMimeLoose } from '../common/image-mime';
import { parseOptionalAmount } from '../common/pocket-split';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WorkersPaymentsService } from './workers-payments.service';
import { WorkersWeeklyService } from './workers-weekly.service';
import { WorkersService } from './workers.service';

/** RRHH / nómina. Admin/Dueño. */
@Controller('workers')
@AdminAccess()
export class WorkersController {
  constructor(
    private readonly workers: WorkersService,
    private readonly payments: WorkersPaymentsService,
    private readonly weekly: WorkersWeeklyService,
  ) {}

  @Get('users')
  listUsers(): Promise<Array<{ id: string; fullName: string; role: string; payType: string | null }>> {
    return this.workers.listPayrollUsers();
  }

  /** Pago para pagar. ?start=YYYY-MM-DD (cualquier día del pago: se ancla al
   *  inicio = día 1, 8, 16 o 23 del mes); por defecto el pago actual. */
  @Get('period')
  getPaymentPeriod(@Query('start') start?: string): Promise<PagoReport> {
    return this.workers.getPaymentPeriod(start ?? new Date().toISOString().slice(0, 10));
  }

  /** Panel mensual de un empleado. ?year=&month= (1-12); por defecto mes actual. */
  @Get('panel/:userId')
  getPanel(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ): Promise<EmployeePanel> {
    const now = new Date();
    const y = year ? Number(year) : now.getFullYear();
    const m = month ? Number(month) : now.getMonth() + 1;
    return this.workers.getEmployeePanel(userId, y, m);
  }

  @Post(':userId/day')
  setDay(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Headers('x-approval-pin') pin: string | undefined,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(SetPayrollDaySchema)) body: SetPayrollDay,
  ): Promise<PayrollDay> {
    return this.workers.setPayrollDay(userId, body, requirePin(pin), user.sub);
  }

  @Delete(':userId/day')
  deleteDay(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('date') date: string,
    @Headers('x-approval-pin') pin: string | undefined,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<void> {
    return this.workers.deletePayrollDay(userId, date, requirePin(pin), user.sub);
  }

  @Post(':userId/adjustment')
  addAdjustment(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Headers('x-approval-pin') pin: string | undefined,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(AddPayrollAdjustmentSchema)) body: AddPayrollAdjustment,
  ): Promise<PayrollAdjustment> {
    return this.workers.addAdjustment(userId, body, requirePin(pin), user.sub);
  }

  @Delete('adjustment/:id')
  deleteAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-approval-pin') pin: string | undefined,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<void> {
    return this.workers.deleteAdjustment(id, requirePin(pin), user.sub);
  }

  // ================================================================
  // CONTROL DE PAGOS (solo Dueño)
  // ================================================================

  /** Marca PAGADO con comprobante (imagen). Solo Dueño + PIN. Sat/Sun. */
  @OnlyDueno()
  @Post(':userId/payment/paid')
  @UseInterceptors(FileInterceptor('proof', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async markPaid(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Headers('x-approval-pin') pin: string | undefined,
    @CurrentUser() user: JwtAccessPayload,
    @Body('periodStart') periodStart: string | undefined,
    @Body('note') note: string | undefined,
    @Body('cashAmount') cashAmount: string | undefined,
    @Body('bankAmount') bankAmount: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<PayrollPayment> {
    if (!file) throw new BadRequestException('Falta el comprobante (imagen).');
    if (!periodStart || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
      throw new BadRequestException('periodStart (YYYY-MM-DD) requerido.');
    }
    const detected = detectImageMimeLoose(file.buffer, file.mimetype, file.originalname);
    if (!detected) {
      throw new BadRequestException('La imagen debe ser JPEG, PNG o WebP.');
    }
    return this.payments.markPaymentPaid(
      userId,
      periodStart,
      requirePin(pin),
      user.sub,
      { buffer: file.buffer, mime: detected.mime, ext: detected.ext },
      note?.trim() || undefined,
      parseOptionalAmount(cashAmount),
      parseOptionalAmount(bankAmount),
    );
  }

  /** Desmarca (borra el registro y la imagen). Solo Dueño + PIN. */
  @OnlyDueno()
  @Delete(':userId/payment')
  unmarkPayment(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('period') periodStart: string,
    @Headers('x-approval-pin') pin: string | undefined,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<void> {
    if (!periodStart || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
      throw new BadRequestException('?period=YYYY-MM-DD requerido.');
    }
    return this.payments.unmarkPayment(userId, periodStart, requirePin(pin), user.sub);
  }

  /** Comprobante binario (Dueño). */
  @OnlyDueno()
  @Get('payment/:id/proof')
  async getProof(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mime } = await this.payments.getPaymentProof(id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(buffer);
  }

  // ================================================================
  // NÓMINA SEMANAL (DIARIO) — abonos parciales por días + comprobante
  // ================================================================

  /** Reporte de la semana que contiene `?week=YYYY-MM-DD` (default: hoy). */
  @Get('weekly')
  getWeekly(@Query('week') week?: string): Promise<WeeklyPayrollReport> {
    const ref = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : new Date().toISOString().slice(0, 10);
    return this.weekly.getWeeklyPayroll(ref);
  }

  /** Paga días seleccionados de la semana con comprobante. Solo Dueño + PIN. */
  @OnlyDueno()
  @Post('weekly/pay')
  @UseInterceptors(FileInterceptor('proof', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async payWeek(
    @Headers('x-approval-pin') pin: string | undefined,
    @CurrentUser() user: JwtAccessPayload,
    @Body('payload') payloadRaw: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<PayrollWeekPayment> {
    if (!file) throw new BadRequestException('Falta el comprobante (imagen).');
    if (!payloadRaw) throw new BadRequestException('Falta el payload del pago.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw);
    } catch {
      throw new BadRequestException('Payload inválido.');
    }
    const input = PayWeekDaysSchema.parse(parsed);
    const detected = detectImageMimeLoose(file.buffer, file.mimetype, file.originalname);
    if (!detected) throw new BadRequestException('La imagen debe ser JPEG, PNG o WebP.');
    return this.weekly.payWeekDays(
      input,
      { buffer: file.buffer, mime: detected.mime, ext: detected.ext },
      requirePin(pin),
      user.sub,
    );
  }

  /** Anula un abono semanal (reversa la caja si fue efectivo). Solo Dueño + PIN. */
  @OnlyDueno()
  @Post('weekly/payment/:id/void')
  voidWeekPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-approval-pin') pin: string | undefined,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<void> {
    return this.weekly.voidWeekPayment(id, requirePin(pin), user.sub);
  }

  /** Comprobante binario de un abono semanal (Dueño). */
  @OnlyDueno()
  @Get('weekly/payment/:id/proof')
  async getWeekProof(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mime } = await this.weekly.getWeekPaymentProof(id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(buffer);
  }
}

/** Exige el PIN de aprobación; toda acción de nómina afecta plata. */
function requirePin(pin: string | undefined): string {
  if (!pin) {
    throw new BadRequestException('Se requiere el PIN de aprobación (header X-Approval-Pin).');
  }
  return pin;
}
