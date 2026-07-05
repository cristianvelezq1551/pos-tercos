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
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  CreateSubproductSchema,
  RecordProductionSchema,
  UpdateSubproductSchema,
  type CreateSubproduct,
  type JwtAccessPayload,
  type ProductionEvidenceUpload,
  type ProductionRun,
  type RecordProduction,
  type Subproduct,
  type SubproductProductionStatus,
  type UpdateSubproduct,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, KitchenAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
import { detectImageMime } from '../common/image-mime';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProductionService } from './production.service';
import { SubproductsService } from './subproducts.service';

/** Límite de la foto de evidencia de producción (mismo criterio que facturas). */
const EVIDENCE_MAX_BYTES = 8 * 1024 * 1024;

@Controller('subproducts')
export class SubproductsController {
  constructor(
    private readonly subproducts: SubproductsService,
    private readonly production: ProductionService,
  ) {}

  @Get()
  list(@Query('only_active') onlyActive?: string): Promise<Subproduct[]> {
    return this.subproducts.list({ onlyActive: onlyActive === 'true' });
  }

  /** Estado de producción (stock + umbral) para el KDS. Cocinero/Admin/Dueño.
   *  Va ANTES de `:id` para que la ruta estática no caiga en el param. */
  @KitchenAccess()
  @Get('production-status')
  productionStatus(): Promise<SubproductProductionStatus[]> {
    return this.production.listProductionStatus();
  }

  /** Sube la foto de evidencia ANTES de registrar la producción. Devuelve la
   *  key para pasar como `evidenceKey` en /produce. Cocinero/Admin/Dueño. */
  @KitchenAccess()
  @Post('production/evidence')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: EVIDENCE_MAX_BYTES } }))
  async uploadEvidence(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ProductionEvidenceUpload> {
    if (!file) throw new BadRequestException('Falta el archivo en el campo "photo".');
    const mime = detectImageMime(file.buffer);
    if (!mime) {
      throw new BadRequestException('El archivo no parece una imagen válida (JPG, PNG, WebP, GIF).');
    }
    return this.production.uploadEvidence(file.buffer, mime);
  }

  /** Sirve la foto de evidencia de una tanda de producción. Cocinero/Admin/Dueño. */
  @KitchenAccess()
  @Get('production/:runId/evidence')
  async getEvidence(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.production.getEvidence(runId);
    if (!buffer) throw new NotFoundException('Sin evidencia para esta producción.');
    res.setHeader('Content-Type', detectImageMime(buffer) ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(buffer);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Subproduct> {
    return this.subproducts.getById(id);
  }

  @AdminAccess()
  @Post()
  @UsePipes(new ZodValidationPipe(CreateSubproductSchema))
  create(@Body() body: CreateSubproduct): Promise<Subproduct> {
    return this.subproducts.create(body);
  }

  @AdminAccess()
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateSubproductSchema)) body: UpdateSubproduct,
  ): Promise<Subproduct> {
    return this.subproducts.update(id, body);
  }

  @AdminAccess()
  @Post(':id/deactivate')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Subproduct> {
    return this.subproducts.deactivate(id);
  }

  /** Elimina DEFINITIVAMENTE — Dueño-only. */
  @OnlyDueno()
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.subproducts.remove(id);
  }

  /**
   * Registra una tanda de producción: +N al stock del subproducto y consume
   * insumos según receta. Cocinero / Admin / Dueño.
   *
   * Body: { quantityProduced, notes?, idempotencyKey? }
   * Bloquea si algún insumo no tiene stock suficiente (409).
   */
  @KitchenAccess()
  @Post(':id/produce')
  produce(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(RecordProductionSchema)) body: RecordProduction,
  ): Promise<ProductionRun> {
    return this.production.produce(id, body, user.sub);
  }
}
