import type { CashierAnomalies } from '@pos-tercos/types';
import { formatCop } from '../../../lib/format';
import { traeElTotal } from './anomalies-shared';
import { ShiftsAnomalyTable } from './ShiftsAnomalyTable';

/**
 * El umbral del negocio (§7.v20). La vista mide lo ANORMAL para cada persona,
 * así que un cajero que descuadra siempre lo mismo no se marca — esa es su
 * norma. Contar aparte los turnos que pasaron este umbral evita que la
 * pantalla se lea como "todo bien" cuando no lo está.
 */
const UMBRAL_DEL_NEGOCIO = 5_000;

function conDescuadreReal(shifts: CashierAnomalies['shifts']): number {
  return shifts.filter((s) => {
    const t = s.totalDifference ?? null;
    return t !== null && Math.abs(t) >= UMBRAL_DEL_NEGOCIO;
  }).length;
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
  const descuadrados = traeElTotal(c.shifts) ? conDescuadreReal(c.shifts) : 0;
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
            Sin historial suficiente (se necesitan 5 turnos cerrados)
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
              value={
                c.baseline.typicalDiff === null
                  ? '—'
                  : `±${formatCop(c.baseline.typicalDiff ?? c.baseline.avgDiff)}`
              }
              hint={
                c.baseline.typicalDiff === null
                  ? 'aún no hay 5 turnos arqueados: no se marca ningún descuadre'
                  : c.baseline.thresholdDiff !== undefined && c.baseline.thresholdDiff !== null
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
            Lo habitual se mide con la mediana de {c.baseline.arqueados ?? c.baseline.sampleSize}{' '}
            turnos arqueados, para que un caso suelto no corra la vara. Nunca se marca por debajo de{' '}
            {formatCop(UMBRAL_DEL_NEGOCIO)}.
          </p>
        </>
      ) : null}

      <ShiftsAnomalyTable shifts={c.shifts} />
      {descuadrados > 0 ? (
        <p className="mt-2 text-[0.6875rem] font-medium leading-snug text-warning">
          Aparte de lo anterior: {descuadrados} de {revisados} turnos cerraron con un descuadre de{' '}
          {formatCop(UMBRAL_DEL_NEGOCIO)} o más. Esta pantalla marca lo que se sale de lo HABITUAL de
          cada persona, así que un descuadre parejo no aparece como anomalía.
        </p>
      ) : null}
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
