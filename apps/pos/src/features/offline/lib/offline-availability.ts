import {
  deserializeRecipeGraph,
  evaluateAvailability,
  expandRecipe,
} from '@pos-tercos/domain';
import type { ProductAvailability } from '@pos-tercos/types';
import { offlineDb } from './db';
import type { OfflineSalePayload } from './types';

/**
 * Disponibilidad OFFLINE calculada con el snapshot cacheado + el consumo local:
 * stock efectivo = stock del backend − lo descontado por ventas offline. Usa la
 * MISMA función pura que el backend (`evaluateAvailability`) → un preparado se
 * agota offline igual que online.
 */
export async function computeOfflineAvailability(): Promise<ProductAvailability[]> {
  const ledger = await offlineDb.getLedger();
  if (!ledger) return [];
  const { snapshot, productConsumed, ingredientConsumed } = ledger;
  const graph = deserializeRecipeGraph(snapshot.graph);

  const productStock = new Map<string, number>();
  for (const [id, v] of Object.entries(snapshot.productStock)) {
    productStock.set(id, v - (productConsumed[id] ?? 0));
  }
  const ingredientStock = new Map<string, number>();
  for (const [id, v] of Object.entries(snapshot.ingredientStock)) {
    ingredientStock.set(id, v - (ingredientConsumed[id] ?? 0));
  }

  return evaluateAvailability({
    products: snapshot.products,
    graph,
    productStock,
    ingredientStock,
  });
}

/**
 * Descuenta el consumo de una venta offline del ledger local (reventa directa →
 * stock propio; preparado → insumos vía expandRecipe; combo → sus componentes).
 * No-op si todavía no hay snapshot cacheado.
 */
export async function applyConsumptionForSale(payload: OfflineSalePayload): Promise<void> {
  const ledger = await offlineDb.getLedger();
  if (!ledger) return;
  const graph = deserializeRecipeGraph(ledger.snapshot.graph);
  const products = new Map(ledger.snapshot.products.map((p) => [p.id, p]));
  const prodC = { ...ledger.productConsumed };
  const ingC = { ...ledger.ingredientConsumed };

  const consume = (productId: string, qty: number): void => {
    const p = products.get(productId);
    if (!p) return;
    if (p.directResale) {
      prodC[p.id] = (prodC[p.id] ?? 0) + qty;
      return;
    }
    if (p.isCombo) {
      for (const comp of p.comboComponents) consume(comp.productId, qty * comp.quantity);
      return;
    }
    try {
      const needs = expandRecipe(graph, { kind: 'product', id: p.id }, qty);
      for (const ing of needs.values()) {
        ingC[ing.ingredientId] = (ingC[ing.ingredientId] ?? 0) + ing.totalQuantity;
      }
    } catch {
      // Receta rota: no descontamos (coherente con la disponibilidad).
    }
  };

  for (const line of payload.lines) consume(line.productId, line.quantity);

  await offlineDb.setLedger({
    ...ledger,
    productConsumed: prodC,
    ingredientConsumed: ingC,
  });
}
