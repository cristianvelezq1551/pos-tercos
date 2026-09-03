import type { PurchasesReport } from '@pos-tercos/types';
import { fleteEsAlto } from '@pos-tercos/domain';
import { DataTable, formatCop, type DataTableColumn } from '@pos-tercos/ui';
import { formatNumber } from '../../../lib/format';

type FilaProveedor = PurchasesReport['bySupplier'][number];

/**
 * Quién te cobra por traer, ordenado por lo que cobró.
 *
 * Esta es la tabla con la que se negocia: el proveedor que aparece arriba con
 * un peso alto es la conversación que más plata devuelve. Por eso el orden es
 * por flete y no por volumen de compra — el proveedor más grande puede ser
 * justo el que no cobra domicilio.
 */
export function PurchaseSuppliersTable({ report }: { report: PurchasesReport }) {
  const conFlete = report.bySupplier.filter((s) => s.freight > 0);
  const sinFlete = report.bySupplier.filter((s) => s.freight === 0);

  const columns: DataTableColumn<FilaProveedor>[] = [
    { key: 'supplier', header: 'Proveedor', primary: true, cell: (s) => s.supplierName },
    {
      key: 'purchased',
      header: 'Mercancía',
      align: 'right',
      numeric: true,
      cell: (s) => formatCop(s.purchased),
    },
    {
      key: 'freight',
      header: 'Domicilios',
      align: 'right',
      numeric: true,
      cell: (s) =>
        s.freight > 0 ? formatCop(s.freight) : <span className="text-muted-foreground">no cobra</span>,
    },
    {
      key: 'pct',
      header: 'Peso',
      align: 'right',
      numeric: true,
      cell: (s) => (
        <span
          className={
            fleteEsAlto(s.freightPct) ? 'font-semibold text-warning' : 'text-muted-foreground'
          }
        >
          {s.freightPct === null ? '—' : `${formatNumber(s.freightPct * 100, { decimals: 1 })}%`}
        </span>
      ),
    },
    {
      key: 'invoices',
      header: 'Facturas',
      align: 'right',
      numeric: true,
      cell: (s) => (
        <span className="text-muted-foreground">
          {s.invoicesWithFreight}/{s.invoiceCount}
        </span>
      ),
    },
  ];

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">Por proveedor</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Con quién hablar primero: arriba el que más cobró por traer.
        </p>
      </header>

      {report.bySupplier.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          No hay compras confirmadas en este período.
        </p>
      ) : (
        <DataTable
          rows={report.bySupplier}
          columns={columns}
          rowKey={(s) => s.supplierId ?? s.supplierName}
          className="rounded-none border-0"
        />
      )}

      {conFlete.length > 0 && sinFlete.length > 0 && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          {sinFlete.length} proveedor{sinFlete.length === 1 ? '' : 'es'} no cobra
          {sinFlete.length === 1 ? '' : 'n'} domicilio. Si alguno vende lo mismo que un
          proveedor caro de arriba, ahí hay plata.
        </p>
      )}
    </section>
  );
}
