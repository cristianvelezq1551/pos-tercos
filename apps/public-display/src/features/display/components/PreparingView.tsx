import type { PublicDisplayState } from '@pos-tercos/types';
import {
  FAST_FOOD_CAPTIONS,
  HeroCarousel,
  type HeroCarouselImage,
} from '@pos-tercos/brand';
import { BROLL_IMAGES } from '../lib/broll';
import { NextRail } from './NextRail';

const HERO_INTERVAL_MS = 5500;

function buildPool(next: PublicDisplayState['next']): HeroCarouselImage[] {
  const seen = new Set<string>();
  const pool: HeroCarouselImage[] = [];

  for (const order of next) {
    for (const item of order.items) {
      if (!item.imageUrl || seen.has(item.imageUrl)) continue;
      seen.add(item.imageUrl);
      pool.push({ url: item.imageUrl, alt: item.productName });
    }
  }
  for (const broll of BROLL_IMAGES) {
    if (seen.has(broll.url)) continue;
    seen.add(broll.url);
    pool.push(broll);
  }
  return pool;
}

export function PreparingView({
  next,
}: {
  next: PublicDisplayState['next'];
}) {
  const pool = buildPool(next);
  const hasOrderImages = pool.some(
    (img) => !BROLL_IMAGES.some((b) => b.url === img.url),
  );

  // Si hay imágenes reales de la cola, mezclamos sus nombres con el copy
  // genérico para que el cliente reconozca lo que está pidiendo.
  const captions = hasOrderImages
    ? [...FAST_FOOD_CAPTIONS, ...pool.map((p) => p.alt)]
    : FAST_FOOD_CAPTIONS;

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="relative flex-1 overflow-hidden rounded-[2rem] border border-border shadow-2xl">
        <HeroCarousel
          images={pool}
          captions={captions}
          intervalMs={HERO_INTERVAL_MS}
          textPosition="bottom"
        />
        <div className="pointer-events-none absolute left-0 right-0 top-8 flex justify-center">
          <span
            className="caps font-display text-2xl font-extrabold tracking-[0.5em] text-foreground rounded-full border border-border bg-card/70 px-8 py-3 shadow-md"
            style={{ backdropFilter: 'blur(10px)' }}
          >
            Preparando tu pedido
          </span>
        </div>
      </div>
      <NextRail next={next} />
    </div>
  );
}
