import type { MonthlyFinancialStatement } from '@pos-tercos/types';
import { fleteEsAlto } from '@pos-tercos/domain';
import { formatCop } from '@pos-tercos/ui';
import { Truck } from 'lucide-react';

/**
 * Cuánto se pagó en el mes porque traigan la mercancía.
 *
 * Es el opuesto contable de `DeliverySpendCard` (el domicilio que cobra el
 * cliente, que es plata del repartidor y no pasa por el P&G): esto SÍ es plata
 * del negocio, pagada y perdida, y por eso baja el resultado neto.
 *
 * El número que decide no es el total sino el PORCENTAJE sobre lo comprado:
 * $312.000 de flete es barato sobre $8M de compra y caro sobre $2M. Ese % es
 * con lo que se negocia —envío gratis sobre un mínimo, juntar pedidos, ir a
 * recoger— y por eso la tarjeta lo pone al lado del total.
 */
export function PurchaseFreightCard({ s }: { s: MonthlyFinancialStatement }) {
  if (s.freightCost === 0) return null;

  const promedio = Math.round(s.freightCost / s.freightInvoiceCount);
  const pct = s.purchasedTotal > 0 ? s.freightCost / s.purchasedTotal : null;
  const alto = fleteEsAlto(pct);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Truck className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Domicilios de compra</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Lo que pagaste porque te traigan la mercancía. Sale de tu bolsillo y baja el
            resultado del mes.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Dato label="Pagado en domicilios" value={formatCop(s.freightCost)} destacado />
        <Dato
          label={`Factura${s.freightInvoiceCount === 1 ? '' : 's'} con domicilio`}
          value={String(s.freightInvoiceCount)}
        />
        <Dato label="Promedio c/u" value={formatCop(promedio)} />
      </div>

      <p
        className={`mt-4 rounded-md border px-3 py-2.5 text-xs ${
          alto
            ? 'border-warning-border bg-warning-bg/30 text-warning'
            : 'border-border bg-muted/40 text-muted-foreground'
        }`}
      >
        {pct === null ? (
          <>
            Se cobraron <strong className="text-foreground">{formatCop(s.freightCost)}</strong> de
            domicilios este mes.
          </>
        ) : (
          <>
            De <strong className="text-foreground">{formatCop(s.purchasedTotal)}</strong> comprados,{' '}
            <strong className="text-foreground">{formatCop(s.freightCost)}</strong> se fueron en
            domicilios: el <strong className="text-foreground">{(pct * 100).toFixed(1)}%</strong>.{' '}
            {alto
              ? 'Está alto. Mira qué proveedor lo está cobrando y negocia envío gratis sobre un mínimo, o junta pedidos para que vengan menos veces.'
              : 'Es un peso razonable sobre lo que compras.'}
          </>
        )}
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
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="caps text-[0.625rem] text-muted-foreground">{label}</p>
      <p
        className={`mt-1 tabular-nums font-semibold ${
          destacado ? 'text-lg text-foreground' : 'text-base text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
