'use client';

import type { ManualDiscount } from '@pos-tercos/types';
import { create } from 'zustand';
import type { CartLine } from '../lib/cart-types';

interface AddInput {
  productId: string;
  productName: string;
  size: CartLine['size'];
  modifiers: CartLine['modifiers'];
  quantity: number;
  unitPrice: number;
  notes?: string;
  isCombo: boolean;
}

export interface LastSaleSummary {
  /** null en venta offline (aún no hay venta en el backend). */
  id: string | null;
  /** null en venta offline (el recibo real lo asigna el backend al sincronizar). */
  receiptNumber: number | null;
  /** Número provisional OFF-N (solo en venta offline). */
  provisionalNumber?: string | null;
  total: number;
  paymentMethod: string;
  changeDue: number;
}

interface CartState {
  items: CartLine[];
  lastSale: LastSaleSummary | null;
  /** Nombre del cliente del pedido de mostrador (#1). Opcional salvo cuenta abierta. */
  customerName: string;
  /** Descuentos manuales (#5b) por línea — excluyentes con promos. */
  lineDiscounts: Record<string, ManualDiscount>;
  /** Descuento manual sobre el total (#5b). */
  orderDiscount: ManualDiscount | null;
  /** Motivo del descuento manual (obligatorio si hay descuento). */
  discountReason: string;
  addItem: (input: AddInput) => void;
  removeLine: (lineId: string) => void;
  updateQty: (lineId: string, qty: number) => void;
  setNotes: (lineId: string, notes: string) => void;
  setCustomerName: (name: string) => void;
  setLineDiscount: (lineId: string, spec: ManualDiscount | null) => void;
  setOrderDiscount: (spec: ManualDiscount | null) => void;
  setDiscountReason: (reason: string) => void;
  clearDiscounts: () => void;
  clear: () => void;
  setLastSale: (sale: LastSaleSummary | null) => void;
}

function lineSignature(item: AddInput | CartLine): string {
  const sizeId = item.size?.id ?? '';
  const modIds = [...item.modifiers]
    .map((m) => m.id)
    .sort()
    .join('|');
  // Las notas distinguen líneas: una "sin cebolla" no se fusiona con una normal.
  return `${item.productId}::${sizeId}::${modIds}::${item.notes?.trim() ?? ''}`;
}

let lineCounter = 0;
const nextLineId = () => `line-${Date.now().toString(36)}-${(lineCounter++).toString(36)}`;

export const useCartStore = create<CartState>((set) => ({
  items: [],
  lastSale: null,
  customerName: '',
  lineDiscounts: {},
  orderDiscount: null,
  discountReason: '',
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
            notes: input.notes,
            isCombo: input.isCombo,
          },
        ],
      };
    }),
  removeLine: (lineId) =>
    set((state) => {
      const { [lineId]: _dropped, ...rest } = state.lineDiscounts;
      return { items: state.items.filter((it) => it.lineId !== lineId), lineDiscounts: rest };
    }),
  updateQty: (lineId, qty) =>
    set((state) => ({
      items: state.items.map((it) =>
        it.lineId === lineId ? { ...it, quantity: Math.max(1, Math.floor(qty || 1)) } : it,
      ),
    })),
  setNotes: (lineId, notes) =>
    set((state) => ({
      items: state.items.map((it) =>
        it.lineId === lineId ? { ...it, notes: notes.trim() ? notes : undefined } : it,
      ),
    })),
  setCustomerName: (name) => set({ customerName: name }),
  setLineDiscount: (lineId, spec) =>
    set((state) => {
      if (spec === null) {
        const { [lineId]: _dropped, ...rest } = state.lineDiscounts;
        return { lineDiscounts: rest };
      }
      return { lineDiscounts: { ...state.lineDiscounts, [lineId]: spec } };
    }),
  setOrderDiscount: (spec) => set({ orderDiscount: spec }),
  setDiscountReason: (reason) => set({ discountReason: reason }),
  clearDiscounts: () => set({ lineDiscounts: {}, orderDiscount: null, discountReason: '' }),
  clear: () =>
    set({
      items: [],
      customerName: '',
      lineDiscounts: {},
      orderDiscount: null,
      discountReason: '',
    }),
  setLastSale: (sale) => set({ lastSale: sale }),
}));

/** Convierte el carrito local al payload del backend (CreateSale.items). */
export function cartLinesToCreateItems(
  items: readonly CartLine[],
  lineDiscounts: Record<string, ManualDiscount> = {},
) {
  return items.map((it) => ({
    productId: it.productId,
    sizeId: it.size?.id,
    quantity: it.quantity,
    modifiers: it.modifiers.map((m) => ({ modifierId: m.id })),
    notes: it.notes,
    manualDiscount: lineDiscounts[it.lineId],
  }));
}
