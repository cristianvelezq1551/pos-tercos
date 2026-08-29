import type { PurchasesReport } from '@pos-tercos/types';
import { fleteEsAlto } from '@pos-tercos/domain';
import { Money, StatCard } from '@pos-tercos/ui';
import { formatNumber } from '../../../lib/format';

export function PurchasesSummary({ report }: { report: PurchasesReport }) {
  const { totals } = report;
  const pct = totals.freightPct;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Mercancía comprada"
        value={<Money amount={totals.purchased} size="2xl" weight="bold" />}
        hint={`${totals.invoiceCount} factura${totals.invoiceCount === 1 ? '' : 's'} en el período`}
      />
      <StatCard
        label="Pagado en domicilios"
        value={<Money amount={totals.freight} size="2xl" weight="bold" />}
        hint={`${totals.invoicesWithFreight} de ${totals.invoiceCount} lo cobraron`}
        tone={totals.freight > 0 ? 'warning' : 'neutral'}
      />
      <StatCard
        label="Peso del domicilio"
        value={
          pct === null ? (
            <span className="text-2xl font-bold text-muted-foreground">—</span>
          ) : (
            <span className="font-display text-2xl font-bold tabular-nums">
              {formatNumber(pct * 100, { decimals: 1 })}%
            </span>
          )
        }
        hint="Sobre lo comprado"
        tone={fleteEsAlto(pct) ? 'danger' : 'success'}
      />
      <StatCard
        label="Promedio por domicilio"
        value={
          <Money
            amount={
              totals.invoicesWithFreight > 0
                ? Math.round(totals.freight / totals.invoicesWithFreight)
                : 0
            }
            size="2xl"
            weight="bold"
          />
        }
        hint="Lo que cobra una entrega"
      />
    </div>
  );
}
