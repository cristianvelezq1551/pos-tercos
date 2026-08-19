import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
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
  CloneInvoiceRequestSchema,
  ConfirmInvoiceSchema,
  CreateFromPhotoSchema,
  DiscardPaymentProofSchema,
  DiscardPhotoSchema,
  type CloneInvoiceRequest,
  type ConfirmInvoice,
  type CreateFromPhoto,
  type DiscardPaymentProof,
  type DiscardPhoto,
  type ExtractedInvoice,
  type ExtractInvoiceResponse,
  type Invoice,
  type InvoiceDraftResponse,
  type UploadPaymentProofResponse,
} from '@pos-tercos/types';
import type { Express } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
import { detectImageMime, detectImageMimeLoose } from '../common/image-mime';
import { parseOptionalAmount } from '../common/pocket-split';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { JwtAccessPayload } from '@pos-tercos/types';
import { InvoicePaymentsService } from './invoice-payments.service';
import { InvoicesService } from './invoices.service';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly invoicePayments: InvoicePaymentsService,
  ) {}

  /** FASE 15.A — sweep manual de huérfanos. El cron corre semanal. */
  @OnlyDueno()
  @Post('admin/sweep-orphans')
  async sweepOrphans(): Promise<{
    storageKeys: number;
    referencedKeys: number;
    deleted: number;
  }> {
    return this.invoices.sweepOrphanInvoiceFiles();
  }

  // Las facturas exponen costos de compra, IVA y proveedores → inteligencia
  // de costos. Solo Admin/Dueño las leen (el cajero/cocinero NO).
  @AdminAccess()
  @Get()
  list(
    @Query('status') status?: string,
    @Query('supplier_id') supplierId?: string,
    @Query('limit') limit?: string,
  ): Promise<Invoice[]> {
    return this.invoices.list({
      status,
      supplierId,
      limit: limit ? Math.min(Number(limit), 200) : undefined,
    });
  }

  @AdminAccess()
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Invoice> {
    return this.invoices.getById(id);
  }

  /**
   * Devuelve la extracción IA original guardada en aiExtractionJson.
   * Útil para reanudar drafts cuyos items aún no se confirmaron.
   */
  @AdminAccess()
  @Get(':id/raw-extraction')
  async getRawExtraction(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExtractedInvoice> {
    const extraction = await this.invoices.getRawExtraction(id);
    if (!extraction) {
      throw new NotFoundException('No raw extraction stored for this invoice');
    }
    return extraction;
  }

  /**
   * Carga manual: crea + confirma en un solo paso. NO deja borradores
   * cuando el usuario abandona; solo persiste si llega a confirmar.
   */
  @AdminAccess()
  @Post('manual')
  createManual(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(ConfirmInvoiceSchema)) body: ConfirmInvoice,
  ): Promise<Invoice> {
    return this.invoices.createManualConfirmed(body, user.sub);
  }

  @AdminAccess()
  @Post('from-clone')
  fromClone(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CloneInvoiceRequestSchema)) body: CloneInvoiceRequest,
  ): Promise<InvoiceDraftResponse> {
    return this.invoices.cloneFrom(body.sourceInvoiceId, user.sub);
  }

  @AdminAccess()
  @Post('upload-photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  /**
   * Sube foto + IA, devuelve la extracción + photoStorageKey. NO crea factura
   * en DB todavía: el cliente debe llamar `from-photo` para confirmar (o
   * `discard-photo` para abandonar). Evita borradores fantasma.
   */
  async uploadPhoto(
    @CurrentUser() user: JwtAccessPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ExtractInvoiceResponse> {
    if (!file) {
      throw new BadRequestException('Falta el archivo en el campo "photo".');
    }
    // We trust the file CONTENT (magic bytes) over the declared mimetype.
    const detectedMime = detectImageMime(file.buffer);
    if (!detectedMime) {
      throw new BadRequestException(
        `El archivo no parece ser una imagen válida. Formatos soportados: JPG, PNG, WebP, GIF.`,
      );
    }

    return this.invoices.extractFromPhoto({
      fileBuffer: file.buffer,
      mimeType: detectedMime,
      originalName: file.originalname,
      userId: user.sub,
    });
  }

  /** Crear+confirmar factura desde foto (IA). Asocia la foto previa por key. */
  @AdminAccess()
  @Post('from-photo')
  createFromPhoto(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CreateFromPhotoSchema)) body: CreateFromPhoto,
  ): Promise<Invoice> {
    const { photoStorageKey, aiModelUsed, ...confirm } = body;
    return this.invoices.createFromPhoto(confirm, photoStorageKey, aiModelUsed, user.sub);
  }

  /** El usuario cerró el modal IA sin confirmar → limpiar la foto subida. */
  @AdminAccess()
  @Post('discard-photo')
  @HttpCode(204)
  async discardPhoto(
    @Body(new ZodValidationPipe(DiscardPhotoSchema)) body: DiscardPhoto,
  ): Promise<void> {
    await this.invoices.discardPhoto(body.photoStorageKey);
  }

  /**
   * Pre-sube el comprobante de pago para "nace pagada" (carga manual). No crea
   * nada en DB — el confirm asocia la key (o discard-payment-proof si abandona).
   */
  @AdminAccess()
  @Post('upload-payment-proof')
  @UseInterceptors(
    FileInterceptor('proof', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }),
  )
  async uploadPaymentProof(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<UploadPaymentProofResponse> {
    if (!file) throw new BadRequestException('Falta el comprobante (imagen).');
    const detected = detectImageMimeLoose(file.buffer, file.mimetype, file.originalname);
    if (!detected) {
      throw new BadRequestException('La imagen debe ser JPEG, PNG o WebP.');
    }
    return this.invoices.uploadPendingPaymentProof(file.buffer, detected.mime, detected.ext);
  }

  /** El usuario cerró el modal sin confirmar → limpiar el comprobante pre-subido. */
  @AdminAccess()
  @Post('discard-payment-proof')
  @HttpCode(204)
  async discardPaymentProof(
    @Body(new ZodValidationPipe(DiscardPaymentProofSchema)) body: DiscardPaymentProof,
  ): Promise<void> {
    await this.invoices.discardPendingPaymentProof(body.proofStorageKey);
  }

  @AdminAccess()
  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ConfirmInvoiceSchema)) body: ConfirmInvoice,
  ): Promise<Invoice> {
    return this.invoices.confirm(id, body, user.sub);
  }

  @AdminAccess()
  @Post(':id/reject')
  reject(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason?: string },
  ): Promise<Invoice> {
    return this.invoices.reject(id, user.sub, body?.reason);
  }

  /**
   * FASE 4 ajustes 2.10: borra borrador PENDING_REVIEW. Para CONFIRMED o
   * REJECTED el endpoint rechaza con 400 (preserva audit + movements).
   */
  @AdminAccess()
  @Delete(':id')
  @HttpCode(204)
  async delete(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.invoices.delete(id, user.sub);
  }

  /**
   * FASE 4 ajustes 2.9: sirve la foto original de la factura. Solo Admin/Dueño.
   * 404 si no hay foto (clonada manual / sin upload).
   */
  @AdminAccess()
  @Get(':id/photo')
  async getPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const photo = await this.invoices.getPhoto(id);
    if (!photo) {
      throw new NotFoundException(
        'Esta factura no tiene foto (fue ingresada manualmente o clonada).',
      );
    }
    const mime = detectImageMime(photo.buffer);
    res.setHeader('Content-Type', mime ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.status(200).send(photo.buffer);
  }

  // ==================================================================
  // CONTROL DE PAGO AL PROVEEDOR (solo Dueño + PIN)
  // ==================================================================

  /** Marca pagada con comprobante (multipart). PIN de aprobación en header.
   *  El Dueño puede sobre cualquier factura; el Admin Operativo solo sobre las
   *  que él creó (el service valida la propiedad por rol). */
  @AdminAccess()
  @Post(':id/payment/paid')
  @UseInterceptors(
    FileInterceptor('proof', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }),
  )
  async markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-approval-pin') pin: string | undefined,
    @CurrentUser() user: JwtAccessPayload,
    @Body('paidAt') paidAt: string | undefined,
    @Body('note') note: string | undefined,
    @Body('cashAmount') cashAmount: string | undefined,
    @Body('bankAmount') bankAmount: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<Invoice> {
    if (!file) throw new BadRequestException('Falta el comprobante (imagen).');
    const detected = detectImageMimeLoose(file.buffer, file.mimetype, file.originalname);
    if (!detected) {
      throw new BadRequestException('La imagen debe ser JPEG, PNG o WebP.');
    }
    if (paidAt && !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
      throw new BadRequestException('La fecha de pago debe tener el formato AAAA-MM-DD.');
    }
    return this.invoicePayments.markPaymentPaid(
      id,
      requirePin(pin),
      user.sub,
      user.role,
      { buffer: file.buffer, mime: detected.mime, ext: detected.ext },
      {
        paidAtYmd: paidAt,
        note: note?.trim() || undefined,
        cashAmount: parseOptionalAmount(cashAmount),
        bankAmount: parseOptionalAmount(bankAmount),
      },
    );
  }

  /** Desmarca el pago (borra registro + comprobante). Vuelve a PENDING.
   *  Dueño sobre cualquiera; Admin Operativo solo sobre las que él creó. */
  @AdminAccess()
  @Delete(':id/payment')
  unmarkPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-approval-pin') pin: string | undefined,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<Invoice> {
    return this.invoicePayments.unmarkPayment(id, requirePin(pin), user.sub, user.role);
  }

  /** Comprobante de transferencia al proveedor (binario). Cualquier admin lo ve. */
  @AdminAccess()
  @Get(':id/payment-proof')
  async getPaymentProof(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mime } = await this.invoicePayments.getPaymentProof(id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(buffer);
  }
}

function requirePin(pin: string | undefined): string {
  if (!pin) {
    throw new BadRequestException('Se requiere el PIN de aprobación (header X-Approval-Pin).');
  }
  return pin;
}
