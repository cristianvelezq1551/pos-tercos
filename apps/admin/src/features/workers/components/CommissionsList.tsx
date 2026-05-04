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
        <p className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          Aún no hay comisiones configuradas.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Trabajador</Th>
                <Th>Tipo</Th>
                <Th align="right">Valor</Th>
                <Th>Vigente desde</Th>
                <Th>Notas</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
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
                  <Td>{c.notes ?? <span className="text-gray-400">—</span>}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-[11px] text-gray-600">
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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Nueva comisión</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="block text-gray-600">Trabajador</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
          >
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.fullName} · {w.role}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">Tipo</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as WorkerCommissionType)}
            className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
          >
            <option value="PERCENT_OF_SHIFT">% del turno (cajero)</option>
            <option value="FIXED_PER_SALE">$ fijo por venta</option>
          </select>
        </label>
        {type === 'PERCENT_OF_SHIFT' ? (
          <label className="text-sm">
            <span className="block text-gray-600">Porcentaje (1–99)</span>
            <input
              type="number"
              min={0.1}
              max={99.9}
              step={0.1}
              value={percentInput}
              onChange={(e) => setPercentInput(e.target.value)}
              placeholder="2.5"
              className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
            />
          </label>
        ) : (
          <label className="text-sm">
            <span className="block text-gray-600">Monto en COP</span>
            <input
              type="number"
              min={1}
              step={1}
              value={fixedAmount}
              onChange={(e) => setFixedAmount(e.target.value)}
              placeholder="1000"
              className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
            />
          </label>
        )}
        <label className="text-sm">
          <span className="block text-gray-600">Notas (opcional)</span>
          <input
            type="text"
            value={notes}
            maxLength={500}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. ajuste por buen desempeño"
            className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? 'Creando…' : 'Crear comisión'}
        </Button>
      </div>
      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: WorkerCommissionType }) {
  const cfg =
    type === 'PERCENT_OF_SHIFT'
      ? { label: '% turno', cls: 'bg-blue-50 text-blue-700 ring-blue-600/20' }
      : { label: '$ por venta', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}
function Td({ children, align, mono }: { children: React.ReactNode; align?: 'right'; mono?: boolean }) {
  return (
    <td className={`px-4 py-3 text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'} ${mono ? 'tabular-nums' : ''}`}>
      {children}
    </td>
  );
}
