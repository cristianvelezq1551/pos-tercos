'use client';

import type { WorkerAttendance } from '@pos-tercos/types';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Quantity,
  formatDate,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkOut } from '../api';

interface AttendanceTableProps {
  attendance: WorkerAttendance[];
}

export function AttendanceTable({ attendance }: AttendanceTableProps) {
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorByRow, setErrorByRow] = useState<Record<string, string>>({});

  const targetRow = attendance.find((a) => a.id === confirmId) ?? null;

  const handleCheckOut = async (id: string) => {
    setPendingId(id);
    setErrorByRow((prev) => ({ ...prev, [id]: '' }));
    try {
      await checkOut(id, {});
      router.refresh();
    } catch (e) {
      setErrorByRow((prev) => ({ ...prev, [id]: (e as Error).message }));
    } finally {
      setPendingId(null);
      setConfirmId(null);
    }
  };

  const columns: DataTableColumn<WorkerAttendance>[] = [
    {
      key: 'worker',
      header: 'Trabajador',
      cell: (a) => <span className="font-medium text-foreground">{a.userFullName ?? '—'}</span>,
    },
    {
      key: 'role',
      header: 'Rol',
      hideOnMobile: true,
      cell: (a) => <span className="text-xs text-muted-foreground">{a.userRole ?? '—'}</span>,
    },
    {
      key: 'checkIn',
      header: 'Check-in',
      numeric: true,
      cell: (a) => (
        <span className="tabular text-sm">{formatDate(a.checkIn, 'datetime')}</span>
      ),
    },
    {
      key: 'checkOut',
      header: 'Check-out',
      numeric: true,
      cell: (a) =>
        a.checkOut ? (
          <span className="tabular text-sm">{formatDate(a.checkOut, 'datetime')}</span>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
    {
      key: 'hours',
      header: 'Horas',
      align: 'right',
      numeric: true,
      cell: (a) =>
        a.hoursWorked === null ? (
          <span className="text-ink-400">—</span>
        ) : (
          <Quantity value={a.hoursWorked} decimals={2} />
        ),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (a) =>
        a.checkOut === null ? (
          <Badge tone="warning" size="sm" withDot>
            Abierto
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm">
            Cerrado
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (a) => {
        if (a.checkOut !== null) return null;
        const error = errorByRow[a.id];
        return (
          <div className="flex flex-col items-end gap-0.5">
            <Button
              size="sm"
              onClick={() => setConfirmId(a.id)}
              disabled={pendingId === a.id}
            >
              {pendingId === a.id ? 'Cerrando…' : 'Check-out'}
            </Button>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <DataTable
        rows={attendance}
        rowKey={(a) => a.id}
        columns={columns}
        emptyState={
          <EmptyState
            illustration={<LineArtIllustration name="empty-plate" />}
            title="Sin registros de asistencia"
          />
        }
      />
      <ConfirmDialog
        open={confirmId !== null}
        onCancel={() => setConfirmId(null)}
        onConfirm={() => (confirmId ? handleCheckOut(confirmId) : undefined)}
        pending={pendingId !== null}
        title="¿Cerrar turno?"
        description={
          targetRow
            ? `Vas a cerrar el turno de ${targetRow.userFullName ?? targetRow.userId}.`
            : ''
        }
        confirmLabel="Sí, cerrar"
      />
    </>
  );
}
