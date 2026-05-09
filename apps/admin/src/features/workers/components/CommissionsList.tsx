'use client';

import type { WorkerCommission, WorkerCommissionType } from '@pos-tercos/types';
import type { WorkerOption } from './CheckInForm';
import { Button } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatCop, formatNumber } from '../../../lib/format';
import { createCommission } from '../api';

interface CommissionsListProps {
  commissions: WorkerCommission[];
  workers: WorkerOption[];
}

export function CommissionsList({ commissions, workers }: CommissionsListProps) {
  return (
    <div className="space-y-4">
      <NewCommissionForm workers={workers} />
      {commissions.length === 0 ? (
        <p className="rounded-md border border-dashed border-input bg-card p-6 text-center text-sm text-muted-foreground">
          Aún no hay comisiones configuradas.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40">
              <tr>
                <Th>Trabajador</Th>
                <Th>Tipo</Th>
                <Th align="right">Valor</Th>
                <Th>Vigente desde</Th>
                <Th>Notas</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {commissions.map((c) => (
                <tr key={c.id}>
                  <Td>{c.userFullName ?? c.userId}</Td>
                  <Td>
                    <TypeBadge type={c.type} />
                  </Td>
                  <Td mono align="right">
                    {c.type === 'PERCENT_OF_SHIFT' && c.percent !== null
                      ? `${formatNumber(c.percent * 100, { decimals: 2 })}%`
                      : c.fixedAmount !== null
                        ? formatCop(c.fixedAmount)
                        : '—'}
                  </Td>
                  <Td mono>{new Date(c.appliedAt).toLocaleString('es-CO')}</Td>
                  <Td>{c.notes ?? <span className="text-muted-foreground">—</span>}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
            Histórico inmutable: cada cambio crea una nueva fila. La vigente
            es la <code>appliedAt</code> más reciente.
          </div>
        </div>
      )}
    </div>
  );
}

function NewCommissionForm({ workers }: { workers: WorkerOption[] }) {
  const router = useRouter();
  const [userId, setUserId] = useState<string>(workers[0]?.id ?? '');
  const [type, setType] = useState<WorkerCommissionType>('PERCENT_OF_SHIFT');
  const [percentInput, setPercentInput] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!userId) return;
    setError(null);
    setPending(true);
    try {
      const payload =
        type === 'PERCENT_OF_SHIFT'
          ? {
              type,
              percent: Number(percentInput) / 100,
              ...(notes && { notes }),
            }
          : {
              type,
              fixedAmount: Number(fixedAmount),
              ...(notes && { notes }),
            };
      await createCommission(userId, payload);
      setPercentInput('');
      setFixedAmount('');
      setNotes('');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setPending(false);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Nueva comisión</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="block text-muted-foreground">Trabajador</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-card px-2 text-sm"
          >
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.fullName} · {w.role}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-muted-foreground">Tipo</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as WorkerCommissionType)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="PERCENT_OF_SHIFT">% del turno (cajero)</option>
            <option value="FIXED_PER_SALE">$ fijo por venta</option>
          </select>
        </label>
        {type === 'PERCENT_OF_SHIFT' ? (
          <label className="text-sm">
            <span className="block text-muted-foreground">Porcentaje (1–99)</span>
            <input
              type="number"
              min={0.1}
              max={99.9}
              step={0.1}
              value={percentInput}
              onChange={(e) => setPercentInput(e.target.value)}
              placeholder="2.5"
              className="mt-1 h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
            />
          </label>
        ) : (
          <label className="text-sm">
            <span className="block text-muted-foreground">Monto en COP</span>
            <input
              type="number"
              min={1}
              step={1}
              value={fixedAmount}
              onChange={(e) => setFixedAmount(e.target.value)}
              placeholder="1000"
              className="mt-1 h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
            />
          </label>
        )}
        <label className="text-sm">
          <span className="block text-muted-foreground">Notas (opcional)</span>
          <input
            type="text"
            value={notes}
            maxLength={500}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. ajuste por buen desempeño"
            className="mt-1 h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? 'Creando…' : 'Crear comisión'}
        </Button>
      </div>
      {error && (
        <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: WorkerCommissionType }) {
  const cfg =
    type === 'PERCENT_OF_SHIFT'
      ? { label: '% turno', cls: 'bg-destructive/10 text-primary ring-primary/20' }
      : { label: '$ por venta', cls: 'bg-success-bg/30 text-success ring-success-border' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}
function Td({ children, align, mono }: { children: React.ReactNode; align?: 'right'; mono?: boolean }) {
  return (
    <td className={`px-4 py-3 text-foreground ${align === 'right' ? 'text-right' : 'text-left'} ${mono ? 'tabular-nums' : ''}`}>
      {children}
    </td>
  );
}
