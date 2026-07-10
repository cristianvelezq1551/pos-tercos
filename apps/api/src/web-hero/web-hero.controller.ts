import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Express, Request, Response } from 'express';
import {
  CreateWebHeroSlideSchema,
  ReorderSchema,
  UpdateWebHeroSlideSchema,
  type CreateWebHeroSlide,
  type Reorder,
  type UpdateWebHeroSlide,
  type WebHeroConfig,
  type WebHeroSlide,
} from '@pos-tercos/types';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { detectImageMime, detectVideoMime } from '../common/image-mime';
import { sendBufferWithRangeSupport } from '../common/http-range';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WebHeroService, type HeroMediaUpload } from './web-hero.service';

// Sube el cap a 50 MB para permitir un video corto de hero (imágenes pesan mucho
// menos). El video debería ser breve y optimizado para web; el editor lo avisa.
const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50 MB

@Controller('web-hero')
export class WebHeroController {
  constructor(private readonly hero: WebHeroService) {}

  // ── Público: lo que consume el storefront ─────────────────────────
  /** 60 reqs / 60s por IP (igual que /web/menu). */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get('config')
  config(): Promise<WebHeroConfig> {
    return this.hero.getPublicConfig();
  }

  // Límite holgado: un <video> dispara varios range requests por reproducción
  // (seeking). Suficiente para no romper la UX y acotar el martilleo abusivo;
  // el caché en memoria del service ya absorbe los re-reads del storage.
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 240 } })
  @Get('media/:id')
  async media(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mime } = await this.hero.getMedia(id);
    // Range: necesario para que el <video> haga seeking y autoplay (Safari exige 206).
    sendBufferWithRangeSupport(req, res, buffer, {
      mime,
      cacheControl: 'public, max-age=86400',
    });
  }

  // ── Admin: piezas ─────────────────────────────────────────────────
  @AdminAccess()
  @Get('slides')
  list(): Promise<WebHeroSlide[]> {
    return this.hero.list();
  }

  @AdminAccess()
  @Post('slides')
  @UseInterceptors(FileInterceptor('media', { limits: { fileSize: MAX_MEDIA_BYTES } }))
  create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(CreateWebHeroSlideSchema)) body: CreateWebHeroSlide,
  ): Promise<WebHeroSlide> {
    return this.hero.create(body, this.requireMedia(file));
  }

  @AdminAccess()
  @Patch('slides/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateWebHeroSlideSchema)) body: UpdateWebHeroSlide,
  ): Promise<WebHeroSlide> {
    return this.hero.update(id, body);
  }

  @AdminAccess()
  @Post('slides/:id/media')
  @UseInterceptors(FileInterceptor('media', { limits: { fileSize: MAX_MEDIA_BYTES } }))
  replaceMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<WebHeroSlide> {
    return this.hero.replaceMedia(id, this.requireMedia(file));
  }

  @AdminAccess()
  @Delete('slides/:id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.hero.remove(id);
  }

  @AdminAccess()
  @Post('slides/reorder')
  reorder(
    @Body(new ZodValidationPipe(ReorderSchema)) body: Reorder,
  ): Promise<WebHeroSlide[]> {
    return this.hero.reorder(body.ids);
  }

  // ── Helpers ───────────────────────────────────────────────────────
  /** Valida el medio por magic bytes (no se confía en el header del cliente). */
  private requireMedia(file: Express.Multer.File | undefined): HeroMediaUpload {
    if (!file) throw new BadRequestException('Falta el archivo.');
    const image = detectImageMime(file.buffer);
    if (image) return { buffer: file.buffer, mime: image, type: 'IMAGE' };
    const video = detectVideoMime(file.buffer);
    if (video) return { buffer: file.buffer, mime: video, type: 'VIDEO' };
    throw new BadRequestException('Debe ser una imagen (JPG, PNG, WebP) o un video (MP4, WebM).');
  }
}
