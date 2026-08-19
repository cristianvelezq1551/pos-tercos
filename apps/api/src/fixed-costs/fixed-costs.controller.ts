import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  CreateFixedCostSchema,
  UpdateFixedCostSchema,
  type CreateFixedCost,
  type FinancePaidFixedCost,
  type FinancePendingFixedCost,
  type FixedCost,
  type JwtAccessPayload,
  type UpdateFixedCost,
} from '@pos-tercos/types';
import type { Express } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OnlyDueno } from '../auth/decorators/roles.decorator';
import { detectImageMimeLoose } from '../common/image-mime';
import { parseOptionalAmount } from '../common/pocket-split';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FixedCostsService } from './fixed-costs.service';

const MAX_PROOF_BYTES = 10 * 1024 * 1024; // 10 MB

/** Costos fijos del negocio. Dueño-only (información financiera sensible). */
@OnlyDueno()
@Controller('fixed-costs')
export class FixedCostsController {
  constructor(private readonly costs: FixedCostsService) {}

  @Get()
  list(@Query('only_active') onlyActive?: string): Promise<FixedCost[]> {
    return this.costs.list({ onlyActive: onlyActive === 'true' });
  }

  /** Períodos pendientes por pagar (mismo cálculo que el cockpit de Pagos y
   *  cobros). Se declara ANTES de `:id` para que no lo capture el param. */
  @Get('pending')
  pending(): Promise<FinancePendingFixedCost[]> {
    return this.costs.getPendingPayments();
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<FixedCost> {
    return this.costs.getById(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateFixedCostSchema)) body: CreateFixedCost,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<FixedCost> {
    return this.costs.create(body, user.sub);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateFixedCostSchema)) body: UpdateFixedCost,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<FixedCost> {
    return this.costs.update(id, body, user.sub);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<void> {
    await this.costs.remove(id, user.sub);
  }

  // ==================================================================
  // CONTROL DE PAGO (Dueño)
  // ==================================================================

  /** Marca pagado un costo fijo para (año, mes) con comprobante. */
  @Post(':id/payment')
  @UseInterceptors(
    FileInterceptor('proof', { limits: { fileSize: MAX_PROOF_BYTES } }),
  )
  async markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body('periodYear', ParseIntPipe) periodYear: number,
    @Body('periodMonth', ParseIntPipe) periodMonth: number,
    @Body('paidAt') paidAt: string | undefined,
    @Body('amount') amount: string | undefined,
    @Body('note') note: string | undefined,
    @Body('cashAmount') cashAmount: string | undefined,
    @Body('bankAmount') bankAmount: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<FinancePaidFixedCost> {
    if (!file) throw new BadRequestException('Falta el comprobante (imagen).');
    const detected = detectImageMimeLoose(file.buffer, file.mimetype, file.originalname);
    if (!detected) {
      throw new BadRequestException('La imagen debe ser JPEG, PNG o WebP.');
    }
    if (paidAt && !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
      throw new BadRequestException('La fecha de pago debe tener el formato AAAA-MM-DD.');
    }
    let amountNum: number | undefined;
    if (amount !== undefined && amount !== '') {
      amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum < 0) {
        throw new BadRequestException('amount inválido.');
      }
    }
    return this.costs.markPaid(
      id,
      periodYear,
      periodMonth,
      user.sub,
      { buffer: file.buffer, mime: detected.mime, ext: detected.ext },
      {
        paidAtYmd: paidAt,
        amount: amountNum,
        note: note?.trim() || undefined,
        cashAmount: parseOptionalAmount(cashAmount),
        bankAmount: parseOptionalAmount(bankAmount),
      },
    );
  }

  /** Desmarca el pago de un período. */
  @Delete(':id/payment')
  async unmarkPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Query('year') yearStr: string | undefined,
    @Query('month') monthStr: string | undefined,
  ): Promise<{ ok: true }> {
    const periodYear = yearStr ? Number.parseInt(yearStr, 10) : NaN;
    const periodMonth = monthStr ? Number.parseInt(monthStr, 10) : NaN;
    if (!Number.isFinite(periodYear) || !Number.isFinite(periodMonth)) {
      throw new BadRequestException('?year y ?month requeridos.');
    }
    await this.costs.unmarkPayment(id, periodYear, periodMonth, user.sub);
    return { ok: true };
  }

  /** Comprobante (binario). */
  @Get('payment/:paymentId/proof')
  async getPaymentProof(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mime } = await this.costs.getPaymentProof(paymentId);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(buffer);
  }
}
