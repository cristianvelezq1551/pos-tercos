import type { Shift } from '@pos-tercos/types';
import { DataTable, type DataTableColumn } from '@pos-tercos/ui';
import Link from 'next/link';
import { formatCop } from '../../../lib/format';
import { formatShiftWindow } from '../lib/format-shift-window';
import { shiftCloseTotals } from '../lib/shift-close-totals';
import { LegCell } from './ShiftsTableCells';

interface Props {
  shifts: Shift[];
}

const STATUS_LABEL: Record<Shift['status'], string> = {
  OPEN: 'Abierto',
  CLOSED: 'Cerrado',
  RECONCILED: 'Reconciliado',
};

const STATUS_TONE: Record<Shift['status'], string> = {
  OPEN: 'bg-success-bg/30 text-success ring-success-border',
  CLOSED: 'bg-muted text-foreground ring-gray-500/20',
  RECONCILED: 'bg-destructive/10 text-primary ring-primary/20',
};

export function ShiftsTable({ shifts }: Props) {
  if (shifts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-input bg-card p-12 text-center">
        <p className="text-sm font-medium text-foreground">Aún no hay turnos registrados.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Cuando un cajero abra turno desde la caja aparecerá aquí.
        </p>
      </div>
    );
  }

  const columns: DataTableColumn<Shift>[] = [
    {
      key: 'cashier',
      header: 'Cajero',
      primary: true,
      cell: (s) => (
        <Link href={`/shifts/${s.id}`} className="font-medium text-primary hover:underline">
          {s.cashierName ?? 'Ver sesión'}
        </Link>
      ),
    },
    {
      key: 'window',
      header: 'Turno',
      cell: (s) => (
        <>
          <p className="whitespace-nowrap text-foreground">
            {formatShiftWindow(s.openedAt, s.closedAt)}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            base {formatCop(s.openingCash)}
          </p>
        </>
      ),
    },
    {
      key: 'cash',
      header: 'Efectivo',
      align: 'right',
      cell: (s) => <LegCell leg={shiftCloseTotals(s).cash} />,
    },
    {
      key: 'account',
      header: 'Cuenta',
      align: 'right',
      cell: (s) => <LegCell leg={shiftCloseTotals(s).account} />,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      cell: (s) => <LegCell leg={shiftCloseTotals(s).total} strong />,
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (s) => (
        <span
          className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_TONE[s.status]}`}
        >
          {STATUS_LABEL[s.status]}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      <DataTable rows={shifts} columns={columns} rowKey={(s) => s.id} className="rounded-lg" />
      <p className="text-xs text-muted-foreground">
        El número grande es lo <strong className="font-medium text-foreground">contado</strong> al
        cerrar. Cuenta = todo lo que no entra al cajón (transferencia, Nequi, tarjeta); si quedó
        algún medio sin arquear, el total no se calcula: sumar lo que falta mostraría un faltante
        que no existió.
      </p>
    </div>
  );
}
