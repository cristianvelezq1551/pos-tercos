'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { saleTypeLabel, type Sale, type Shift } from '@pos-tercos/types';
import { formatCop, formatDate } from '../../../lib/format';
import { paymentSummary } from '../lib/payment-label';
import { shiftCrossedMidnight, shiftLabel } from '../lib/shift-label';
import { matchesLens, sumSales, type SalesLens } from '../lib/sales-lens';
import { SalesLensTabs } from './SalesLensTabs';
import { SaleAmountCell } from './SaleAmountCell';
import { SaleExpandedDetail } from './SaleExpandedDetail';
import { SalesScopeFilter } from './SalesScopeFilter';

interface SalesDetailListProps {
  sales: Sale[];
  /** Cajas abiertas dentro del rango de fechas elegido arriba. */
  shifts: Shift[];
  /** Caja seleccionada (modo arqueo). Ausente = listado por rango de fechas. */
  selectedShift?: Shift;
  /** La seleccionada quedó fuera del rango (el dueño movió las fechas). */
  outOfRangeShift?: Shift;
}

export function SalesDetailList({
  sales,
  shifts,
  selectedShift,
  outOfRangeShift,
}: SalesDetailListProps) {
  // Lente de la vista (no una consulta): "con descuento" es la pregunta que el
  // dueño no podía responder sin leer fila por fila.
  const [lens, setLens] = useState<SalesLens>('todas');
  const visibles = sales.filter((s) => matchesLens(s, lens));

  // Anuladas y pendientes NO llegan acá (el backend lista el mismo universo que
  // el resumen), así que con la lente en "todas" este total espeja el
  // "Ingresos" de arriba. Neto de domicilios, por la misma razón: esa plata es
  // del repartidor y si se sumara, este pie no cuadraría con la cabecera.
  const { net: total, delivery, discount } = sumSales(visibles);
  const conDomicilio = visibles.some((s) => s.deliveryFee > 0);

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Detalle de ventas
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <SalesScopeFilter
            shifts={shifts}
            selectedShiftId={selectedShift?.id}
            outOfRangeShift={outOfRangeShift}
          />
          <SalesLensTabs sales={sales} lens={lens} onChange={setLens} />
          <span className="text-xs text-muted-foreground">
            {visibles.length} {visibles.length === 1 ? 'venta' : 'ventas'}
            {sales.length >= 1000 ? ' (máximo mostrado)' : ''} ·{' '}
            <span className="font-medium text-foreground tabular-nums">{formatCop(total)}</span>
            {discount > 0 ? (
              <span className="tabular-nums"> · {formatCop(discount)} en descuentos</span>
            ) : null}
            {delivery > 0 ? (
              <span className="tabular-nums">
                {' '}
                · + {formatCop(delivery)} de domicilios (del repartidor)
              </span>
            ) : null}
          </span>
        </div>
      </div>

      {selectedShift && <ShiftContextBand shift={selectedShift} />}

      {visibles.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {lens !== 'todas'
            ? 'Ninguna venta del período cumple ese filtro.'
            : selectedShift
              ? 'Esta caja no registró ventas cobradas.'
              : 'Sin ventas en el período seleccionado.'}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-muted-foreground">
                <th className="pb-2 pl-1 text-left font-semibold">#</th>
                <th className="pb-2 text-left font-semibold">Fecha</th>
                <th className="pb-2 text-left font-semibold">Tipo</th>
                <th className="pb-2 text-left font-semibold">Cliente</th>
                <th className="pb-2 text-left font-semibold">Método</th>
                <th className="pb-2 text-left font-semibold">Cajero</th>
                <th className="pb-2 pr-1 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibles.map((sale) => (
                <SaleRow key={sale.id} sale={sale} />
              ))}
            </tbody>
          </table>
          {conDomicilio ? (
            <p className="mt-2 text-xs text-muted-foreground">
              En los pedidos con domicilio, el total de la fila es lo que queda en el negocio; el
              domicilio va marcado aparte porque se lo lleva el repartidor. Así la columna suma
              exactamente lo del pie.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Contexto de la caja elegida — aclara por qué el listado ignora el rango de fechas. */
function ShiftContextBand({ shift }: { shift: Shift }) {
  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Caja: {shiftLabel(shift)}</span>
      {shift.status === 'OPEN' && (
        <span className="ml-2 rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-success">
          Abierta
        </span>
      )}
      <p className="mt-1">
        Lo cobrado en esta caja, sin importar el rango de fechas de arriba.
        {shiftCrossedMidnight(shift)
          ? ' La sesión se extendió hasta la madrugada, así que incluye ventas de dos días calendario.'
          : ''}
      </p>
    </div>
  );
}

function SaleRow({ sale }: { sale: Sale }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen((o) => !o)}>
        <td className="py-2 pl-1">
          <span className="flex items-center gap-1 font-medium tabular-nums text-foreground">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            {sale.receiptNumber}
          </span>
        </td>
        <td className="py-2 text-muted-foreground">
          {formatDate(sale.paidAt ?? sale.createdAt, 'datetime')}
        </td>
        <td className="py-2 text-muted-foreground">{saleTypeLabel(sale.type)}</td>
        <td className="py-2 text-foreground">{sale.customerName ?? '—'}</td>
        <td className="py-2 text-muted-foreground">{paymentSummary(sale)}</td>
        <td className="py-2 text-muted-foreground">{sale.cashierName ?? sale.paidByName ?? '—'}</td>
        <td className="py-2 pr-1 text-right tabular-nums">
          <SaleAmountCell sale={sale} />
        </td>
      </tr>

      {open && (
        <tr className="bg-muted/20">
          <td colSpan={7} className="px-3 py-3">
            <SaleExpandedDetail sale={sale} />
          </td>
        </tr>
      )}
    </>
  );
}
