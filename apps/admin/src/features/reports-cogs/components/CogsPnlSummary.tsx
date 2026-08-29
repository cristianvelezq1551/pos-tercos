import type { PnlReport } from '@pos-tercos/types';
import { Money, StatCard } from '@pos-tercos/ui';
import { formatNumber } from '../../../lib/format';

export function CogsPnlSummary({ pnl }: { pnl: PnlReport }) {
  const marginPct = pnl.grossMarginPct === null ? null : pnl.grossMarginPct * 100;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Ventas del período"
        value={<Money amount={pnl.revenue} size="2xl" weight="bold" />}
        hint={`${pnl.salesCount} venta${pnl.salesCount === 1 ? '' : 's'}`}
      />
      <StatCard
        label="Costo real (FIFO)"
        value={<Money amount={pnl.cogs} size="2xl" weight="bold" />}
        hint="Lo que realmente costó lo vendido"
      />
      <StatCard
        label="Ganancia bruta"
        value={<Money amount={pnl.grossMargin} size="2xl" weight="bold" />}
        hint={marginPct === null ? 'sin ventas' : `${formatNumber(marginPct, { decimals: 1 })}% margen`}
        tone={pnl.grossMargin >= 0 ? 'success' : 'danger'}
      />
      <StatCard
        label="Merma valorizada"
        value={<Money amount={pnl.wasteCost} size="2xl" weight="bold" />}
        hint="Lo que se declaró como tirado (a costo real)"
        tone={pnl.wasteCost > 0 ? 'warning' : 'neutral'}
      />
      {/* Va al lado de la merma a propósito: la merma alguien la declaró, el
          faltante apareció solo al contar. Si el segundo pesa como el primero,
          el problema no es lo que se tira sino lo que se está yendo sin que
          nadie lo vea. Mostrar una y no la otra dejaba media pérdida invisible
          en esta pantalla mientras Finanzas sí la traía. */}
      <StatCard
        label="Faltantes al contar"
        value={<Money amount={pnl.shrinkageCost} size="2xl" weight="bold" />}
        hint="Apareció de menos al contar: nadie lo declaró"
        tone={pnl.shrinkageCost > 0 ? 'warning' : 'neutral'}
      />
    </div>
  );
}
