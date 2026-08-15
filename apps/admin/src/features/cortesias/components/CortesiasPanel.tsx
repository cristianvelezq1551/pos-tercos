'use client';

import type { CortesiaGivenSummary, CortesiaRequest, CortesiaStatus } from '@pos-tercos/types';
import { Badge, Button, Card, EmptyState, Input, Money, cn, formatCop, formatDate } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import {
  approveCortesia,
  getCortesiaGivenSummary,
  listCortesias,
  rejectCortesia,
  reverseCortesia,
} from '../api/client';

const TABS: { key: string; label: string; status?: CortesiaStatus }[] = [
  { key: 'APPROVED', label: 'Registradas', status: 'APPROVED' },
  { key: 'REVERSED', label: 'Anuladas', status: 'REVERSED' },
  { key: 'PENDING', label: 'Sin revisar', status: 'PENDING' },
  { key: 'ALL', label: 'Todas' },
];

const STATUS_TONE: Record<CortesiaStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  REVERSED: 'neutral',
};
const EMPTY_SUMMARY: CortesiaGivenSummary = {
  year: 0,
  month: 0,
  monthLabel: '',
  total: 0,
  count: 0,
  partial: false,
  estimatedCost: 0,
};

const STATUS_LABEL: Record<CortesiaStatus, string> = {
  PENDING: 'Sin revisar',
  APPROVED: 'Registrada',
  REJECTED: 'Rechazada',
  REVERSED: 'Anulada',
};

export function CortesiasPanel({ initial }: { initial: CortesiaRequest[] }) {
  const [tab, setTab] = useState('APPROVED');
  const [rows, setRows] = useState<CortesiaRequest[]>(initial);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // El tipo REAL del resumen, no una copia local: un shape propio por componente
  // se desincroniza en cuanto el backend agrega un campo (§7.v31).
  const [monthTotal, setMonthTotal] = useState<CortesiaGivenSummary>(EMPTY_SUMMARY);

  const refresh = useCallback(async (key: string) => {
    const status = TABS.find((t) => t.key === key)?.status;
    try {
      setRows(await listCortesias(status));
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, 'Error cargando solicitudes'));
    }
  }, []);

  // KPI: total dado en cortesías (autorizadas) del mes — MISMO costo FIFO que la
  // línea "Cortesías" del estado financiero (misma ventana, misma valuación).
  const loadSummary = useCallback(async () => {
    try {
      setMonthTotal(await getCortesiaGivenSummary());
    } catch {
      // sin red: dejar el KPI como está.
    }
  }, []);

  useEffect(() => {
    void refresh(tab);
  }, [tab, refresh]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const resolve = async (id: string, action: 'approve' | 'reject' | 'reverse') => {
    const note = notes[id]?.trim() || undefined;
    setBusyId(id);
    try {
      if (action === 'approve') await approveCortesia(id, note);
      else if (action === 'reject') await rejectCortesia(id, note);
      else await reverseCortesia(id, note);
      await Promise.all([refresh(tab), loadSummary()]);
    } catch (e) {
      setError(getErrorMessage(e, 'Error resolviendo la cortesía'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="caps text-[0.625rem] text-muted-foreground">
              Dado en cortesías · {monthTotal.monthLabel || 'este mes'}
            </p>
            <p className="mt-0.5 font-display text-2xl font-bold tabular-nums text-foreground">
              {formatCop(monthTotal.total)}
              {monthTotal.estimatedCost > 0 ? (
                <span className="ml-2 align-middle text-xs font-semibold text-warning">
                  aprox.
                </span>
              ) : null}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>{monthTotal.count} registrada{monthTotal.count === 1 ? '' : 's'}</p>
            <p className="mt-0.5">costo FIFO · coincide con Estado financiero</p>
          </div>
        </div>
        {monthTotal.estimatedCost > 0 ? (
          <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
            {formatCop(monthTotal.estimatedCost)} de este total es un{' '}
            <strong>estimado</strong>: se regaló producto con insumos que no estaban cargados en
            inventario, así que se valuaron al último precio de compra conocido. Se corrige solo
            cuando subas la factura.
          </p>
        ) : null}
        {monthTotal.partial ? (
          <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
            Alguna cortesía tiene insumos sin ningún precio de compra en el sistema, así que este
            total está <strong>subestimado</strong>. Registra una compra de esos insumos.
          </p>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              tab === t.key
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted/40',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="Sin cortesías en este filtro" size="sm" />
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <Card key={c.id} className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {c.quantity}× {c.productName ?? 'Producto'}
                    {c.sizeName ? ` · ${c.sizeName}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.reason}</p>
                  <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                    {c.requestedByName ?? 'Cajero'} · {formatDate(c.createdAt, 'datetime')}
                    {c.resolvedByName ? ` · revisada por ${c.resolvedByName}` : ''}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
              </div>

              <div className="flex items-center gap-3 border-t border-border pt-2 text-xs text-muted-foreground">
                {c.status === 'APPROVED' ? (
                  <span
                    title={
                      c.fifoCostEstimated
                        ? 'Parte de este costo se valuó al último precio de compra: los insumos no estaban cargados. Se corrige al subir la factura.'
                        : 'Costo real FIFO — el mismo del estado financiero'
                    }
                  >
                    Costo (FIFO):{' '}
                    {c.fifoCost != null ? (
                      <>
                        <Money amount={c.fifoCost} className="text-xs" weight="semibold" />
                        {c.fifoCostEstimated ? (
                          <span className="ml-1 font-semibold text-warning">· estimado</span>
                        ) : null}
                      </>
                    ) : (
                      <span>s/d</span>
                    )}
                  </span>
                ) : c.status === 'PENDING' ? (
                  <span title="Estimado; el costo real (FIFO) se fija al autorizar">
                    ≈ Costo est.:{' '}
                    {c.costAmount !== null ? (
                      <Money amount={c.costAmount} className="text-xs" />
                    ) : (
                      <span>s/d</span>
                    )}
                  </span>
                ) : null}
                <span>
                  Precio venta: <Money amount={c.salePrice} className="text-xs" />
                </span>
              </div>

              {c.status === 'PENDING' ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    type="text"
                    value={notes[c.id] ?? ''}
                    onChange={(e) => setNotes((p) => ({ ...p, [c.id]: e.target.value }))}
                    placeholder="Nota (opcional, sobre todo al rechazar)"
                    maxLength={200}
                    className="flex-1"
                  />
                  <span className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === c.id}
                      onClick={() => void resolve(c.id, 'reject')}
                    >
                      Rechazar
                    </Button>
                    <Button size="sm" disabled={busyId === c.id} onClick={() => void resolve(c.id, 'approve')}>
                      {busyId === c.id ? '…' : 'Autorizar'}
                    </Button>
                  </span>
                </div>
              ) : c.status === 'APPROVED' ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    type="text"
                    value={notes[c.id] ?? ''}
                    onChange={(e) => setNotes((p) => ({ ...p, [c.id]: e.target.value }))}
                    placeholder="Motivo de la anulación (opcional)"
                    maxLength={200}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === c.id}
                    onClick={() => void resolve(c.id, 'reverse')}
                    title="Anula la cortesía: devuelve el stock y la saca del costo de cortesías"
                  >
                    {busyId === c.id ? '…' : 'Anular'}
                  </Button>
                </div>
              ) : c.resolverNote ? (
                <p className="text-[0.6875rem] text-muted-foreground">Nota: {c.resolverNote}</p>
              ) : null}
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
