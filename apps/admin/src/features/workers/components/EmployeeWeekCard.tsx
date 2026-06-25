'use client';

import type { WeeklyPayrollEntry } from '@pos-tercos/types';
import { Badge, Button, Card, Money, cn } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { roleLabel } from '../lib/format';
import { EmployeeActions } from './EmployeeActions';
import { PayWeekModal } from './PayWeekModal';
import { WeekDayGrid, isSelectable } from './WeekDayGrid';
import { WeekPaymentsList } from './WeekPaymentsList';
import { WeeklyAdjustments } from './WeeklyAdjustments';

export function EmployeeWeekCard({
  entry,
  weekStart,
}: {
  entry: WeeklyPayrollEntry;
  weekStart: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payOpen, setPayOpen] = useState(false);

  const selectableDays = useMemo(() => entry.days.filter(isSelectable), [entry.days]);
  const selectedTotal = useMemo(
    () => entry.days.filter((d) => selected.has(d.date)).reduce((a, d) => a + d.amount, 0),
    [entry.days, selected],
  );

  const toggle = (date: string): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const selectAllPending = (): void => setSelected(new Set(selectableDays.map((d) => d.date)));
  const clear = (): void => setSelected(new Set());

  return (
    <Card className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-display text-base font-bold tracking-tight text-foreground">
              {entry.fullName}
            </p>
            <Badge tone={entry.payType === 'MONTHLY' ? 'info' : 'neutral'} size="sm">
              {entry.payType === 'MONTHLY' ? 'Mensual' : 'Diario'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {roleLabel(entry.role)} · <Money amount={entry.valuePerDay} size="xs" />/día
            {entry.payType === 'MONTHLY' ? ' (prorrateado)' : ''}
          </p>
        </div>
        <div className="text-right text-xs">
          <p className="text-muted-foreground">
            Días: <Money amount={entry.owedTotal} size="xs" weight="medium" />
            {entry.adjustmentsTotal !== 0 ? (
              <>
                {' · Ajustes: '}
                <Money amount={entry.adjustmentsTotal} size="xs" weight="medium" />
                {' · Neto: '}
                <Money amount={entry.netOwed} size="xs" weight="semibold" />
              </>
            ) : null}
          </p>
          <p className="text-muted-foreground">
            Pagado: <Money amount={entry.paidTotal} size="xs" weight="medium" />
          </p>
          <p className={cn('font-semibold', entry.remaining > 0 ? 'text-warning' : 'text-success')}>
            {entry.remaining > 0 ? (
              <>
                Falta <Money amount={entry.remaining} size="xs" weight="bold" />
              </>
            ) : (
              'Semana saldada'
            )}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {entry.terminationDate ? (
          <Badge tone="warning" size="sm">Empleo terminado</Badge>
        ) : (
          <span />
        )}
        <EmployeeActions entry={entry} />
      </div>

      <WeekDayGrid entry={entry} selected={selected} onToggle={toggle} />

      <WeeklyAdjustments userId={entry.userId} weekStart={weekStart} adjustments={entry.adjustments} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={selectAllPending}
          disabled={selectableDays.length === 0}
        >
          Seleccionar pendientes
        </Button>
        {selected.size > 0 ? (
          <Button size="sm" variant="ghost" onClick={clear}>
            Limpiar
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button size="sm" onClick={() => setPayOpen(true)} disabled={entry.remaining <= 0}>
          {selected.size > 0 ? (
            <>
              Pagar {selected.size} día{selected.size > 1 ? 's' : ''} ·{' '}
              <Money amount={Math.min(selectedTotal, entry.remaining)} size="xs" weight="bold" />
            </>
          ) : (
            <>
              Abonar · <Money amount={entry.remaining} size="xs" weight="bold" />
            </>
          )}
        </Button>
      </div>

      {entry.payments.length > 0 ? <WeekPaymentsList payments={entry.payments} /> : null}

      {payOpen ? (
        <PayWeekModal
          userId={entry.userId}
          workerName={entry.fullName}
          weekStart={weekStart}
          days={Array.from(selected).sort()}
          suggested={selected.size > 0 ? Math.min(selectedTotal, entry.remaining) : entry.remaining}
          remaining={entry.remaining}
          onClose={() => setPayOpen(false)}
          onSuccess={() => {
            setPayOpen(false);
            clear();
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}
