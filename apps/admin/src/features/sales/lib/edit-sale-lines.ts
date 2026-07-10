import type { Sale } from '@pos-tercos/types';
import type { PickerSelection } from '../../catalog';
import type { EditLine } from '../components/EditSaleLineRow';

/** Estados en los que la cocina "tomó" el pedido y se congelan las líneas de
 *  preparación (solo se editan las de reventa directa). */
function isKitchenStarted(status: string): boolean {
  return status === 'EN_PREPARACION' || status === 'LISTO_DESPACHO';
}

/**
 * Proyecta los ítems de una venta a líneas editables. Bloquea (`locked`) las
 * líneas de preparación cuando la cocina ya inició el pedido — solo la reventa
 * directa (mapa productId→directResale) queda editable.
 */
export function saleItemsToEditLines(
  sale: Sale,
  resaleById: Map<string, boolean>,
): EditLine[] {
  const kitchenStarted = isKitchenStarted(sale.status);
  return (sale.items ?? []).map((it) => ({
    productId: it.productId,
    productName: it.productName ?? 'Producto',
    sizeId: it.sizeId,
    sizeName: it.sizeName ?? null,
    quantity: it.quantity,
    modifierIds: it.modifiers.map((m) => m.modifierId),
    modifierNames: it.modifiers.map((m) => m.name),
    notes: it.notes ?? null,
    unitPrice: it.unitPrice,
    manualDiscount: it.manualDiscount ?? null,
    locked: kitchenStarted && !(resaleById.get(it.productId) ?? false),
  }));
}

/** Convierte una selección del picker en una nueva línea editable (desbloqueada). */
export function selectionToEditLine(sel: PickerSelection): EditLine {
  return {
    productId: sel.productId,
    productName: sel.productName,
    sizeId: sel.size?.id ?? null,
    sizeName: sel.size?.name ?? null,
    quantity: sel.quantity,
    modifierIds: sel.modifiers.map((m) => m.id),
    modifierNames: sel.modifiers.map((m) => m.name),
    notes: null,
    unitPrice: sel.unitPrice,
    manualDiscount: null,
    locked: false,
  };
}
