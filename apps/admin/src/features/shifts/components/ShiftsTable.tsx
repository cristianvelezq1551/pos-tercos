import type { Shift } from '@pos-tercos/types';
import Link from 'next/link';
import { formatCop } from '../../../lib/format';
import { formatShiftWindow } from '../lib/format-shift-window';
import { shiftCloseTotals } from '../lib/shift-close-totals';
import { LegCell, Td, Th } from './ShiftsTableCells';

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

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/40">
            <tr>
              <Th>Cajero</Th>
              <Th>Turno</Th>
              <Th align="right">Efectivo</Th>
              <Th align="right">Cuenta</Th>
              <Th align="right">Total</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shifts.map((s) => {
              const { cash, account, total } = shiftCloseTotals(s);
              return (
                <tr key={s.id} className="transition-colors hover:bg-muted/40">
                  <Td>
                    <Link
                      href={`/shifts/${s.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {s.cashierName ?? 'Ver sesión'}
                    </Link>
                  </Td>
                  <Td>
                    <p className="whitespace-nowrap text-foreground">
                      {formatShiftWindow(s.openedAt, s.closedAt)}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      base {formatCop(s.openingCash)}
                    </p>
                  </Td>
                  <LegCell leg={cash} />
                  <LegCell leg={account} />
                  <LegCell leg={total} strong />
                  <Td>
                    <span
                      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_TONE[s.status]}`}
                    >
                      {STATUS_LABEL[s.status]}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        El número grande es lo <strong className="font-medium text-foreground">contado</strong> al
        cerrar. Cuenta = todo lo que no entra al cajón (transferencia, Nequi, tarjeta); si quedó
        algún medio sin arquear, el total no se calcula: sumar lo que falta mostraría un faltante
        que no existió.
      </p>
    </div>
  );
}
