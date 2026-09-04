'use client';

import { RotateCcw } from 'lucide-react';
import { haceCuanto } from './borrador-conteo';

/**
 * "Seguimos donde quedaste". Se muestra solo cuando de verdad se retomó algo,
 * y dice CUÁNDO se guardó: si el conteo es de hace tres horas, quien lo
 * retoma tiene que poder decidir si sigue sirviendo o arranca de nuevo.
 */
export function AvisoDeBorrador({
  guardadoEn,
  contados,
  onDescartar,
}: {
  guardadoEn: number | null;
  contados: number;
  onDescartar: () => void;
}) {
  if (guardadoEn === null) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5">
      <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          Retomamos tu conteo ({contados} {contados === 1 ? 'ítem' : 'ítems'})
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Lo empezaste {haceCuanto(guardadoEn, Date.now())} y quedó guardado en este teléfono.
          Sigue donde ibas y regístralo cuando termines.
        </p>
      </div>
      <button
        type="button"
        onClick={onDescartar}
        className="shrink-0 self-center rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Empezar de cero
      </button>
    </div>
  );
}
