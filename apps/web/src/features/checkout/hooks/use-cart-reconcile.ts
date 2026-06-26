'use client';

import {
  ProductAvailabilityResponseSchema,
  PublicMenuResponseSchema,
  type PublicMenuProduct,
} from '@pos-tercos/types';
import { useEffect, useState } from 'react';
import { logError } from '../../../lib/client-log';
import { useCartStore } from '../../cart';
import {
  hasReconcileChanges,
  reconcileCart,
  type CartReconcileChange,
} from '../../cart/lib/reconcile';

const EMPTY: CartReconcileChange = { removed: [], unavailable: [], repriced: [] };

/**
 * Al entrar al checkout, contrasta el carrito persistido contra el menú actual.
 * Si un producto se desactivó o cambió de precio, expone el cambio + `apply()`
 * para que el cliente lo revise ANTES de pagar (evita el fallo opaco del
 * backend y el total viejo). Best-effort: si el menú no carga, no bloquea.
 */
export function useCartReconcile() {
  const items = useCartStore((s) => s.items);
  const setItems = useCartStore((s) => s.setItems);
  const hydrated = useCartStore((s) => s.hydrated);

  const [menu, setMenu] = useState<PublicMenuProduct[] | null>(null);
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/web/menu', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        const parsed = PublicMenuResponseSchema.safeParse(json);
        if (parsed.success) setMenu(parsed.data.products);
      })
      .catch((e) => logError('cart-reconcile', e));
    // Disponibilidad en vivo: un agotado debe quitarse del carrito ANTES de
    // pagar (si no, el backend lo rechaza con un 409 opaco). Best-effort.
    void fetch('/api/products/availability', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        const parsed = ProductAvailabilityResponseSchema.safeParse(json);
        if (parsed.success) {
          setUnavailableIds(
            new Set(parsed.data.filter((r) => !r.available).map((r) => r.productId)),
          );
        }
      })
      .catch((e) => logError('cart-reconcile-availability', e));
    return () => {
      cancelled = true;
    };
  }, []);

  // Sin menú o sin hidratar todavía → nada que reconciliar (no bloquea el pago).
  if (!hydrated || !menu) {
    return { change: EMPTY, hasChanges: false, apply: () => {} };
  }

  const { items: reconciled, change } = reconcileCart(items, menu, unavailableIds);
  // No usamos un flag "acknowledged": al aplicar, el carrito queda igual al menú
  // y `change` se recalcula vacío en el siguiente render. Si el menú cambia otra
  // vez, el banner reaparece (un flag persistente lo silenciaría para siempre).
  const hasChanges = hasReconcileChanges(change);

  const apply = () => {
    setItems(reconciled);
  };

  return { change, hasChanges, apply };
}
