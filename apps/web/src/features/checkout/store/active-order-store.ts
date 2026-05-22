'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const TTL_MS = 24 * 60 * 60 * 1000;

export interface ActiveOrder {
  saleId: string;
  token: string;
  receiptNumber: number;
  /** Epoch ms — sirve para auto-purgar a las 24h. */
  createdAt: number;
}

interface ActiveOrderState {
  order: ActiveOrder | null;
  hydrated: boolean;
  setOrder: (order: ActiveOrder) => void;
  clear: () => void;
  setHydrated: (v: boolean) => void;
}

export const useActiveOrder = create<ActiveOrderState>()(
  persist(
    (set) => ({
      order: null,
      hydrated: false,
      setOrder: (order) => set({ order }),
      clear: () => set({ order: null }),
      setHydrated: (v) => set({ hydrated: v }),
    }),
    {
      name: 'pos-tercos-active-order',
      partialize: (s) => ({ order: s.order }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.order && Date.now() - state.order.createdAt > TTL_MS) {
          state.clear();
        }
        state.setHydrated(true);
      },
    },
  ),
);

export function isOrderExpired(order: ActiveOrder | null): boolean {
  if (!order) return true;
  return Date.now() - order.createdAt > TTL_MS;
}

const TERMINAL_STATUSES = new Set([
  'ENTREGADO',
  'CANCELADO_NO_PAGO',
  'CANCELADO_SIN_REEMBOLSO',
  'VOID',
]);

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}
