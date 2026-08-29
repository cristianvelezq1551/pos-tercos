import type { PurchasePeriod, PurchasesReport } from '@pos-tercos/types';
import { fleteEsAlto } from '@pos-tercos/domain';
import { formatCop } from '@pos-tercos/ui';
import { formatNumber } from '../../../lib/format';

/**
 * Serie por semana o por mes, con la barra proporcional al flete.
 *
 * La barra se escala contra el flete MÁXIMO del período, no contra lo
 * comprado: lo que se busca acá es en qué semana se disparó el domicilio, y
 * contra la compra todas las barras quedarían igual de invisibles.
 */
export function PurchasePeriodsTable({ report }: { report: PurchasesReport }) {
  const maxFreight = Math.max(...report.periods.map((p) => p.freight), 0);
  const unidad = report.granularity === 'weekly' ? 'semana' : 'mes';

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          Por {unidad}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cuánto compraste y cuánto te cobraron por traerlo, {unidad} por {unidad}.
        </p>
      </header>

      {report.periods.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          No hay compras confirmadas en este período.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40">
              <tr>
                <Th align="left">{unidad === 'semana' ? 'Semana' : 'Mes'}</Th>
                <Th align="right">Mercancía</Th>
                <Th align="right">Domicilios</Th>
                <Th align="left">Peso</Th>
                <Th align="right">Facturas</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.periods.map((p) => (
                <Row key={p.key} p={p} maxFreight={maxFreight} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Row({ p, maxFreight }: { p: PurchasePeriod; maxFreight: number }) {
  const vacio = p.invoiceCount === 0;
  const alto = fleteEsAlto(p.freightPct);
  const ancho = maxFreight > 0 ? Math.round((p.freight / maxFreight) * 100) : 0;

  return (
    <tr className={vacio ? 'text-muted-foreground' : 'hover:bg-muted/20'}>
      <td className="px-5 py-2.5 font-medium">{p.label}</td>
      <td className="px-5 py-2.5 text-right tabular-nums">
        {vacio ? <span className="text-ink-400">sin compras</span> : formatCop(p.purchased)}
      </td>
      <td className="px-5 py-2.5 text-right tabular-nums">
        {p.freight > 0 ? formatCop(p.freight) : <span className="text-ink-400">—</span>}
      </td>
      <td className="px-5 py-2.5">
        {p.freightPct === null ? (
          <span className="text-ink-400">—</span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${alto ? 'bg-warning' : 'bg-primary/60'}`}
                style={{ width: `${ancho}%` }}
              />
            </div>
            <span className={`tabular-nums text-xs ${alto ? 'text-warning' : 'text-muted-foreground'}`}>
              {formatNumber(p.freightPct * 100, { decimals: 1 })}%
            </span>
          </div>
        )}
      </td>
      <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
        {vacio ? '—' : `${p.invoicesWithFreight}/${p.invoiceCount}`}
      </td>
    </tr>
  );
}

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th
      className={`px-5 py-2 text-${align} text-xs font-semibold uppercase tracking-wider text-muted-foreground`}
    >
      {children}
    </th>
  );
}
