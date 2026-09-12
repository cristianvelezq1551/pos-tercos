import type { CashierAnomalies, ShiftAnomalyFlag } from '@pos-tercos/types';
import { DataTable, DateTimeCell, type DataTableColumn } from '@pos-tercos/ui';
import { formatCop } from '../../../lib/format';

const FLAG_LABEL: Record<ShiftAnomalyFlag, string> = {
  diff_high: 'Descuadre fuera de norma',
  voids_high: 'Anulaciones fuera de norma',
  noSale_high: 'Aperturas de cajón sin venta fuera de norma',
};

type Turno = CashierAnomalies['shifts'][number];

/**
 * Un campo AUSENTE y un campo en null no son lo mismo: ausente es un API que
 * todavía no lo manda (API y admin se despliegan por separado) y null es un
 * turno que cerró con un medio sin arquear. Si el campo no viene, las columnas
 * de cuenta y total no se dibujan — mostrarlas en "sin arquear" sería afirmar
 * algo que nadie dijo.
 */
function traeElTotal(shifts: CashierAnomalies['shifts']): boolean {
  return shifts.some((s) => s.totalDifference !== undefined);
}

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
  const marcados = c.shifts.filter((s) => s.flags.length > 0);
  const revisados = c.shifts.length;
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{c.cashierName ?? '—'}</h2>
          <p className="text-xs text-muted-foreground">
            {c.totalShifts} turno{c.totalShifts === 1 ? '' : 's'} cerrados
          </p>
        </div>
        {c.baseline === null ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
            Sin historial suficiente (se necesitan 5 turnos arqueados)
          </span>
        ) : marcados.length > 0 ? (
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
            {marcados.length} de {revisados} turnos se salen de lo normal
          </span>
        ) : (
          <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">
            Nada fuera de norma en los últimos {revisados} turnos
          </span>
        )}
      </header>

      {c.baseline !== null ? (
        <>
          <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
            <BaselineCard
              label="Descuadre habitual"
              value={`±${formatCop(c.baseline.typicalDiff ?? c.baseline.avgDiff)}`}
              hint={
                c.baseline.thresholdDiff !== undefined
                  ? `se marca por encima de ${formatCop(c.baseline.thresholdDiff)}`
                  : `σ ${formatCop(c.baseline.stdDiff)}`
              }
            />
            <BaselineCard
              label="Anulaciones / turno"
              value={(c.baseline.typicalVoids ?? c.baseline.avgVoids).toFixed(1)}
              hint={
                c.baseline.thresholdVoids !== undefined
                  ? `se marca por encima de ${c.baseline.thresholdVoids.toFixed(1)}`
                  : `σ ${c.baseline.stdVoids.toFixed(2)}`
              }
            />
            <BaselineCard
              label="Cajón sin venta / turno"
              value={(c.baseline.typicalNoSale ?? c.baseline.avgNoSale).toFixed(1)}
              hint={
                c.baseline.thresholdNoSale !== undefined
                  ? `se marca por encima de ${c.baseline.thresholdNoSale.toFixed(1)}`
                  : `σ ${c.baseline.stdNoSale.toFixed(2)}`
              }
            />
          </div>
          <p className="mt-2 text-[0.6875rem] leading-snug text-muted-foreground">
            Lo habitual se mide con la mediana de {c.baseline.sampleSize} turnos arqueados, para que
            un caso suelto no corra la vara. Nunca se marca por debajo de {formatCop(5000)}.
          </p>
        </>
      ) : null}

      <ShiftsAnomalyTable shifts={c.shifts} />
      {traeElTotal(c.shifts) ? (
        <p className="mt-2 text-[0.6875rem] leading-snug text-muted-foreground">
          Si el cajón quedó corto y la cuenta sobrada por el mismo monto, no falta plata: es un
          domicilio que el cliente transfirió y se pagó en efectivo del cajón. Regístralo en Caja y
          las dos puntas quedan en cero.
        </p>
      ) : null}
    </section>
  );
}

function BaselineCard({ label, value, hint }: { label: string; value: string; hint: string }) {
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

function Monto({ value, fuerte = false }: { value: number | null; fuerte?: boolean }) {
  if (value === null) return <span className="text-muted-foreground">sin arquear</span>;
  return (
    <span className={fuerte && Math.abs(value) >= 5000 ? 'font-bold text-destructive' : undefined}>
      {value > 0 ? '+' : ''}
      {formatCop(value)}
    </span>
  );
}

/** El histórico de turnos de un cajero. En teléfono cada turno es una
 *  tarjeta: las columnas de números no caben en 390 px. */
function ShiftsAnomalyTable({ shifts }: { shifts: CashierAnomalies['shifts'] }) {
  const num = { align: 'right', numeric: true } as const;
  const conTotal = traeElTotal(shifts);
  const columnasDeCuenta: DataTableColumn<Turno>[] = conTotal
    ? [
        {
          key: 'digital',
          header: 'Cuenta',
          ...num,
          cell: (s) => <Monto value={s.digitalDifference ?? null} />,
        },
        {
          key: 'total',
          header: 'Total',
          ...num,
          cell: (s) => <Monto value={s.totalDifference ?? null} fuerte />,
        },
      ]
    : [];
  const columns: DataTableColumn<Turno>[] = [
    {
      key: 'opened',
      header: 'Turno (apertura)',
      primary: true,
      cell: (s) => <DateTimeCell value={s.openedAt} className="text-sm text-foreground" />,
    },
    {
      key: 'difference',
      header: conTotal ? 'Cajón' : 'Descuadre',
      ...num,
      cell: (s) => <Monto value={s.difference} fuerte={!conTotal} />,
    },
    ...columnasDeCuenta,
    {
      key: 'voids',
      header: 'Anulaciones',
      ...num,
      cell: (s) =>
        s.voidCount > 0 ? <span className="font-medium text-warning">{s.voidCount}</span> : s.voidCount,
    },
    {
      key: 'noSale',
      header: 'Cajón sin venta',
      ...num,
      cell: (s) =>
        s.noSaleCount > 0 ? (
          <span className="font-medium text-warning">{s.noSaleCount}</span>
        ) : (
          s.noSaleCount
        ),
    },
    {
      key: 'flags',
      header: 'Alertas',
      cell: (s) =>
        s.flags.length > 0 ? (
          <span className="text-xs font-semibold text-destructive">
            {s.flags.map((f) => FLAG_LABEL[f]).join(' · ')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <DataTable rows={shifts} columns={columns} rowKey={(s) => s.shiftId} className="mt-4 rounded-md" />
  );
}
