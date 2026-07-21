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
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { OfflineAvailabilitySnapshot } from '@pos-tercos/domain';
import type { Response } from 'express';
import {
  CreateProductSchema,
  SetComboComponentsSchema,
  SetForceAvailableSchema,
  SetProductOptionsSchema,
  SetSoldOutSchema,
  UpdateProductSchema,
  type CreateProduct,
  type JwtAccessPayload,
  type Product,
  type ProductAvailability,
  type SetComboComponents,
  type SetForceAvailable,
  type SetProductOptions,
  type SetSoldOut,
  type UpdateProduct,
} from '@pos-tercos/types';
import { CashierAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { detectImageMimeLoose } from '../common/image-mime';
import { ProductsService } from './products.service';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

// Roles que ven el costo de compra. Debe contener SOLO valores reales del enum
// UserRole (CAJERO/COCINERO/ADMIN_OPERATIVO/DUENO/TRABAJADOR) — no agregar roles
// inexistentes: un gate sobre un rol que nadie puede tener nunca se activa.
const COST_ROLES = new Set(['DUENO', 'ADMIN_OPERATIVO']);

/**
 * Oculta el costo de compra a roles que no son admin/dueño. El cajero necesita
 * el catálogo (basePrice) para vender, pero NO los costos/márgenes del negocio.
 */
function stripCostForRole(p: Product, role: string): Product {
  if (COST_ROLES.has(role)) return p;
  return { ...p, lastUnitCost: null, lastUnitCostDate: null };
}

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  async list(
    @CurrentUser() user: JwtAccessPayload,
    @Query('only_active') onlyActive?: string,
    @Query('category') category?: string,
  ): Promise<Product[]> {
    const products = await this.products.list({ onlyActive: onlyActive === 'true', category });
    return products.map((p) => stripCostForRole(p, user.role));
  }

  /**
   * Disponibilidad PÚBLICA (web del cliente): solo `available`. `stock` y
   * `reason` van en null — el stock exacto y los motivos ("Sin Pan…") son
   * inteligencia interna y NO se exponen a internet.
   */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get('availability')
  async availability(): Promise<ProductAvailability[]> {
    // §2.8: la variante cacheada (TTL corto) — endpoint público polleado por
    // anónimos; el cajero usa el interno, siempre fresco.
    const full = await this.products.getAvailabilityCached();
    return full.map((r) => ({
      productId: r.productId,
      available: r.available,
      stock: null,
      reason: null,
    }));
  }

  /** Disponibilidad INTERNA (cajero): incluye stock real y motivo. */
  @CashierAccess()
  @Get('availability/internal')
  availabilityInternal(): Promise<ProductAvailability[]> {
    return this.products.getAvailability();
  }

  /** Snapshot (grafo + stock) para calcular disponibilidad OFFLINE en el POS. */
  @CashierAccess()
  @Get('offline-snapshot')
  offlineSnapshot(): Promise<OfflineAvailabilitySnapshot> {
    return this.products.getOfflineSnapshot();
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Product> {
    return stripCostForRole(await this.products.getById(id), user.role);
  }

  /** Marca/desmarca agotado (86). Cajero o admin. */
  @CashierAccess()
  @Post(':id/sold-out')
  setSoldOut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetSoldOutSchema)) body: SetSoldOut,
  ): Promise<Product> {
    return this.products.setSoldOut(id, body.soldOut);
  }

  /**
   * Fuerza disponible (o revierte a automático). Cajero o admin. Permite
   * vender aunque el stock del sistema no alcance — para no frenar ventas
   * cuando el stock físico existe pero no se registró.
   */
  @CashierAccess()
  @Post(':id/force-available')
  setForceAvailable(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetForceAvailableSchema)) body: SetForceAvailable,
  ): Promise<Product> {
    return this.products.setForceAvailable(id, body.forceAvailable);
  }

  @OnlyDueno()
  @Post()
  @UsePipes(new ZodValidationPipe(CreateProductSchema))
  create(@Body() body: CreateProduct): Promise<Product> {
    return this.products.create(body);
  }

  @OnlyDueno()
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateProductSchema)) body: UpdateProduct,
  ): Promise<Product> {
    return this.products.update(id, body);
  }

  @OnlyDueno()
  @Put(':id/options')
  setOptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetProductOptionsSchema)) body: SetProductOptions,
  ): Promise<Product> {
    return this.products.setOptions(id, body);
  }

  @OnlyDueno()
  @Put(':id/combo')
  setCombo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetComboComponentsSchema)) body: SetComboComponents,
  ): Promise<Product> {
    return this.products.setCombo(id, body);
  }

  @OnlyDueno()
  @Post(':id/deactivate')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.products.deactivate(id);
  }

  /** Elimina DEFINITIVAMENTE — Dueño-only. */
  @OnlyDueno()
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.products.remove(id);
  }

  @OnlyDueno()
  @Post('upload-image')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ imageUrl: string; key: string }> {
    if (!file) {
      throw new BadRequestException('Falta el archivo en el campo "image".');
    }
    const detected = detectImageMimeLoose(file.buffer, file.mimetype, file.originalname);
    if (!detected) {
      throw new BadRequestException(
        'Formato no soportado. Usá PNG, JPG, WebP, GIF, BMP, TIFF, HEIC o AVIF (SVG no permitido).',
      );
    }
    return this.products.uploadImage({
      fileBuffer: file.buffer,
      mimeType: detected.mime,
      extension: detected.ext,
    });
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Get('images/:filename')
  async getImage(
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.products.getImage(filename);
    if (!data) {
      throw new NotFoundException('Imagen no encontrada.');
    }
    res.setHeader('Content-Type', data.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(data.buffer);
  }
}
