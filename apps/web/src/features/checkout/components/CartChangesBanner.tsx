'use client';

import { AlertTriangle } from 'lucide-react';
import type { CartReconcileChange } from '../../cart/lib/reconcile';
import { COP } from '../../../lib/format';

/**
 * Avisa al cliente que su carrito cambió desde la última visita (producto
 * desactivado o precio actualizado) y lo obliga a confirmar el pedido al día
 * antes de pagar. Sin esto, el pedido fallaba opaco en el backend o mostraba
 * un total viejo.
 */
export function CartChangesBanner({
  change,
  onApply,
}: {
  change: CartReconcileChange;
  onApply: () => void;
}) {
  return (
    <section
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900"
    >
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        Tu pedido cambió desde la última vez
      </div>

      {change.removed.length > 0 ? (
        <div>
          <p className="font-medium">Ya no están disponibles (se quitan):</p>
          <ul className="ml-4 list-disc">
            {change.removed.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {change.unavailable.length > 0 ? (
        <div>
          <p className="font-medium">Agotados ahora (se quitan):</p>
          <ul className="ml-4 list-disc">
            {change.unavailable.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {change.repriced.length > 0 ? (
        <div>
          <p className="font-medium">Cambiaron de precio:</p>
          <ul className="ml-4 list-disc">
            {change.repriced.map((r) => (
              <li key={r.name} className="tabular-nums">
                {r.name}: {COP.format(r.from)} → {COP.format(r.to)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onApply}
        className="press inline-flex h-10 items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-bold text-white transition-opacity hover:opacity-90"
      >
        Actualizar mi pedido
      </button>
    </section>
  );
}
