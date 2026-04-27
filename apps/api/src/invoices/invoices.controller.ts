import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ConfirmInvoiceSchema,
  type ConfirmInvoice,
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
}
