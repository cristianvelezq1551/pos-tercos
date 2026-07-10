'use client';

import type { PublicMenuPromotion } from '@pos-tercos/types';
import { create } from 'zustand';

interface PromotionsState {
  promotions: PublicMenuPromotion[];
  setPromotions: (promotions: PublicMenuPromotion[]) => void;
}

/**
 * Promos activas del canal web, hidratadas desde el SSR del menú
 * (`PromotionsHydrator`). En memoria (no persist): sobreviven a la navegación
 * client-side, se refrescan en cada visita al menú o al checkout.
 */
export const usePromotions = create<PromotionsState>((set) => ({
  promotions: [],
  setPromotions: (promotions) => set({ promotions }),
}));
