import type { PublicMenuProduct } from '@pos-tercos/types';
import type { CartLine } from './cart-types';

export interface CartReconcileChange {
  /** Nombres de productos que ya no están en el menú (desactivados/borrados). */
  removed: string[];
  /** Productos cuyo precio cambió desde que se agregaron al carrito. */
  repriced: Array<{ name: string; from: number; to: number }>;
}

/** Precio unitario fresco de una línea según el menú actual (base + tamaño +
 *  modificadores). Pura: no muta el carrito. */
function freshUnitPrice(line: CartLine, product: PublicMenuProduct): number {
  const base =
    product.isCombo && product.comboPrice !== null ? product.comboPrice : product.basePrice;
  const sizeMod = line.size
    ? (product.sizes.find((s) => s.id === line.size!.id)?.priceModifier ?? 0)
    : 0;
  const modSum = line.modifiers.reduce(
    (acc, m) => acc + (product.modifiers.find((x) => x.id === m.id)?.priceDelta ?? 0),
    0,
  );
  return base + sizeMod + modSum;
}

/**
 * Reconcilia el carrito persistido contra el menú actual: quita productos que
 * ya no existen y actualiza precios que cambiaron. Devuelve el carrito nuevo y
 * un resumen de cambios para avisarle al cliente ANTES de pagar (si no, el
 * pedido fallaba opaco en el backend o mostraba un total viejo).
 */
export function reconcileCart(
  items: readonly CartLine[],
  menu: readonly PublicMenuProduct[],
): { items: CartLine[]; change: CartReconcileChange } {
  const byId = new Map(menu.map((p) => [p.id, p]));
  const removed: string[] = [];
  const repriced: CartReconcileChange['repriced'] = [];
  const next: CartLine[] = [];
  for (const line of items) {
    const product = byId.get(line.productId);
    if (!product) {
      removed.push(line.productName);
      continue;
    }
    const fresh = freshUnitPrice(line, product);
    if (fresh !== line.unitPrice) {
      repriced.push({ name: line.productName, from: line.unitPrice, to: fresh });
      next.push({ ...line, unitPrice: fresh });
    } else {
      next.push(line);
    }
  }
  return { items: next, change: { removed, repriced } };
}

export function hasReconcileChanges(c: CartReconcileChange): boolean {
  return c.removed.length > 0 || c.repriced.length > 0;
}
