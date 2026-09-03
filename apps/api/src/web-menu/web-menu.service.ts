import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PublicMenuProduct, PublicMenuResponse } from '@pos-tercos/types';
import { BusinessConfigService } from '../business-config/business-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductCategoriesService } from '../product-categories/product-categories.service';
import { PromotionsService } from '../promotions/promotions.service';

@Injectable()
export class WebMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessConfig: BusinessConfigService,
    private readonly categories: ProductCategoriesService,
    private readonly promotions: PromotionsService,
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
    const [allRows, hiddenCategories, orden] = await Promise.all([
      this.prisma.product.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        include: {
          sizes: { orderBy: { sortOrder: 'asc' } },
          modifiers: { orderBy: { name: 'asc' } },
        },
      }),
      // Una categoría desactivada oculta sus productos del menú público
      // (misma regla que el catálogo de la caja).
      this.categories.inactiveNames(),
      this.categories.orderIndex(),
    ]);
    const rows = allRows.filter((p) => !p.category || !hiddenCategories.has(p.category));
    // El orden de la carta es el que el dueño arma en `/categories`, igual que
    // en la caja. Por nombre, "Bebidas" abría el menú y los platos quedaban
    // abajo: es la primera pantalla que ve un cliente.
    const puesto = (c: string | null) =>
      c ? (orden.get(c) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    rows.sort((a, b) => puesto(a.category) - puesto(b.category) || a.name.localeCompare(b.name, 'es'));
    const products = rows.map(toPublicMenuProduct);

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
      // Promos activas del canal web (definiciones): la web calcula el precio
      // con descuento client-side con el motor de domain (igual que el POS).
      promotions: await this.promotions.loadPublicActive(new Date()),
      // #13 kill-switch: la web oculta el checkout cuando está apagado (el
      // create igual lo rechaza fresco; esto puede tardar el TTL del caché).
      webOrdersEnabled: await this.businessConfig.isWebOrdersEnabled(),
      asOf: new Date().toISOString(),
    };
  }
}

type MenuRow = Prisma.ProductGetPayload<{ include: { sizes: true; modifiers: true } }>;

function toPublicMenuProduct(p: MenuRow): PublicMenuProduct {
  return {
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
  };
}
