'use client';

import type { PublicBusinessInfo } from '@pos-tercos/types';
import { useEffect } from 'react';
import { useBusiness } from '../store/business-store';

/** Vuelca los datos del negocio (SSR) al store client-side. No renderiza nada. */
export function BusinessHydrator({ business }: { business: PublicBusinessInfo }) {
  const setBusiness = useBusiness((s) => s.setBusiness);
  useEffect(() => {
    setBusiness(business);
  }, [business, setBusiness]);
  return null;
}
