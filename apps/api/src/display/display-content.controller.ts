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
  CreateDisplaySlideSchema,
  ReorderSchema,
  UpdateDisplaySlideSchema,
  UpdateDisplayTrackSchema,
  type CreateDisplaySlide,
  type DisplayBrollConfig,
  type DisplaySlide,
  type DisplayTrack,
  type Reorder,
  type UpdateDisplaySlide,
  type UpdateDisplayTrack,
} from '@pos-tercos/types';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { AllowUploadTicket } from '../auth/decorators/upload-ticket.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { detectImageMime } from '../common/image-mime';
import { sendBufferWithRangeSupport } from '../common/http-range';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DisplayContentService } from './display-content.service';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB

@Controller('display')
export class DisplayContentController {
  constructor(private readonly content: DisplayContentService) {}

  // ── Público: lo que consume el turnero ────────────────────────────
  @Public()
  @Get('broll')
  broll(): Promise<DisplayBrollConfig> {
    return this.content.getPublicConfig();
  }

  @Public()
  @Get('slide-image/:id')
  async slideImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mime } = await this.content.getSlideImage(id);
    res.setHeader('Content-Type', mime);
    // La URL lleva `?v=` que cambia con cada reemplazo → cacheable fuerte.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  }

  // Límite holgado: el seeking del <audio> dispara varios range requests.
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 240 } })
  @Get('track-audio/:id')
  async trackAudio(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mime } = await this.content.getTrackAudio(id);
    sendBufferWithRangeSupport(req, res, buffer, {
      mime,
      cacheControl: 'public, max-age=86400',
    });
  }

  // ── Admin: slides ─────────────────────────────────────────────────
  @AdminAccess()
  @Get('slides')
  listSlides(): Promise<DisplaySlide[]> {
    return this.content.listSlides();
  }

  @AdminAccess()
  @Post('slides')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  createSlide(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(CreateDisplaySlideSchema)) body: CreateDisplaySlide,
  ): Promise<DisplaySlide> {
    const image = this.requireImage(file);
    return this.content.createSlide(body, image);
  }

  @AdminAccess()
  @Patch('slides/:id')
  updateSlide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateDisplaySlideSchema)) body: UpdateDisplaySlide,
  ): Promise<DisplaySlide> {
    return this.content.updateSlide(id, body);
  }

  @AdminAccess()
  @Post('slides/:id/image')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  replaceSlideImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<DisplaySlide> {
    const image = this.requireImage(file);
    return this.content.replaceSlideImage(id, image);
  }

  @AdminAccess()
  @Delete('slides/:id')
  deleteSlide(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.content.deleteSlide(id);
  }

  @AdminAccess()
  @Post('slides/reorder')
  reorderSlides(
    @Body(new ZodValidationPipe(ReorderSchema)) body: Reorder,
  ): Promise<DisplaySlide[]> {
    return this.content.reorderSlides(body.ids);
  }

  @AdminAccess()
  @Post('import-defaults')
  importDefaults(): Promise<{ imported: number; skipped: boolean }> {
    return this.content.importDefaults();
  }

  // ── Admin: tracks ─────────────────────────────────────────────────
  @AdminAccess()
  @Get('tracks')
  listTracks(): Promise<DisplayTrack[]> {
    return this.content.listTracks();
  }

  @AdminAccess()
  @AllowUploadTicket()
  @Post('tracks')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES } }))
  createTrack(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('label') label: string | undefined,
  ): Promise<DisplayTrack> {
    if (!file) throw new BadRequestException('Falta el archivo de audio.');
    return this.content.createTrack(label ?? file.originalname, {
      buffer: file.buffer,
      mime: file.mimetype,
    });
  }

  @AdminAccess()
  @Patch('tracks/:id')
  updateTrack(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateDisplayTrackSchema)) body: UpdateDisplayTrack,
  ): Promise<DisplayTrack> {
    return this.content.updateTrack(id, body);
  }

  @AdminAccess()
  @Delete('tracks/:id')
  deleteTrack(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.content.deleteTrack(id);
  }

  @AdminAccess()
  @Post('tracks/reorder')
  reorderTracks(
    @Body(new ZodValidationPipe(ReorderSchema)) body: Reorder,
  ): Promise<DisplayTrack[]> {
    return this.content.reorderTracks(body.ids);
  }

  // ── Helpers ───────────────────────────────────────────────────────
  /** Valida la imagen por magic bytes (no se confía en el header del cliente). */
  private requireImage(
    file: Express.Multer.File | undefined,
  ): { buffer: Buffer; mime: string } {
    if (!file) throw new BadRequestException('Falta la imagen.');
    const mime = detectImageMime(file.buffer);
    if (!mime) {
      throw new BadRequestException('La imagen debe ser JPG, PNG, WebP o GIF.');
    }
    return { buffer: file.buffer, mime };
  }
}
