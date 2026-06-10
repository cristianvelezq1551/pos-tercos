'use client';

import type {
  EmployeePanel as Panel,
  ManagedUser,
  PanelDay,
  PanelPago,
  PanelQuincena,
  PayrollAdjustment,
} from '@pos-tercos/types';
import { Badge, Button, Money, formatCop } from '@pos-tercos/ui';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, UserX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EditSalaryDialog, TerminateDialog } from '../../users';
import { getEmployeePanel } from '../api/client';
import { PAY_TYPE_LABEL, roleLabel } from '../lib/format';
import { AdjustmentDialog } from './AdjustmentDialog';
import { DayGrid } from './DayGrid';
import { DeleteAdjustmentDialog } from './DeleteAdjustmentDialog';
import { PaymentActions } from './PaymentActions';
import { PayrollDayDialog } from './PayrollDayDialog';

type Modal =
  | { kind: 'salary' }
  | { kind: 'terminate' }
  | { kind: 'day'; day: PanelDay }
  | { kind: 'adjustment'; periodStart: string; label: string }
  | { kind: 'deleteAdjustment'; adjustment: PayrollAdjustment }
  | null;

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', timeZone: 'UTC' });

export function EmployeePanel({ userId }: { userId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  const load = useCallback(async () => {
    try {
      setPanel(await getEmployeePanel(userId, year, month));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el panel.');
    }
  }, [userId, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = (): void => {
    setModal(null);
    void load();
  };
  const onUserChanged = (_u: ManagedUser): void => refresh();

  const shiftMonth = (delta: number): void => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  if (error) {
    return <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>;
  }
  if (!panel) {
    return <p className="px-1 py-8 text-center text-sm text-muted-foreground">Cargando…</p>;
  }

  const isDaily = panel.payType === 'DAILY';
  const terminated = panel.terminationDate !== null;

  return (
    <div className="space-y-6">
      {/* Encabezado del empleado */}
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">{panel.userFullName}</h2>
            <Badge tone="neutral" size="sm">{roleLabel(panel.userRole)}</Badge>
            {panel.payType ? (
              <Badge tone={isDaily ? 'neutral' : 'info'} size="sm">{PAY_TYPE_LABEL[panel.payType]}</Badge>
            ) : null}
            {terminated ? <Badge tone="warning" size="sm">Empleo terminado</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {panel.salaryAmount != null
              ? `${formatCop(panel.salaryAmount)} ${isDaily ? '/ día' : '/ mes'}`
              : 'Sin salario configurado'}
            {panel.hireDate ? ` · desde ${fmtDate(panel.hireDate)}` : ''}
            {panel.terminationDate ? ` · salida ${fmtDate(panel.terminationDate)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setModal({ kind: 'salary' })}>
            <Pencil className="h-4 w-4" /> Editar salario
          </Button>
          {!terminated ? (
            <Button variant="outline" size="sm" onClick={() => setModal({ kind: 'terminate' })}>
              <UserX className="h-4 w-4" /> Terminar empleo
            </Button>
          ) : null}
        </div>
      </header>

      {/* Navegación de mes + total */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-40 text-center font-display text-lg font-bold capitalize text-foreground">
            {panel.monthLabel}
          </span>
          <Button variant="ghost" size="sm" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-2">
          <span className="text-xs text-muted-foreground">Total del mes</span>{' '}
          <Money amount={panel.monthTotal} weight="bold" />
        </div>
      </div>

      {/* Quincenas (siempre 2) × Sub-pagos (siempre 2 por quincena). Las
          mismas acciones de pago de /workers/payroll también acá (compactas,
          icon-only) para no tener que saltar entre pantallas. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {panel.quincenas.map((q) => (
          <QuincenaSection
            key={q.quincena}
            quincena={q}
            workerName={panel.userFullName}
            userId={panel.userId}
            isDaily={isDaily}
            onAddAdjustment={(pago) =>
              setModal({ kind: 'adjustment', periodStart: pago.periodStart, label: pago.label })
            }
            onDeleteAdjustment={(adj) => setModal({ kind: 'deleteAdjustment', adjustment: adj })}
            onPaymentChanged={refresh}
          />
        ))}
      </div>

      {/* Días del mes (modalidad diaria) */}
      {isDaily ? (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <h3 className="font-semibold text-foreground">Días del mes</h3>
            <p className="text-xs text-muted-foreground">
              Los días se cuentan automáticamente al valor por defecto. Toca un día solo para
              registrar una excepción: no asistió o trabajó un monto distinto. Los días marcados
              como descanso cíclico no se pagan.
            </p>
          </div>
          {panel.days.length === 0 ? (
            <p className="text-sm text-ink-300">Sin días en este mes (revisa fecha de ingreso/salida).</p>
          ) : (
            <DayGrid days={panel.days} onPick={(day) => setModal({ kind: 'day', day })} />
          )}
        </section>
      ) : null}

      {/* Diálogos */}
      {modal?.kind === 'salary' && (
        <EditSalaryDialog
          user={{
            id: panel.userId,
            fullName: panel.userFullName,
            payType: panel.payType,
            salaryAmount: panel.salaryAmount,
            hireDate: panel.hireDate,
            restDaysOfWeek: panel.restDaysOfWeek,
          }}
          onClose={() => setModal(null)}
          onSuccess={onUserChanged}
        />
      )}
      {modal?.kind === 'terminate' && (
        <TerminateDialog user={{ id: panel.userId, fullName: panel.userFullName }} onClose={() => setModal(null)} onSuccess={onUserChanged} />
      )}
      {modal?.kind === 'day' && (
        <PayrollDayDialog
          userId={userId}
          defaultAmount={panel.salaryAmount ?? 0}
          day={modal.day}
          onClose={() => setModal(null)}
          onSuccess={refresh}
        />
      )}
      {modal?.kind === 'adjustment' && (
        <AdjustmentDialog userId={userId} periodStart={modal.periodStart} periodLabel={modal.label} onClose={() => setModal(null)} onSuccess={refresh} />
      )}
      {modal?.kind === 'deleteAdjustment' && (
        <DeleteAdjustmentDialog adjustment={modal.adjustment} onClose={() => setModal(null)} onSuccess={refresh} />
      )}
    </div>
  );
}

/** Tarjeta de una quincena con sus 2 sub-pagos. */
function QuincenaSection({
  quincena,
  workerName,
  userId,
  isDaily,
  onAddAdjustment,
  onDeleteAdjustment,
  onPaymentChanged,
}: {
  quincena: PanelQuincena;
  workerName: string;
  userId: string;
  isDaily: boolean;
  onAddAdjustment: (pago: PanelPago) => void;
  onDeleteAdjustment: (adj: PayrollAdjustment) => void;
  onPaymentChanged: () => void;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground">{quincena.label}</h3>
        <Money amount={quincena.subtotal} size="xl" weight="bold" />
      </header>
      <div className="space-y-2">
        {quincena.pagos.map((pago) => (
          <PagoRow
            key={pago.periodStart}
            pago={pago}
            workerName={workerName}
            userId={userId}
            isDaily={isDaily}
            onAdd={() => onAddAdjustment(pago)}
            onDeleteAdjustment={onDeleteAdjustment}
            onPaymentChanged={onPaymentChanged}
          />
        ))}
      </div>
    </section>
  );
}

function PagoRow({
  pago,
  workerName,
  userId,
  isDaily,
  onAdd,
  onDeleteAdjustment,
  onPaymentChanged,
}: {
  pago: PanelPago;
  workerName: string;
  userId: string;
  isDaily: boolean;
  onAdd: () => void;
  onDeleteAdjustment: (adj: PayrollAdjustment) => void;
  onPaymentChanged: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{pago.label}</span>
          <PaymentActions
            compact
            userId={userId}
            periodStart={pago.periodStart}
            periodEnd={pago.periodEnd}
            workerName={workerName}
            total={pago.total}
            payment={pago.payment}
            onChanged={onPaymentChanged}
          />
        </div>
        <Money amount={pago.total} weight="semibold" />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Base {formatCop(pago.base)} ·{' '}
        {isDaily ? `${pago.daysWorked} días trabajados` : `${pago.daysEmployed} días empleado`}
      </p>
      <div className="mt-2 border-t border-border pt-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Novedades
          </span>
          <Button variant="ghost" size="sm" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" /> Agregar
          </Button>
        </div>
        {pago.adjustments.length === 0 ? (
          <p className="text-xs text-ink-300">Sin novedades.</p>
        ) : (
          <ul className="space-y-1">
            {pago.adjustments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {a.concept}
                  {a.note ? <span className="text-muted-foreground"> · {a.note}</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`tabular-nums ${a.amount < 0 ? 'text-destructive' : 'text-success'}`}>
                    {formatCop(a.amount)}
                  </span>
                  <button
                    type="button"
                    aria-label="Quitar novedad"
                    onClick={() => onDeleteAdjustment(a)}
                    className="text-ink-400 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
