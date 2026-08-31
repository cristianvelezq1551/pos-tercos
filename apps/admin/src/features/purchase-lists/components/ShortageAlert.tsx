import type { ShortageCandidate } from '@pos-tercos/types';
import { Card, Quantity } from '@pos-tercos/ui';
import { AlertTriangle, PackageCheck } from 'lucide-react';

const MAX_VISIBLES = 8;

/**
 * La alerta de faltantes, en la misma pantalla donde se decide la compra.
 *
 * Antes vivía en "Sugerencias inteligentes", una segunda pantalla donde había
 * que volver a decidir lo mismo que acá: qué falta y cuánto pedir. El detector
 * de stock bajo sigue corriendo detrás (es el que dispara el aviso al
 * navegador); lo que se retiró es la pantalla duplicada.
 *
 * Muestra la falta en unidad de INVENTARIO —que es como se mide— y lo que hay
 * que comprar en unidad de COMPRA, que es como se pide. Confundir las dos es
 * el error que hace pedir de más.
 */
export function ShortageAlert({ candidates }: { candidates: ShortageCandidate[] }) {
  const faltantes = candidates.filter((c) => c.belowMinimum);

  if (faltantes.length === 0) {
    return (
      <Card className="mb-4 flex items-center gap-3 px-5 py-4">
        <PackageCheck className="h-5 w-5 shrink-0 text-success" strokeWidth={1.75} aria-hidden />
        <p className="text-sm text-muted-foreground">
          Nada por debajo del mínimo ahora mismo. Igual puedes armar una lista para lo que quieras
          pedir.
        </p>
      </Card>
    );
  }

  const visibles = faltantes.slice(0, MAX_VISIBLES);
  const resto = faltantes.length - visibles.length;

  return (
    <Card variant="accent" tone="warning" className="mb-4 px-5 py-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" strokeWidth={1.75} aria-hidden />
        <p className="text-sm font-semibold text-foreground">
          {faltantes.length === 1
            ? 'Hay 1 ítem por debajo del mínimo'
            : `Hay ${faltantes.length} ítems por debajo del mínimo`}
        </p>
      </div>
      <p className="mt-1 pl-8 text-xs text-muted-foreground">
        &quot;Nueva lista con lo que falta&quot; los mete todos con la cantidad justa para volver al
        mínimo.
      </p>
      <ul className="mt-3 grid gap-x-6 gap-y-1.5 pl-8 text-xs sm:grid-cols-2">
        {visibles.map((c) => (
          <li key={`${c.entityType}:${c.entityId}`} className="flex justify-between gap-3">
            <span className="min-w-0 truncate text-foreground">{c.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              faltan <Quantity value={c.deficitStock} maxDecimals={2} className="text-current" />{' '}
              {c.unitStock} · pedir {c.suggestedQty} {c.unitPurchase}
            </span>
          </li>
        ))}
      </ul>
      {resto > 0 ? <p className="mt-2 pl-8 text-xs text-muted-foreground">y {resto} más.</p> : null}
    </Card>
  );
}
