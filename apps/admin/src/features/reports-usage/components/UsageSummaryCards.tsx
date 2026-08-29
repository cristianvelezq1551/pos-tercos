import type { InventoryUsageReport } from '@pos-tercos/types';
import { formatCop } from '../../../lib/format';

/**
 * Las dos pérdidas se muestran por separado porque son cosas distintas, no
 * porque una sea menos exacta: la merma alguien la DECLARÓ, el faltante
 * apareció solo al contar. Desde §7.v43 las dos se valorizan igual —al costo
 * del lote que salió— y las dos bajan el resultado del mes.
 */
export function UsageSummaryCards({ report }: { report: InventoryUsageReport }) {
  const worst = report.rows.find((r) => r.lostCost > 0);
  const faltanteEstimado = report.rows.some((r) => r.shortageCostEstimated);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card title="Mermas del período" hint="costo real · igual que el P&amp;G">
        <p className="mt-1 text-2xl font-semibold tabular-nums text-destructive">
          {formatCop(report.totalWasteCost)}
        </p>
      </Card>
      <Card
        title="Faltantes de conteo"
        hint={
          (faltanteEstimado ? 'parte estimada' : 'costo real · igual que el P&G') +
          (report.unknownCostCount > 0
            ? ` · ${report.unknownCostCount} sin poder valorizar`
            : '')
        }
      >
        <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-400">
          {faltanteEstimado ? '~' : ''}
          {formatCop(report.totalShortageCost)}
        </p>
      </Card>
      <Card title="Dónde se pierde más" hint={worst ? `${formatCop(worst.lostCost)} perdidos` : ''}>
        <p className="mt-1 truncate text-lg font-semibold text-foreground">
          {worst ? worst.name : '—'}
        </p>
      </Card>
    </div>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
