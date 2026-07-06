import { Injectable } from '@nestjs/common';
import type { PublicMenuProduct, PublicMenuResponse } from '@pos-tercos/types';
import { BusinessConfigService } from '../business-config/business-config.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessConfig: BusinessConfigService,
  ) {}

  /**
   * Caché con TTL: el menú público lo pega internet en cada visita y cambia muy
   * rara vez. Tolera ≤ TTL de staleness. Memoiza la PROMESA → deduplica ráfagas
   * concurrentes. No toca costeo (subset SAFE sin costos).
   */
  private static readonly MENU_TTL_MS = 30_000;
  private cache: { promise: Promise<PublicMenuResponse>; at: number } | null = null;

  async list(): Promise<PublicMenuResponse> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < WebMenuService.MENU_TTL_MS) {
      return this.cache.promise;
    }
    const promise = this.loadMenu();
    this.cache = { promise, at: now };
    void promise.catch(() => {
      if (this.cache?.promise === promise) this.cache = null;
    });
    return promise;
  }

  private async loadMenu(): Promise<PublicMenuResponse> {
    const rows = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        sizes: { orderBy: { sortOrder: 'asc' } },
        modifiers: { orderBy: { name: 'asc' } },
      },
    });

    const products: PublicMenuProduct[] = rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      basePrice: Number(p.basePrice),
      category: p.category,
      imageUrl: p.imageUrl,
      modifiersEnabled: p.modifiersEnabled,
      isCombo: p.isCombo,
      comboPrice: p.comboPrice !== null ? Number(p.comboPrice) : null,
      sizes: p.sizes.map((s) => ({
        id: s.id,
        productId: s.productId,
        name: s.name,
        priceModifier: Number(s.priceModifier),
        sortOrder: s.sortOrder,
      })),
      modifiers: p.modifiers.map((m) => ({
        id: m.id,
        productId: m.productId,
        name: m.name,
        priceDelta: Number(m.priceDelta),
      })),
    }));

    const seen = new Set<string>();
    const categories: string[] = [];
    for (const p of products) {
      if (p.category && !seen.has(p.category)) {
        seen.add(p.category);
        categories.push(p.category);
      }
    }

    return {
      products,
      categories,
      // #13 kill-switch: la web oculta el checkout cuando está apagado (el
      // create igual lo rechaza fresco; esto puede tardar el TTL del caché).
      webOrdersEnabled: await this.businessConfig.isWebOrdersEnabled(),
      asOf: new Date().toISOString(),
    };
  }
}
