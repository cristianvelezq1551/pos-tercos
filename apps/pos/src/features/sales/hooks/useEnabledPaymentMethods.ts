'use client';

import type { PaymentMethod } from '@pos-tercos/types';
import { useEffect, useState } from 'react';
import { FALLBACK_METHODS, fetchEnabledMethods } from '../api/payment-methods';

// Métodos habilitados por el admin (offline cae al fallback).
export function useEnabledPaymentMethods(open: boolean, offline: boolean): PaymentMethod[] {
  const [methods, setMethods] = useState<PaymentMethod[]>(FALLBACK_METHODS);

  useEffect(() => {
    if (!open) return;
    if (offline) {
      setMethods(FALLBACK_METHODS);
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
