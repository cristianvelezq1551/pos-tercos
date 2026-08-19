'use client';

import { EMPTY_PUBLIC_BUSINESS_INFO, type PublicBusinessInfo } from '@pos-tercos/types';
import { create } from 'zustand';

interface BusinessState {
  business: PublicBusinessInfo;
  setBusiness: (business: PublicBusinessInfo) => void;
}

/**
 * Datos del negocio (contacto, horarios, redes, "Nosotros"), hidratados desde el
 * SSR de cada página vía `BusinessHydrator`. En memoria, como las promos: los
 * componentes cliente (footer, tab bar, botón de cómo llegar) los necesitan y
 * no pueden hacer fetch por su cuenta.
 */
export const useBusiness = create<BusinessState>((set) => ({
  business: EMPTY_PUBLIC_BUSINESS_INFO,
  setBusiness: (business) => set({ business }),
}));
