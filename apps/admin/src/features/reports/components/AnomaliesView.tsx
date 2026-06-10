import type {
  CashierAnomalies,
  ShiftAnomalyFlag,
} from '@pos-tercos/types';
import { formatCop, formatDate } from '../../../lib/format';

const FLAG_LABEL: Record<ShiftAnomalyFlag, string> = {
  diff_high: 'Descuadre fuera de norma',
  voids_high: 'Anulaciones fuera de norma',
  noSale_high: 'Aperturas de cajón sin venta fuera de norma',
};

export function AnomaliesView({ data }: { data: CashierAnomalies[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-input bg-card p-12 text-center text-sm text-muted-foreground">
        Aún no hay turnos cerrados para analizar.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {data.map((c) => (
        <CashierBlock key={c.cashierId} c={c} />
      ))}
    </div>
  );
}

function CashierBlock({ c }: { c: CashierAnomalies }) {
  const recent = c.shifts[0];
  const recentFlags = recent?.flags ?? [];
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            {c.cashierName ?? '—'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {c.totalShifts} turno{c.totalShifts === 1 ? '' : 's'} cerrados
          </p>
        </div>
        {recentFlags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {recentFlags.map((f) => (
              <span
                key={f}
                className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive"
              >
                ⚠ {FLAG_LABEL[f]}
              </span>
            ))}
          </div>
        ) : c.baseline !== null ? (
          <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">
            ✓ Sin anomalías
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
            Sin historial suficiente (se necesitan 5 turnos o más)
          </span>
        )}
      </header>

      {c.baseline !== null ? (
        <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
          <BaselineCard
            label="Descuadre prom."
            value={`±${formatCop(c.baseline.avgDiff)}`}
            hint={`σ ${formatCop(c.baseline.stdDiff)}`}
          />
          <BaselineCard
            label="Anulaciones / turno"
            value={c.baseline.avgVoids.toFixed(1)}
            hint={`σ ${c.baseline.stdVoids.toFixed(2)}`}
          />
          <BaselineCard
            label="Cajón sin venta / turno"
            value={c.baseline.avgNoSale.toFixed(1)}
            hint={`σ ${c.baseline.stdNoSale.toFixed(2)}`}
          />
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-md border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/40">
            <tr>
              <Th>Turno (apertura)</Th>
              <Th align="right">Descuadre</Th>
              <Th align="right">Anulaciones</Th>
              <Th align="right">Cajón sin venta</Th>
              <Th>Alertas</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {c.shifts.map((s, idx) => (
              <tr
                key={s.shiftId}
                className={idx === 0 && s.flags.length > 0 ? 'bg-destructive/10' : ''}
              >
                <Td>{formatDate(s.openedAt, 'datetime')}</Td>
                <Td align="right" mono>
                  {s.difference !== null ? (
                    <span
                      className={
                        Math.abs(s.difference) >= 5000 ? 'font-bold text-destructive' : ''
                      }
                    >
                      {s.difference > 0 ? '+' : ''}
                      {formatCop(s.difference)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Td>
                <Td align="right" mono>
                  {s.voidCount > 0 ? (
                    <span className="font-medium text-warning">{s.voidCount}</span>
                  ) : (
                    s.voidCount
                  )}
                </Td>
                <Td align="right" mono>
                  {s.noSaleCount > 0 ? (
                    <span className="font-medium text-warning">{s.noSaleCount}</span>
                  ) : (
                    s.noSaleCount
                  )}
                </Td>
                <Td>
                  {s.flags.length > 0 ? (
                    <span className="text-xs text-destructive">
                      {s.flags.map((f) => FLAG_LABEL[f]).join(' · ')}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BaselineCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2 text-foreground ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}
