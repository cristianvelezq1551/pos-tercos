'use client';

import { Money } from '@pos-tercos/ui';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Encabezado de cada bloque de la pantalla (recurrentes / únicos). Mismo patrón
 * que el panel de períodos pendientes: icono + título a la izquierda, total a
 * la derecha.
 */
export function CostsSectionHeader({
  icon: Icon,
  title,
  hint,
  count,
  total,
  totalLabel,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  count: number;
  total: number;
  totalLabel: string;
  /** Controles del bloque (p. ej. el selector de mes de los gastos únicos). */
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground">{title}</h2>
        <span className="text-sm text-muted-foreground">
          ({count} {count === 1 ? 'gasto' : 'gastos'})
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {count > 0 ? (
          <span className="text-sm text-muted-foreground">
            {totalLabel}: <Money amount={total} weight="bold" />
          </span>
        ) : null}
        {actions}
      </div>
      <p className="w-full text-xs text-muted-foreground">{hint}</p>
    </header>
  );
}
