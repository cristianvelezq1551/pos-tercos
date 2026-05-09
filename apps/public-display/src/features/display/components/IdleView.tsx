import {
  BrandLogo,
  BrandTaglineCycler,
  FAST_FOOD_CAPTIONS,
  HeroCarousel,
} from '@pos-tercos/brand';
import { BROLL_IMAGES } from '../lib/broll';

const HERO_INTERVAL_MS = 6500;

export function IdleView() {
  return (
    <section className="relative flex flex-1 items-center justify-center overflow-hidden rounded-[2.5rem]">
      <HeroCarousel
        images={BROLL_IMAGES}
        captions={FAST_FOOD_CAPTIONS}
        intervalMs={HERO_INTERVAL_MS}
        blur
        hideCaption
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(19,24,34,0.55) 0%, rgba(19,24,34,0.92) 75%, #131822 100%)',
        }}
        aria-hidden="true"
      />
      <div
        className="relative z-10 flex flex-col items-center gap-12"
        style={{ animation: 'fade-rise 1200ms var(--ease-out-quad) backwards' }}
      >
        <BrandLogo
          variant="full"
          theme="dark"
          size="h-48 md:h-56"
          className="drop-shadow-2xl"
        />
        <BrandTaglineCycler
          intervalMs={6500}
          className="text-3xl font-extrabold md:text-4xl"
        />
      </div>
    </section>
  );
}
