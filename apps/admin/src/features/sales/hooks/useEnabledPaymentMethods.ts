'use client';

import type { PaymentMethodSetting } from '@pos-tercos/types';
import { useEffect, useState } from 'react';
import { cachedEnabledMethods, fetchEnabledMethods } from '../api/payment-methods';

// Métodos habilitados por el admin (offline cae al cache/fallback).
export function useEnabledPaymentMethods(open: boolean, offline: boolean): PaymentMethodSetting[] {
  const [methods, setMethods] = useState<PaymentMethodSetting[]>(() => cachedEnabledMethods());

  useEffect(() => {
    if (!open) return;
    if (offline) {
      setMethods(cachedEnabledMethods());
      return;
    }
    let cancelled = false;
    void fetchEnabledMethods().then((m) => {
      if (!cancelled) setMethods(m);
    });
    return () => {
      cancelled = true;
    };
  }, [open, offline]);

  return methods;
}
