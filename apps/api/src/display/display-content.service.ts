import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateDisplaySlide,
  DisplayBrollConfig,
  DisplaySlide,
  DisplayTrack,
  UpdateDisplaySlide,
  UpdateDisplayTrack,
} from '@pos-tercos/types';
import type { StorageProvider } from '@pos-tercos/domain';
import type { DisplaySlide as DbSlide, DisplayTrack as DbTrack } from '@prisma/client';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { PrismaService } from '../prisma/prisma.service';

const SLIDE_PREFIX = 'display/slides';
const TRACK_PREFIX = 'display/tracks';

const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const AUDIO_MIME_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

/** Menú por defecto — el B-roll real curado, importable con un click. */
const DEFAULT_SLIDES: Array<{
  file: string;
  name: string;
  tag: string;
  price: string;
  description: string;
}> = [
  { file: '12.jpg', name: 'Doble Smash', tag: 'Burgers', price: '$29K', description: 'Doble carne smash 80gr, queso cheddar, pan brioche, cebolla caramelizada, pepinillos, tocineta, salsa americana y BBQ.' },
  { file: '03.jpg', name: 'Mac & Papas Smash', tag: 'Mac & Papas', price: '$32K', description: 'Doble carne smash 80gr, macarrones con queso, papas fritas, salsa americana, ranch y queso cheddar.' },
  { file: '02.jpg', name: 'Triple Smash', tag: 'Burgers', price: '$40K', description: 'Triple carne smash 80gr, queso cheddar, pan brioche, cebolla caramelizada, pepinillos, tocineta, salsa americana y BBQ.' },
  { file: '05.jpg', name: 'Burro Smash', tag: 'Burros', price: '$28K', description: 'Doble carne smash 80gr, papas fritas, pepinillos, tocineta, salsa ranch, americana, queso cheddar y salsa barbacoa.' },
  { file: '04.jpg', name: 'Tenders Terco', tag: 'Tenders', price: '$25K', description: 'Tenders de pollo crispy con miel ahumada, papas fritas, salsa ranch y salsa americana.' },
  { file: '13.jpg', name: 'Doble Smash', tag: 'Burgers', price: '$29K', description: 'Doble carne smash 80gr, queso cheddar, pan brioche, cebolla caramelizada, pepinillos, tocineta, salsa americana y BBQ.' },
  { file: '10.jpg', name: 'Mac & Cheese Mixto', tag: 'Mac & Cheese', price: '$32K', description: 'Macarrones con queso, salsa americana, ranch, pepinillos, tocineta, pollo crispy con miel ahumada y carne smash 80gr.' },
  { file: '08.jpg', name: 'Sándwich Pollo', tag: 'Sándwich', price: '$27K', description: 'Pechuga de pollo crispy en miel ahumada, coleslaw, pan brioche y pepinillos.' },
  { file: '06.jpg', name: 'Triple Smash', tag: 'Burgers', price: '$40K', description: 'Triple carne smash 80gr, queso cheddar, pan brioche, cebolla caramelizada, pepinillos, tocineta, salsa americana y BBQ.' },
  { file: '07.jpg', name: 'Mac & Cheese Pollo', tag: 'Mac & Cheese', price: '$27K', description: 'Macarrones con queso, salsa americana, ranch, pepinillos, tocineta y pollo crispy con miel ahumada.' },
];

