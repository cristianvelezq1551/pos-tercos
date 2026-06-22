'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartLine } from '../lib/cart-types';

interface AddInput {
  productId: string;
  productName: string;
  imageUrl?: string | null;
  size: CartLine['size'];
  modifiers: CartLine['modifiers'];
  quantity: number;
  unitPrice: number;
  notes?: string;
}

interface CartState {
  items: CartLine[];
  hydrated: boolean;
  addItem: (input: AddInput) => void;
  removeLine: (lineId: string) => void;
  updateQty: (lineId: string, qty: number) => void;
  setItems: (items: CartLine[]) => void;
  clear: () => void;
  setHydrated: (v: boolean) => void;
}

function lineSignature(item: AddInput | CartLine): string {
  const sizeId = item.size?.id ?? '';
  const modIds = [...item.modifiers].map((m) => m.id).sort().join('|');
  return `${item.productId}::${sizeId}::${modIds}::${item.notes?.trim() ?? ''}`;
}

let lineCounter = 0;
const nextLineId = () => `line-${Date.now().toString(36)}-${(lineCounter++).toString(36)}`;

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      hydrated: false,
      addItem: (input) =>
        set((state) => {
          const sig = lineSignature(input);
          const idx = state.items.findIndex((it) => lineSignature(it) === sig);
          if (idx >= 0) {
            const next = state.items.slice();
            const ex = next[idx]!;
            next[idx] = { ...ex, quantity: ex.quantity + input.quantity };
            return { items: next };
          }
          return {
            items: [
              ...state.items,
              {
                lineId: nextLineId(),
                productId: input.productId,
                productName: input.productName,
                imageUrl: input.imageUrl ?? null,
                size: input.size,
                modifiers: input.modifiers,
                quantity: input.quantity,
                unitPrice: input.unitPrice,
                notes: input.notes?.trim() || undefined,
              },
            ],
          };
        }),
      removeLine: (lineId) =>
        set((state) => ({ items: state.items.filter((it) => it.lineId !== lineId) })),
      updateQty: (lineId, qty) =>
        set((state) => ({
          items: state.items.map((it) =>
            it.lineId === lineId ? { ...it, quantity: Math.max(1, Math.floor(qty || 1)) } : it,
          ),
        })),
      setItems: (items) => set({ items }),
      clear: () => set({ items: [] }),
      setHydrated: (v) => set({ hydrated: v }),
    }),
    {
      name: 'pos-tercos-web-cart',
      partialize: (s) => ({ items: s.items }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

/** Convierte a CreateSaleItem[] del backend. */
export function cartLinesToCreateItems(items: readonly CartLine[]) {
  return items.map((it) => ({
    productId: it.productId,
    sizeId: it.size?.id,
    quantity: it.quantity,
    modifiers: it.modifiers.map((m) => ({ modifierId: m.id })),
    notes: it.notes?.trim() || undefined,
  }));
}

export function cartSubtotal(items: readonly CartLine[]): number {
  return items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
}

export function cartLineCount(items: readonly CartLine[]): number {
  return items.reduce((acc, it) => acc + it.quantity, 0);
}
