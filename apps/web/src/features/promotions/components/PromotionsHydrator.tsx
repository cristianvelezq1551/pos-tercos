'use client';

import type { PublicMenuPromotion } from '@pos-tercos/types';
import { useEffect } from 'react';
import { usePromotions } from '../store/promotions-store';

/** Vuelca las promos del menú (SSR) al store client-side. No renderiza nada. */
export function PromotionsHydrator({
  promotions,
}: {
  promotions: PublicMenuPromotion[];
}) {
  const setPromotions = usePromotions((s) => s.setPromotions);
  useEffect(() => {
    setPromotions(promotions);
  }, [promotions, setPromotions]);
  return null;
}
