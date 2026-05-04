'use client';

import type { WorkerAttendance } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatNumber } from '../../../lib/format';
import { checkOut } from '../api';

interface AttendanceTableProps {
  attendance: WorkerAttendance[];
}

export function AttendanceTable({ attendance }: AttendanceTableProps) {
  if (attendance.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm text-gray-700">Sin registros de asistencia.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Trabajador</Th>
            <Th>Rol</Th>
            <Th>Check-in</Th>
            <Th>Check-out</Th>
            <Th align="right">Horas</Th>
            <Th>Estado</Th>
            <Th align="right">Acciones</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {attendance.map((a) => (
            <Row key={a.id} a={a} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ a }: { a: WorkerAttendance }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckOut = async () => {
    if (!confirm(`¿Cerrar turno de ${a.userFullName ?? a.userId}?`)) return;
    setPending(true);
    setError(null);
    try {
      await checkOut(a.id, {});
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  };

  const isOpen = a.checkOut === null;
  return (
    <tr className="transition-colors hover:bg-gray-50">
      <Td>
        <span className="font-medium text-gray-900">{a.userFullName ?? '—'}</span>
      </Td>
      <Td><span className="text-xs text-gray-600">{a.userRole ?? '—'}</span></Td>
      <Td mono>{formatDateTime(a.checkIn)}</Td>
      <Td mono>{a.checkOut ? formatDateTime(a.checkOut) : <span className="text-gray-400">—</span>}</Td>
      <Td mono align="right">
        {a.hoursWorked === null ? (
          <span className="text-gray-400">—</span>
        ) : (
          formatNumber(a.hoursWorked, { decimals: 2 })
        )}
      </Td>
      <Td>
        {isOpen ? (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
            Abierto
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200">
            Cerrado
          </span>
        )}
      </Td>
      <Td align="right">
        {isOpen ? (
          <Button size="sm" onClick={handleCheckOut} disabled={pending}>
            {pending ? 'Cerrando…' : 'Check-out'}
          </Button>
        ) : null}
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      </Td>
    </tr>
  );
}

function formatDateTime(s: string): string {
  return new Date(s).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
