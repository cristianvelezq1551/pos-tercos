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

/**
 * Estados en los que la página del cliente YA NO va a cambiar.
 *
 * Incluye **PAGADO** desde §7.v25: la web dejó de mostrar el progreso del
 * pedido (preparando / listo / en camino) porque ese avance lo marca el cajero
 * a mano y no siempre ocurre. Una vez confirmado el pago no queda nada que la
 * página pueda contar — lo que sigue llega por WhatsApp—, así que no tiene
 * sentido seguir consultando ni mostrar el pedido como "en curso".
 *
 * Fuente ÚNICA: el poller importa esto en vez de mantener su propia lista (se
 * habían desincronizado antes).
 */
const TERMINAL_STATUSES = new Set([
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
  'ENTREGADO',
  'CANCELADO_NO_PAGO',
  'CANCELADO_SIN_REEMBOLSO',
  'VOID',
]);

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}
