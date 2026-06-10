import { Injectable } from '@nestjs/common';
import { ModifierRecipeDeltaSchema } from '@pos-tercos/types';
import type { PublicMenuProduct, PublicMenuResponse } from '@pos-tercos/types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebMenuService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PublicMenuResponse> {
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
        recipeDelta: ModifierRecipeDeltaSchema.catch([]).parse(m.recipeDelta),
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
      asOf: new Date().toISOString(),
    };
  }
}
