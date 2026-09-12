import type { CashierAnomalies } from '@pos-tercos/types';
import { DataTable, DateTimeCell, type DataTableColumn } from '@pos-tercos/ui';
import { formatCop } from '../../../lib/format';
import { FLAG_LABEL, traeElTotal, type Turno } from './anomalies-shared';

function Monto({ value, fuerte = false }: { value: number | null; fuerte?: boolean }) {
  if (value === null) return <span className="text-muted-foreground">sin arquear</span>;
  return (
    <span className={fuerte && Math.abs(value) >= 5000 ? 'font-bold text-destructive' : undefined}>
      {value > 0 ? '+' : ''}
      {formatCop(value)}
    </span>
  );
}

/** El histórico de turnos de un cajero. En teléfono cada turno es una
 *  tarjeta: las columnas de números no caben en 390 px. */
export function ShiftsAnomalyTable({ shifts }: { shifts: CashierAnomalies['shifts'] }) {
  const num = { align: 'right', numeric: true } as const;
  const conTotal = traeElTotal(shifts);
  const columnasDeCuenta: DataTableColumn<Turno>[] = conTotal
    ? [
        {
          key: 'digital',
          header: 'Cuenta',
          ...num,
          cell: (s) => <Monto value={s.digitalDifference ?? null} />,
        },
        {
          key: 'total',
          header: 'Total',
          ...num,
          cell: (s) => <Monto value={s.totalDifference ?? null} fuerte />,
        },
      ]
    : [];
  const columns: DataTableColumn<Turno>[] = [
    {
      key: 'opened',
      header: 'Turno (apertura)',
      primary: true,
      cell: (s) => <DateTimeCell value={s.openedAt} className="text-sm text-foreground" />,
    },
    {
      key: 'difference',
      header: conTotal ? 'Cajón' : 'Descuadre',
      ...num,
      cell: (s) => <Monto value={s.difference} fuerte={!conTotal} />,
    },
    ...columnasDeCuenta,
    {
      key: 'voids',
      header: 'Anulaciones',
      ...num,
      cell: (s) =>
        s.voidCount > 0 ? <span className="font-medium text-warning">{s.voidCount}</span> : s.voidCount,
    },
    {
      key: 'noSale',
      header: 'Cajón sin venta',
      ...num,
      cell: (s) =>
        s.noSaleCount > 0 ? (
          <span className="font-medium text-warning">{s.noSaleCount}</span>
        ) : (
          s.noSaleCount
        ),
    },
    {
      key: 'flags',
      header: 'Alertas',
      cell: (s) =>
        s.flags.length > 0 ? (
          <span className="text-xs font-semibold text-destructive">
            {s.flags.map((f) => FLAG_LABEL[f]).join(' · ')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <DataTable rows={shifts} columns={columns} rowKey={(s) => s.shiftId} className="mt-4 rounded-md" />
  );
}
