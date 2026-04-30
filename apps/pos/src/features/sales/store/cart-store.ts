'use client';

import { create } from 'zustand';
import type { CartLine } from '../lib/cart-types';

interface AddInput {
  productId: string;
  productName: string;
  size: CartLine['size'];
  modifiers: CartLine['modifiers'];
  quantity: number;
  unitPrice: number;
}

interface CartState {
  items: CartLine[];
  addItem: (input: AddInput) => void;
  removeLine: (lineId: string) => void;
  updateQty: (lineId: string, qty: number) => void;
  clear: () => void;
}

function lineSignature(item: AddInput | CartLine): string {
  const sizeId = item.size?.id ?? '';
  const modIds = [...item.modifiers].map((m) => m.id).sort().join('|');
  return `${item.productId}::${sizeId}::${modIds}`;
}

let lineCounter = 0;
const nextLineId = () => `line-${Date.now().toString(36)}-${(lineCounter++).toString(36)}`;

export const useCartStore = create<CartState>((set) => ({
  items: [],
  addItem: (input) =>
    set((state) => {
      const sig = lineSignature(input);
      const existingIndex = state.items.findIndex((it) => lineSignature(it) === sig);
      if (existingIndex >= 0) {
        const next = state.items.slice();
        const existing = next[existingIndex]!;
        next[existingIndex] = { ...existing, quantity: existing.quantity + input.quantity };
        return { items: next };
      }
      return {
        items: [
          ...state.items,
          {
            lineId: nextLineId(),
            productId: input.productId,
            productName: input.productName,
            size: input.size,
            modifiers: input.modifiers,
            quantity: input.quantity,
            unitPrice: input.unitPrice,
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
  clear: () => set({ items: [] }),
}));