@Injectable()
export class DisplayContentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  // ── Config pública del turnero ─────────────────────────────────────
  async getPublicConfig(): Promise<DisplayBrollConfig> {
    const [slides, tracks] = await Promise.all([
      this.prisma.displaySlide.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.displayTrack.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    return {
      slides: slides.map((s) => this.toSlideDto(s)),
      tracks: tracks.map((t) => this.toTrackDto(t)),
      asOf: new Date().toISOString(),
    };
  }

  // ── Slides (admin) ─────────────────────────────────────────────────
  async listSlides(): Promise<DisplaySlide[]> {
    const rows = await this.prisma.displaySlide.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((s) => this.toSlideDto(s));
  }

  async createSlide(
    body: CreateDisplaySlide,
    image: { buffer: Buffer; mime: string },
  ): Promise<DisplaySlide> {
    const ext = this.imageExt(image.mime);
    const stored = await this.storage.put(SLIDE_PREFIX, image.buffer, image.mime, ext);
    const max = await this.prisma.displaySlide.aggregate({ _max: { sortOrder: true } });
    const row = await this.prisma.displaySlide.create({
      data: {
        name: body.name,
        tag: body.tag,
        price: body.price,
        description: body.description,
        imageKey: stored.key,
        imageMime: image.mime,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
    return this.toSlideDto(row);
  }

  async updateSlide(id: string, body: UpdateDisplaySlide): Promise<DisplaySlide> {
    await this.getSlideOrThrow(id);
    const row = await this.prisma.displaySlide.update({ where: { id }, data: body });
    return this.toSlideDto(row);
  }

  async replaceSlideImage(
    id: string,
    image: { buffer: Buffer; mime: string },
  ): Promise<DisplaySlide> {
    const existing = await this.getSlideOrThrow(id);
    const ext = this.imageExt(image.mime);
    const stored = await this.storage.put(SLIDE_PREFIX, image.buffer, image.mime, ext);
    const row = await this.prisma.displaySlide.update({
      where: { id },
      data: { imageKey: stored.key, imageMime: image.mime },
    });
    // La imagen vieja queda huérfana — borrado best-effort (no bloquea).
    void this.storage.delete(existing.imageKey).catch(() => undefined);
    return this.toSlideDto(row);
  }

  async deleteSlide(id: string): Promise<void> {
    const existing = await this.getSlideOrThrow(id);
    await this.prisma.displaySlide.delete({ where: { id } });
    void this.storage.delete(existing.imageKey).catch(() => undefined);
  }

  async reorderSlides(ids: string[]): Promise<DisplaySlide[]> {
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.displaySlide.update({ where: { id }, data: { sortOrder: i } }),
      ),
    );
    return this.listSlides();
  }

  async getSlideImage(id: string): Promise<{ buffer: Buffer; mime: string }> {
    const row = await this.getSlideOrThrow(id);
    const buffer = await this.storage.get(row.imageKey);
    return { buffer, mime: row.imageMime };
  }

  // ── Tracks (admin) ─────────────────────────────────────────────────
  async listTracks(): Promise<DisplayTrack[]> {
    const rows = await this.prisma.displayTrack.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((t) => this.toTrackDto(t));
  }

  async createTrack(
    label: string,
    audio: { buffer: Buffer; mime: string },
  ): Promise<DisplayTrack> {
    const ext = this.audioExt(audio.mime);
    const stored = await this.storage.put(TRACK_PREFIX, audio.buffer, audio.mime, ext);
    const max = await this.prisma.displayTrack.aggregate({ _max: { sortOrder: true } });
    const row = await this.prisma.displayTrack.create({
      data: {
        label: label.trim().slice(0, 80) || 'Pista',
        audioKey: stored.key,
        audioMime: audio.mime,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
    return this.toTrackDto(row);
  }

  async updateTrack(id: string, body: UpdateDisplayTrack): Promise<DisplayTrack> {
    await this.getTrackOrThrow(id);
    const row = await this.prisma.displayTrack.update({ where: { id }, data: body });
    return this.toTrackDto(row);
  }

  async deleteTrack(id: string): Promise<void> {
    const existing = await this.getTrackOrThrow(id);
    await this.prisma.displayTrack.delete({ where: { id } });
    void this.storage.delete(existing.audioKey).catch(() => undefined);
  }

  async reorderTracks(ids: string[]): Promise<DisplayTrack[]> {
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.displayTrack.update({ where: { id }, data: { sortOrder: i } }),
      ),
    );
    return this.listTracks();
  }

  async getTrackAudio(id: string): Promise<{ buffer: Buffer; mime: string }> {
    const row = await this.getTrackOrThrow(id);
    const buffer = await this.storage.get(row.audioKey);
    return { buffer, mime: row.audioMime };
  }

  // ── Importar el B-roll por defecto (un click, idempotente) ─────────
  async importDefaults(): Promise<{ imported: number; skipped: boolean }> {
    const count = await this.prisma.displaySlide.count();
    if (count > 0) return { imported: 0, skipped: true };

    let order = 1;
    for (const def of DEFAULT_SLIDES) {
      const path = join(process.cwd(), 'assets', 'display', def.file);
      const buffer = await readFile(path);
      const stored = await this.storage.put(SLIDE_PREFIX, buffer, 'image/jpeg', 'jpg');
      await this.prisma.displaySlide.create({
        data: {
          name: def.name,
          tag: def.tag,
          price: def.price,
          description: def.description,
          imageKey: stored.key,
          imageMime: 'image/jpeg',
          sortOrder: order++,
        },
      });
    }
    return { imported: DEFAULT_SLIDES.length, skipped: false };
  }

  // ── Helpers ────────────────────────────────────────────────────────
  private imageExt(mime: string): string {
    const ext = IMAGE_MIME_EXT[mime];
    if (!ext) throw new BadRequestException('Formato de imagen no soportado (usá JPG, PNG o WebP).');
    return ext;
  }

  private audioExt(mime: string): string {
    const ext = AUDIO_MIME_EXT[mime];
    if (!ext) throw new BadRequestException('Formato de audio no soportado (usá MP3, M4A, OGG o WAV).');
    return ext;
  }

  private async getSlideOrThrow(id: string): Promise<DbSlide> {
    const row = await this.prisma.displaySlide.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Slide no encontrado.');
    return row;
  }

  private async getTrackOrThrow(id: string): Promise<DbTrack> {
    const row = await this.prisma.displayTrack.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Pista no encontrada.');
    return row;
  }

  private toSlideDto(s: DbSlide): DisplaySlide {
    return {
      id: s.id,
      name: s.name,
      tag: s.tag,
      price: s.price,
      description: s.description,
      // `v` cambia con cada reemplazo de imagen (la key es nueva) — sin esto el
      // browser sigue mostrando la foto vieja cacheada bajo la misma URL.
      imageUrl: `/api/display/slide-image/${s.id}?v=${this.assetVersion(s.imageKey)}`,
      sortOrder: s.sortOrder,
      isActive: s.isActive,
    };
  }

  /** Fingerprint URL-safe del asset (el nombre de archivo de la key en storage). */
  private assetVersion(key: string): string {
    const file = key.split('/').pop() ?? key;
    return encodeURIComponent(file.replace(/\.[a-z0-9]+$/i, ''));
  }

  private toTrackDto(t: DbTrack): DisplayTrack {
    return {
      id: t.id,
      label: t.label,
      audioUrl: `/api/display/track-audio/${t.id}`,
      sortOrder: t.sortOrder,
      isActive: t.isActive,
    };
  }
}
