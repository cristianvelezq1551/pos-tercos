import type { MonthlyFinancialStatement } from '@pos-tercos/types';
import { formatCop } from '@pos-tercos/ui';
import { Bike } from 'lucide-react';

/**
 * Cuánto se llevaron los domiciliarios en el mes.
 *
 * Va en tarjeta APARTE, no dentro del P&G, porque no es ninguna de las dos
 * cosas que el P&G suma: no es venta (el negocio no se queda ese peso) y no es
 * gasto propio (lo paga el cliente). Meterlo ahí lo volvía a mezclar con la
 * plata del negocio, que es justo lo que se quiso evitar.
 *
 * Para qué sirve: decidir cuándo conviene contratar un repartidor fijo. Con el
 * total del mes y el promedio por pedido, comparar contra un sueldo deja de ser
 * una corazonada.
 */
export function DeliverySpendCard({ s }: { s: MonthlyFinancialStatement }) {
  if (s.deliveryOrderCount === 0) return null;

  const promedio = Math.round(s.deliveryCollected / s.deliveryOrderCount);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Bike className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Domicilios del mes</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Lo que se llevaron los repartidores. Ni venta ni gasto tuyo: el cliente lo paga
            y pasa derecho.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Dato label="Pagado a repartidores" value={formatCop(s.deliveryCollected)} destacado />
        <Dato label="Domicilios" value={String(s.deliveryOrderCount)} />
        <Dato label="Promedio c/u" value={formatCop(promedio)} />
      </div>

      <p className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        Si este número se acerca a lo que costaría un repartidor propio (sueldo + moto +
        gasolina), contratar deja de ser más caro. Este mes van{' '}
        <strong className="text-foreground">{formatCop(s.deliveryCollected)}</strong> en{' '}
        {s.deliveryOrderCount} {s.deliveryOrderCount === 1 ? 'entrega' : 'entregas'}.
      </p>
    </section>
  );
}

function Dato({
  label,
  value,
  destacado,
}: {
  label: string;
  value: string;
  destacado?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5">
      <p className="caps text-[0.625rem] text-muted-foreground">{label}</p>
      <p
        className={
          destacado
            ? 'mt-1 text-lg font-bold tabular-nums text-foreground'
            : 'mt-1 text-lg font-semibold tabular-nums text-foreground'
        }
      >
        {value}
      </p>
    </div>
  );
}
