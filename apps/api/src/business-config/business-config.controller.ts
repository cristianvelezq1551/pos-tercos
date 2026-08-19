import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import {
  UpdateBusinessConfigSchema,
  type BusinessConfig,
  type JwtAccessPayload,
  type UpdateBusinessConfig,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
import { detectImageMime } from '../common/image-mime';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BusinessConfigService } from './business-config.service';

const MAX_ABOUT_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

@Controller('business-config')
export class BusinessConfigController {
  constructor(private readonly config: BusinessConfigService) {}

  @Get()
  @AdminAccess()
  get(): Promise<BusinessConfig> {
    return this.config.get();
  }

  @Patch()
  @OnlyDueno()
  update(
    @Body(new ZodValidationPipe(UpdateBusinessConfigSchema)) body: UpdateBusinessConfig,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<BusinessConfig> {
    return this.config.update(body, actor.sub);
  }

  /** Foto de la sección "Nosotros" de la web. Los bytes salen por /web-hero/about-image. */
  @Post('about-image')
  @OnlyDueno()
  @UseInterceptors(FileInterceptor('media', { limits: { fileSize: MAX_ABOUT_IMAGE_BYTES } }))
  setAboutImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<BusinessConfig> {
    if (!file) throw new BadRequestException('Falta el archivo.');
    // Magic bytes, nunca el mime declarado por el cliente (§4.6).
    const mime = detectImageMime(file.buffer);
    if (!mime) throw new BadRequestException('Debe ser una imagen (JPG, PNG, WebP).');
    return this.config.setAboutImage(file.buffer, mime, IMAGE_EXT[mime] ?? 'jpg', actor.sub);
  }
}
