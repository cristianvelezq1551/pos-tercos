import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
  AddWeeklyAdjustmentSchema,
  PayWeekDaysSchema,
  SetPayrollDaySchema,
  type AddWeeklyAdjustment,
  type JwtAccessPayload,
  type PayrollAdjustment,
  type PayrollDay,
  type PayrollWeekPayment,
  type SetPayrollDay,
  type WeeklyPayrollReport,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
import { detectImageMimeLoose } from '../common/image-mime';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WorkersWeeklyService } from './workers-weekly.service';
import { WorkersService } from './workers.service';

/** RRHH / nómina unificada SEMANAL. Admin/Dueño. */
@Controller('workers')
@AdminAccess()
export class WorkersController {
  constructor(
    private readonly workers: WorkersService,
    private readonly weekly: WorkersWeeklyService,
  ) {}

  @Get('users')
  listUsers(): Promise<Array<{ id: string; fullName: string; role: string; payType: string | null }>> {
    return this.workers.listPayrollUsers();
  }

  // ================================================================
  // NÓMINA SEMANAL — adeudo por semana + abonos parciales con comprobante
  // ================================================================

  // Ajustes semanales (bono/descuento) — DECLARADOS ANTES de las rutas con
  // `:userId/...` para que `weekly/adjustment` no caiga en `:userId='weekly'`.
  /** Agrega un bono/descuento a la semana de un empleado. Solo Dueño. */
  @OnlyDueno()
  @Post('weekly/adjustment')
  addWeeklyAdjustment(
    @Body(new ZodValidationPipe(AddWeeklyAdjustmentSchema)) body: AddWeeklyAdjustment,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PayrollAdjustment> {
    return this.weekly.addWeeklyAdjustment(body, user.sub);
  }

  /** Elimina un bono/descuento de la semana. Solo Dueño. */
  @OnlyDueno()
  @Delete('weekly/adjustment/:id')
  deleteWeeklyAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<void> {
    return this.weekly.deleteWeeklyAdjustment(id, user.sub);
  }

  /** Reporte de la semana que contiene `?week=YYYY-MM-DD` (default: hoy). */
  @Get('weekly')
  getWeekly(@Query('week') week?: string): Promise<WeeklyPayrollReport> {
    const ref = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : new Date().toISOString().slice(0, 10);
    return this.weekly.getWeeklyPayroll(ref);
  }

  /** Paga días seleccionados de la semana. Solo Dueño. Comprobante opcional. */
  @OnlyDueno()
  @Post('weekly/pay')
  @UseInterceptors(FileInterceptor('proof', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async payWeek(
    @CurrentUser() user: JwtAccessPayload,
    @Body('payload') payloadRaw: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<PayrollWeekPayment> {
    if (!payloadRaw) throw new BadRequestException('Falta el payload del pago.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw);
    } catch {
      throw new BadRequestException('Payload inválido.');
    }
    const input = PayWeekDaysSchema.parse(parsed);
    let proof: { buffer: Buffer; mime: string; ext: string } | null = null;
    if (file) {
      const detected = detectImageMimeLoose(file.buffer, file.mimetype, file.originalname);
      if (!detected) throw new BadRequestException('La imagen debe ser JPEG, PNG o WebP.');
      proof = { buffer: file.buffer, mime: detected.mime, ext: detected.ext };
    }
    return this.weekly.payWeekDays(input, proof, user.sub);
  }

  /** Anula un abono semanal (reversa la caja si fue efectivo). Solo Dueño. */
  @OnlyDueno()
  @Post('weekly/payment/:id/void')
  voidWeekPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<void> {
    return this.weekly.voidWeekPayment(id, user.sub);
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

  // ----------------------------------------------------------------
  // Excepciones de día (DIARIO): llegada tarde, ausencia, monto distinto.
  // DECLARADAS al final — las rutas `:userId/...` son param routes y deben ir
  // DESPUÉS de las estáticas `weekly/...` para no shadowearlas.
  // ----------------------------------------------------------------

  /** Setea/edita el valor de un día de un DIARIO. Solo Dueño. */
  @OnlyDueno()
  @Post(':userId/day')
  setDay(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(SetPayrollDaySchema)) body: SetPayrollDay,
  ): Promise<PayrollDay> {
    return this.weekly.setPayrollDay(userId, body, user.sub);
  }

  /** Borra la excepción de un día (vuelve al valor por defecto). Solo Dueño. */
  @OnlyDueno()
  @Delete(':userId/day')
  deleteDay(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('date') date: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<void> {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('?date=YYYY-MM-DD requerido.');
    }
    return this.weekly.deletePayrollDay(userId, date, user.sub);
  }
}
