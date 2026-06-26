import type { PublicMenuProduct } from '@pos-tercos/types';
import { displayBasePrice } from '../../../lib/menu-price';
import type { CartLine } from './cart-types';

export interface CartReconcileChange {
  /** Nombres de productos que ya no están en el menú (desactivados/borrados). */
  removed: string[];
  /** Nombres de productos agotados ahora mismo (86 manual o sin stock/insumos). */
  unavailable: string[];
  /** Productos cuyo precio cambió desde que se agregaron al carrito. */
  repriced: Array<{ name: string; from: number; to: number }>;
}

/** Precio unitario fresco de una línea según el menú actual (base + tamaño +
 *  modificadores). Pura: no muta el carrito. */
function freshUnitPrice(line: CartLine, product: PublicMenuProduct): number {
  const base = displayBasePrice(product);
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
  unavailableIds?: ReadonlySet<string>,
): { items: CartLine[]; change: CartReconcileChange } {
  const byId = new Map(menu.map((p) => [p.id, p]));
  const removed: string[] = [];
  const unavailable: string[] = [];
  const repriced: CartReconcileChange['repriced'] = [];
  const next: CartLine[] = [];
  for (const line of items) {
    const product = byId.get(line.productId);
    if (!product) {
      removed.push(line.productName);
      continue;
    }
    if (unavailableIds?.has(line.productId)) {
      unavailable.push(line.productName);
      continue;
    }
    // El tamaño o algún modificador elegido ya no existe en el producto (el
    // dueño cambió las opciones). Repricearlo a `?? 0` enviaría un sizeId/modId
    // inexistente → el backend lo rechaza con 400 al pagar (falla opaca pese al
    // banner). Tratamos la línea como removida: el cliente la re-elige.
    const sizeGone = line.size && !product.sizes.some((s) => s.id === line.size!.id);
    const modGone = line.modifiers.some((m) => !product.modifiers.some((x) => x.id === m.id));
    if (sizeGone || modGone) {
      removed.push(line.productName);
      continue;
    }
    const fresh = freshUnitPrice(line, product);
    // Compara al peso redondeado: los montos COP son enteros, evita falsos
    // "cambió de precio" por drift de punto flotante en sumas de extras.
    if (Math.round(fresh) !== Math.round(line.unitPrice)) {
      repriced.push({ name: line.productName, from: line.unitPrice, to: fresh });
      next.push({ ...line, unitPrice: fresh });
    } else {
      next.push(line);
    }
  }
  return { items: next, change: { removed, unavailable, repriced } };
}

export function hasReconcileChanges(c: CartReconcileChange): boolean {
  return c.removed.length > 0 || c.unavailable.length > 0 || c.repriced.length > 0;
}
