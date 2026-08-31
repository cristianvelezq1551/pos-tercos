'use client';

import { paymentMethodLabel, type Shift } from '@pos-tercos/types';
import { Money } from '@pos-tercos/ui';
// El tipo REAL, no una copia local: acá había una interfaz duplicada con solo
// 4 campos, así que agregar datos al resumen no llegaba a este reporte.
import type { ShiftSummary } from '../lib/shift-summary';

function Row({
  label,
  value,
  bold,
  muted,
  positive,
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
  positive?: boolean;
}) {
  return (
    <div
      className={
        muted
          ? 'flex items-center justify-between text-xs text-muted-foreground'
          : 'flex items-center justify-between text-foreground'
      }
    >
      <span>{label}</span>
      <Money
        amount={value}
        size={bold ? 'lg' : 'sm'}
        weight={bold ? 'bold' : 'medium'}
        withSign={positive}
      />
    </div>
  );
}

/**
 * El cierre imprimía el CODE crudo del medio: decía "TRANSFER (12)" donde el
 * dueño lee "Transferencia". El nombre vivo lo trae el endpoint de esperado
 * (§7.v20), así que no hace falta pedir el catálogo otra vez.
 */
export function ShiftZReport({
  shift,
  summary,
  expectedCash,
  cashIn = 0,
  cashOut = 0,
  nombresDeMedios,
}: {
  shift: Shift;
  summary: ShiftSummary;
  expectedCash: number;
  /** Entradas/salidas de efectivo del turno (movimientos de caja). */
  cashIn?: number;
  cashOut?: number;
  /** `{code: nombre}` del catálogo, para llamarlos como el dueño los llama. */
  nombresDeMedios?: Record<string, string>;
}) {
  return (
    <section className="rounded-xl bg-muted/40 p-4">
      <p className="caps text-[0.625rem] text-muted-foreground">Reporte de cierre del turno</p>
      <div className="mt-3 space-y-1.5 text-sm">
        <Row label="Apertura (efectivo inicial)" value={shift.openingCash} />
        <Row
          label={`Ventas en efectivo (${summary.byMethod.CASH?.count ?? 0})`}
          value={summary.cashSalesTotal}
          positive
        />
        {Object.entries(summary.byMethod)
          .filter(([m]) => m !== 'CASH')
          .map(([method, v]) => (
            <Row
              key={method}
              muted
              label={`${paymentMethodLabel(method, nombresDeMedios)} (${v.count})`}
              value={v.total}
            />
          ))}
        {cashIn > 0 ? <Row label="Entradas de efectivo" value={cashIn} positive /> : null}
        {cashOut > 0 ? <Row label="Salidas de efectivo" value={-cashOut} /> : null}
        <div className="border-t border-border pt-2">
          <Row label="Esperado en caja" value={expectedCash} bold />
        </div>

        <p className="mt-1 text-[0.6875rem] text-muted-foreground">
          Vendido en el turno: {summary.countSales} ·{' '}
          <Money amount={summary.totalSales} size="xs" weight="medium" className="text-current" />
        </p>
      </div>
    </section>
  );
}
