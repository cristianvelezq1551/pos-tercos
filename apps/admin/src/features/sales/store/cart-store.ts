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
  separarLinea: (lineId: string) => void;
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

let lineCounter = 0;
const nextLineId = () => `line-${Date.now().toString(36)}-${(lineCounter++).toString(36)}`;

export const useCartStore = create<CartState>((set) => ({
  items: [],
  lastSale: null,
  customerName: '',
  lineDiscounts: {},
  orderDiscount: null,
  discountReason: '',
  /**
   * Cada toque en el catálogo crea su PROPIA línea. Nunca se fusiona con una
   * igual.
   *
   * Antes se agrupaban y eso obligaba a un botón aparte para "otro con nota
   * distinta" — que además AGREGABA una unidad en vez de separar las que ya
   * había: con dos sándwiches, pedir otra nota dejaba tres. El dueño lo dijo
   * derecho: "no tiene sentido".
   *
   * Sin agrupar, poner una nota distinta es simplemente tocar el producto otra
   * vez. La cantidad de una línea solo sube si alguien aprieta «+», que es una
   * decisión explícita: esas unidades comparten la nota a propósito.
   *
   * ⚠️ Una promo de tipo 2x1 (BOGO) se calcula POR LÍNEA
   * (`Math.floor(cantidad / tamaño)`), así que tres toques sueltos no la
   * disparan y tres unidades en una línea sí. Hoy no hay ninguna promo así
   * cargada; antes de crear una hay que hacer que el motor agrupe por producto
   * —en la caja Y en el servidor, que recalcula— o la promo no se aplicaría.
   */
  addItem: (input) =>
    set((state) => {
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
  /**
   * Una línea de N unidades pasa a N líneas de 1, para que cada una pueda
   * llevar su propia nota.
   *
   * Es lo que se esperaba del viejo botón "agregar otro aparte", que en
   * realidad AGREGABA: con dos sándwiches dejaba tres. Separar no cambia el
   * total ni la cantidad vendida — solo reparte lo que ya estaba.
   *
   * La primera línea conserva la nota (es la que se estaba editando); las demás
   * nacen sin ella. El descuento manual NO se copia: se autoriza sobre una
   * línea concreta, y repartirlo multiplicaría la plata regalada.
   */
  separarLinea: (lineId) =>
    set((state) => {
      const i = state.items.findIndex((it) => it.lineId === lineId);
      if (i < 0) return state;
      const origen = state.items[i]!;
      if (origen.quantity <= 1) return state;
      const nuevas = Array.from({ length: origen.quantity }, (_, n) => ({
        ...origen,
        lineId: n === 0 ? origen.lineId : nextLineId(),
        quantity: 1,
        notes: n === 0 ? origen.notes : undefined,
      }));
      const items = state.items.slice();
      items.splice(i, 1, ...nuevas);
      return { items };
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
