import type { PurchasesReport } from '@pos-tercos/types';
import { fleteEsAlto } from '@pos-tercos/domain';
import { formatCop } from '@pos-tercos/ui';
import { formatNumber } from '../../../lib/format';

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
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Proveedor
                </th>
                <th className="px-5 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Mercancía
                </th>
                <th className="px-5 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Domicilios
                </th>
                <th className="px-5 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Peso
                </th>
                <th className="px-5 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Facturas
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.bySupplier.map((s) => {
                const alto = fleteEsAlto(s.freightPct);
                return (
                  <tr key={s.supplierId ?? s.supplierName} className="hover:bg-muted/20">
                    <td className="px-5 py-2.5 font-medium text-foreground">{s.supplierName}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{formatCop(s.purchased)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {s.freight > 0 ? formatCop(s.freight) : <span className="text-ink-400">no cobra</span>}
                    </td>
                    <td
                      className={`px-5 py-2.5 text-right tabular-nums ${alto ? 'font-semibold text-warning' : 'text-muted-foreground'}`}
                    >
                      {s.freightPct === null ? '—' : `${formatNumber(s.freightPct * 100, { decimals: 1 })}%`}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                      {s.invoicesWithFreight}/{s.invoiceCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
