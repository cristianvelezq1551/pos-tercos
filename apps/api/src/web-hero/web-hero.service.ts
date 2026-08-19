import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateWebHeroSlide,
  HeroMediaType,
  UpdateWebHeroSlide,
  WebHeroSlide,
  WebStorefrontConfig,
} from '@pos-tercos/types';
import type { StorageProvider } from '@pos-tercos/domain';
import type { WebHeroSlide as DbSlide } from '@prisma/client';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { BusinessConfigService } from '../business-config/business-config.service';
import { PrismaService } from '../prisma/prisma.service';

const MEDIA_PREFIX = 'web-hero/media';

/** Medio ya validado por magic bytes en el controller (imagen o video). */
export interface HeroMediaUpload {
  buffer: Buffer;
  mime: string;
  type: HeroMediaType;
}

const MEDIA_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

// Caché en memoria del medio servido al storefront. Un <video> dispara MUCHOS
// requests de range (Safari ~uno por seek); sin caché cada uno releería el
// objeto COMPLETO de R2/disco → amplificador de DoS de memoria/ancho de banda.
// El hero son pocas piezas; cacheamos con TTL + tope de bytes total (evict del
// más viejo) para acotar la RAM. La invalidación en replace/remove evita servir
// medios viejos.
const MEDIA_CACHE_TTL_MS = 5 * 60_000;
const MEDIA_CACHE_MAX_BYTES = 120 * 1024 * 1024; // 120 MB techo del caché

@Injectable()
export class WebHeroService {
  private readonly mediaCache = new Map<
    string,
    { buffer: Buffer; mime: string; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly businessConfig: BusinessConfigService,
  ) {}

  /**
   * TODA la config del storefront en una respuesta: publicidad activa +
   * contacto, horarios, redes y "Nosotros" (decisión del dueño 2026-07-16 — un
   * solo fetch, todo editable desde el admin).
   */
  async getPublicConfig(): Promise<WebStorefrontConfig> {
    const [slides, business] = await Promise.all([
      this.prisma.webHeroSlide.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.businessConfig.getPublicInfo(),
    ]);
    return {
      slides: slides.map((s) => this.toDto(s)),
      business,
      asOf: new Date().toISOString(),
    };
  }

  async list(): Promise<WebHeroSlide[]> {
    const rows = await this.prisma.webHeroSlide.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((s) => this.toDto(s));
  }

  async create(
    body: CreateWebHeroSlide,
    media: HeroMediaUpload,
  ): Promise<WebHeroSlide> {
    const ext = this.mediaExt(media.mime);
    const stored = await this.storage.put(MEDIA_PREFIX, media.buffer, media.mime, ext);
    const max = await this.prisma.webHeroSlide.aggregate({ _max: { sortOrder: true } });
    const row = await this.prisma.webHeroSlide.create({
      data: {
        mediaType: media.type,
        mediaKey: stored.key,
        mediaMime: media.mime,
        linkUrl: body.linkUrl ?? null,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
    return this.toDto(row);
  }

  async update(id: string, body: UpdateWebHeroSlide): Promise<WebHeroSlide> {
    await this.getOrThrow(id);
    const row = await this.prisma.webHeroSlide.update({ where: { id }, data: body });
    return this.toDto(row);
  }

  async replaceMedia(id: string, media: HeroMediaUpload): Promise<WebHeroSlide> {
    const existing = await this.getOrThrow(id);
    const ext = this.mediaExt(media.mime);
    const stored = await this.storage.put(MEDIA_PREFIX, media.buffer, media.mime, ext);
    const row = await this.prisma.webHeroSlide.update({
      where: { id },
      data: { mediaType: media.type, mediaKey: stored.key, mediaMime: media.mime },
    });
    // El medio viejo queda huérfano — borrado best-effort (no bloquea).
    void this.storage.delete(existing.mediaKey).catch(() => undefined);
    this.mediaCache.delete(id); // no servir el medio viejo desde caché
    return this.toDto(row);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.getOrThrow(id);
    await this.prisma.webHeroSlide.delete({ where: { id } });
    void this.storage.delete(existing.mediaKey).catch(() => undefined);
    this.mediaCache.delete(id);
  }

  async reorder(ids: string[]): Promise<WebHeroSlide[]> {
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.webHeroSlide.update({ where: { id }, data: { sortOrder: i } }),
      ),
    );
    return this.list();
  }

  async getMedia(id: string): Promise<{ buffer: Buffer; mime: string }> {
    const cached = this.mediaCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return { buffer: cached.buffer, mime: cached.mime };
    }
    const row = await this.getOrThrow(id);
    const buffer = await this.storage.get(row.mediaKey);
    this.cacheMedia(id, buffer, row.mediaMime);
    return { buffer, mime: row.mediaMime };
  }

  /** Guarda en caché acotando el total de bytes (evict del más viejo). */
  private cacheMedia(id: string, buffer: Buffer, mime: string): void {
    this.mediaCache.delete(id);
    let total = buffer.length;
    for (const v of this.mediaCache.values()) total += v.buffer.length;
    // Evict (insertion order = más viejo primero) hasta caber bajo el techo.
    for (const key of this.mediaCache.keys()) {
      if (total <= MEDIA_CACHE_MAX_BYTES) break;
      const evicted = this.mediaCache.get(key)!;
      total -= evicted.buffer.length;
      this.mediaCache.delete(key);
    }
    // Una sola pieza más grande que el techo no se cachea (no tiene sentido).
    if (buffer.length <= MEDIA_CACHE_MAX_BYTES) {
      this.mediaCache.set(id, { buffer, mime, expiresAt: Date.now() + MEDIA_CACHE_TTL_MS });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────
  private mediaExt(mime: string): string {
    const ext = MEDIA_MIME_EXT[mime];
    if (!ext) {
      throw new BadRequestException('Formato no soportado (imagen JPG/PNG/WebP o video MP4/WebM).');
    }
    return ext;
  }

  private async getOrThrow(id: string): Promise<DbSlide> {
    const row = await this.prisma.webHeroSlide.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Pieza de publicidad no encontrada.');
    return row;
  }

  private toDto(s: DbSlide): WebHeroSlide {
    return {
      id: s.id,
      mediaType: s.mediaType,
      mediaUrl: `/api/web-hero/media/${s.id}`,
      linkUrl: s.linkUrl,
      sortOrder: s.sortOrder,
      isActive: s.isActive,
    };
  }
}
