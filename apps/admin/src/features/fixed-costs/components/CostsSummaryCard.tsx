'use client';

import { Button, Money } from '@pos-tercos/ui';
import { Plus, Receipt, Repeat } from 'lucide-react';

/**
 * Las dos cifras van SEPARADAS a propósito: "al mes" solo tiene sentido para lo
 * que se repite. Un gasto único de una reparación no se paga todos los meses,
 * así que sumarlo dentro del total mensual inflaría el número que el dueño usa
 * para leer cuánto le cuesta sostener el negocio.
 */
export function CostsSummaryCard({
  totalRecurrenteMensual,
  recurrentesActivos,
  totalUnicos,
  unicosActivos,
  onCreate,
}: {
  totalRecurrenteMensual: number;
  recurrentesActivos: number;
  totalUnicos: number;
  unicosActivos: number;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-stretch gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="grid flex-1 gap-4 sm:grid-cols-2 sm:gap-8">
        <div>
          <p className="caps flex items-center gap-1.5 text-[0.625rem] text-muted-foreground">
            <Repeat className="h-3 w-3" strokeWidth={2} />
            Recurrentes al mes
          </p>
          <p className="mt-0.5 text-xl font-bold text-foreground tabular-nums">
            <Money amount={totalRecurrenteMensual} weight="bold" />
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {recurrentesActivos} activo{recurrentesActivos === 1 ? '' : 's'} · mensuales + anuales
            ÷ 12. La nómina se suma aparte en el estado financiero.
          </p>
        </div>
        <div className="sm:border-l sm:border-border sm:pl-8">
          <p className="caps flex items-center gap-1.5 text-[0.625rem] text-muted-foreground">
            <Receipt className="h-3 w-3" strokeWidth={2} />
            Gastos únicos cargados
          </p>
          <p className="mt-0.5 text-xl font-bold text-foreground tabular-nums">
            <Money amount={totalUnicos} weight="bold" />
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {unicosActivos} gasto{unicosActivos === 1 ? '' : 's'} · no se repiten: cada uno pesa
            solo en el mes de su fecha.
          </p>
        </div>
      </div>
      <Button onClick={onCreate} className="shrink-0 max-sm:w-full">
        <Plus className="h-4 w-4" /> Nuevo gasto
      </Button>
    </div>
  );
}
