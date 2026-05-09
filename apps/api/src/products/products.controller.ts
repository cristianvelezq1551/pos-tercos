import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
  CreateProductSchema,
  UpdateProductSchema,
  type CreateProduct,
  type Product,
  type UpdateProduct,
} from '@pos-tercos/types';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { detectImageMimeLoose } from '../common/image-mime';
import { ProductsService } from './products.service';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @Query('only_active') onlyActive?: string,
    @Query('category') category?: string,
  ): Promise<Product[]> {
    return this.products.list({ onlyActive: onlyActive === 'true', category });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.products.getById(id);
  }

  @AdminAccess()
  @Post()
  @UsePipes(new ZodValidationPipe(CreateProductSchema))
  create(@Body() body: CreateProduct): Promise<Product> {
    return this.products.create(body);
  }

  @AdminAccess()
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateProductSchema)) body: UpdateProduct,
  ): Promise<Product> {
    return this.products.update(id, body);
  }

  @AdminAccess()
  @Delete(':id')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.products.deactivate(id);
  }

  @AdminAccess()
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
