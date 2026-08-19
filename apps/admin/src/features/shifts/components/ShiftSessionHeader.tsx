import type { ShiftSessionDetail } from '@pos-tercos/types';
import { formatCop, formatDate } from '../../../lib/format';
import { ReopenShiftButton } from './ReopenShiftButton';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Abierta',
  CLOSED: 'Cerrada',
  RECONCILED: 'Reconciliada',
};

/** Duración legible de la caja (cierre − apertura, o tiempo en curso). */
function formatDuration(openedAt: string, closedAt: string | null): string {
  const start = new Date(openedAt).getTime();
  const end = (closedAt ? new Date(closedAt) : new Date()).getTime();
  const mins = Math.max(0, Math.round((end - start) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function ShiftSessionHeader({ shift }: { shift: ShiftSessionDetail['shift'] }) {
  const isClosed = shift.status === 'CLOSED';
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="caps text-xs text-muted-foreground">Abrió la caja</p>
          <p className="text-lg font-semibold text-foreground">
            {shift.cashierName ?? '—'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Apertura {formatDate(shift.openedAt, 'datetime')}
            {shift.closedAt
              ? ` · Cierre ${formatDate(shift.closedAt, 'datetime')}`
              : ' · sin cerrar'}
            {' · '}
            <span className={shift.closedAt ? '' : 'text-warning'}>
              {shift.closedAt ? 'Duración' : 'Lleva abierta'}{' '}
              {formatDuration(shift.openedAt, shift.closedAt)}
            </span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground ring-1 ring-inset ring-border">
            {STATUS_LABEL[shift.status] ?? shift.status}
          </span>
          {isClosed ? <ReopenShiftButton shiftId={shift.id} /> : null}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CashStat label="Apertura" value={shift.openingCash} />
        <CashStat label="Efectivo esperado" value={shift.expectedCash} />
        <CashStat label="Efectivo contado" value={shift.countedCash} />
        <DiffStat value={shift.difference} />
      </div>
      {shift.notes ? (
        <p className="mt-4 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Notas: </span>
          {shift.notes}
        </p>
      ) : null}
    </section>
  );
}

function CashStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="caps text-[0.625rem] text-muted-foreground">{label}</p>
      <p className="text-base font-semibold tabular-nums text-foreground">
        {value !== null ? formatCop(value) : '—'}
      </p>
    </div>
  );
}

function DiffStat({ value }: { value: number | null }) {
  const tone =
    value === null || Math.abs(value) < 1
      ? 'text-foreground'
      : Math.abs(value) >= 5000
        ? value < 0
          ? 'text-destructive'
          : 'text-warning'
        : value < 0
          ? 'text-destructive'
          : 'text-warning';
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="caps text-[0.625rem] text-muted-foreground">Diferencia en efectivo</p>
      <p className={`text-base font-semibold tabular-nums ${tone}`}>
        {value === null
          ? '—'
          : `${value > 0 ? '+' : ''}${formatCop(value)}`}
      </p>
    </div>
  );
}
