import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
  type CloneInvoiceRequest,
  type ConfirmInvoice,
  type ExtractedInvoice,
  type Invoice,
  type InvoiceDraftResponse,
} from '@pos-tercos/types';
import type { Express } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { detectImageMime } from '../common/image-mime';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { JwtAccessPayload } from '@pos-tercos/types';
import { InvoicesService } from './invoices.service';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

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

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Invoice> {
    return this.invoices.getById(id);
  }

  /**
   * Devuelve la extracción IA original guardada en aiExtractionJson.
   * Útil para reanudar drafts cuyos items aún no se confirmaron.
   */
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
  async uploadPhoto(
    @CurrentUser() user: JwtAccessPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<InvoiceDraftResponse> {
    if (!file) {
      throw new BadRequestException('Falta el archivo en el campo "photo".');
    }

    // We trust the file CONTENT (magic bytes) over the declared mimetype.
    // It's common for users to rename files (.png saved as .jpg) and the
    // LLM provider rejects mismatched media types.
    const detectedMime = detectImageMime(file.buffer);
    if (!detectedMime) {
      throw new BadRequestException(
        `El archivo no parece ser una imagen válida. Formatos soportados: JPG, PNG, WebP, GIF.`,
      );
    }

    return this.invoices.uploadPhoto({
      fileBuffer: file.buffer,
      mimeType: detectedMime,
      originalName: file.originalname,
      userId: user.sub,
    });
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
}
