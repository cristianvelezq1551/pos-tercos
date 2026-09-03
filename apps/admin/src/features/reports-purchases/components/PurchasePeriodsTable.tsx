import type { PurchasePeriod, PurchasesReport } from '@pos-tercos/types';
import { fleteEsAlto } from '@pos-tercos/domain';
import { DataTable, formatCop, type DataTableColumn } from '@pos-tercos/ui';
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

  const columns: DataTableColumn<PurchasePeriod>[] = [
    {
      key: 'label',
      header: unidad === 'semana' ? 'Semana' : 'Mes',
      primary: true,
      cell: (p) => <span className="font-medium">{p.label}</span>,
    },
    {
      key: 'purchased',
      header: 'Mercancía',
      align: 'right',
      numeric: true,
      cell: (p) =>
        p.invoiceCount === 0 ? (
          <span className="text-muted-foreground">sin compras</span>
        ) : (
          formatCop(p.purchased)
        ),
    },
    {
      key: 'freight',
      header: 'Domicilios',
      align: 'right',
      numeric: true,
      cell: (p) => (p.freight > 0 ? formatCop(p.freight) : <span className="text-muted-foreground">—</span>),
    },
    {
      key: 'pct',
      header: 'Peso',
      cell: (p) => <PesoDelFlete p={p} maxFreight={maxFreight} />,
    },
    {
      key: 'invoices',
      header: 'Facturas',
      align: 'right',
      numeric: true,
      cell: (p) => (
        <span className="text-muted-foreground">
          {p.invoiceCount === 0 ? '—' : `${p.invoicesWithFreight}/${p.invoiceCount}`}
        </span>
      ),
    },
  ];

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">Por {unidad}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cuánto compraste y cuánto te cobraron por traerlo, {unidad} por {unidad}.
        </p>
      </header>

      {report.periods.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          No hay compras confirmadas en este período.
        </p>
      ) : (
        <DataTable
          rows={report.periods}
          columns={columns}
          rowKey={(p) => p.key}
          className="rounded-none border-0"
        />
      )}
    </section>
  );
}

function PesoDelFlete({ p, maxFreight }: { p: PurchasePeriod; maxFreight: number }) {
  if (p.freightPct === null) return <span className="text-muted-foreground">—</span>;
  const alto = fleteEsAlto(p.freightPct);
  const ancho = maxFreight > 0 ? Math.round((p.freight / maxFreight) * 100) : 0;
  return (
    <div className="flex items-center gap-2 max-sm:justify-end">
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
  );
}
