import type { MonthlyFinancialStatement } from '@pos-tercos/types';
import { formatCop } from '@pos-tercos/ui';
import { Row } from './PnlRow';

/**
 * Las pérdidas que van DEBAJO del margen bruto: cortesías, reembolsos, merma,
 * domicilios de compra y compromisos pagados.
 *
 * Viven aparte del cuerpo del P&G porque son todas la misma forma —una línea
 * condicional con su aclaración— y juntas empujaban `PnlCard` sobre el límite
 * de 200 líneas. Ninguna se mezcla con el COGS: el costo de lo VENDIDO es una
 * cosa y lo que se tiró, se regaló o se pagó por traer es otra.
 */
export function PnlLossLines({ s }: { s: MonthlyFinancialStatement }) {
  return (
    <>
      {/* Cortesías: producto regalado (autorizado), valuado a costo FIFO. */}
      {s.cortesiasCost > 0 || s.cortesiasCostPartial ? (
        <div className="space-y-1.5 text-sm">
          <Row
            label="− Cortesías (producto regalado, a costo)"
            value={`−${formatCop(s.cortesiasCost)}`}
            muted
          />
          {s.cortesiasCostPartial ? (
            <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
              Algunas cortesías tienen insumos sin ningún precio de compra en el sistema, así que
              esta pérdida está subestimada.
            </p>
          ) : s.cortesiasCostEstimated ? (
            <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
              Parte de estas cortesías se valuó con un <strong>estimado</strong> (se regaló producto
              con insumos que no estaban cargados). Se corrige al subir la factura de compra.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Reembolsos: comida preparada cuya plata se devolvió, valuada a costo FIFO. */}
      {s.refundCost > 0 ? (
        <div className="space-y-1.5 text-sm">
          <Row
            label="− Reembolsos (comida preparada, a costo)"
            value={`−${formatCop(s.refundCost)}`}
            muted
          />
        </div>
      ) : null}

      {/* Merma: insumo/producto tirado, valuado a costo FIFO (§1.2). */}
      {s.wasteCost > 0 ? (
        <div className="space-y-1.5 text-sm">
          <Row
            label="− Merma (insumo/producto tirado, a costo)"
            value={`−${formatCop(s.wasteCost)}`}
            muted
          />
          {s.wasteCostEstimated ? (
            <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
              Parte de la merma se valuó con un <strong>estimado</strong> (se tiró insumo que no
              estaba cargado en inventario). Se corrige al subir la factura de compra.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Fletes de compra: lo que cobró el proveedor por traer la mercancía.
          Va acá abajo, con las otras pérdidas, y NO dentro del COGS: no
          encarece ningún producto (decisión del dueño 2026-08-28). */}
      {s.freightCost > 0 ? (
        <div className="space-y-1.5 text-sm">
          <Row
            label="− Domicilios de compra (lo que cobran por traer)"
            value={`−${formatCop(s.freightCost)}`}
            muted
          />
          <p className="text-xs text-muted-foreground">
            {s.freightInvoiceCount} factura{s.freightInvoiceCount === 1 ? '' : 's'} con domicilio
            cobrado. No encarece ningún producto: es un gasto del mes.
          </p>
        </div>
      ) : null}

      {/* Compromisos con personas pagados este mes (H1). Se cuentan al PAGAR,
          no al registrar: mientras se deben son deuda, no pérdida. Las
          devoluciones de préstamo quedan fuera del monto. */}
      {s.payablesPaidCost > 0 ? (
        <div className="space-y-1.5 text-sm">
          <Row
            label="− Compromisos pagados (arreglos, servicios)"
            value={`−${formatCop(s.payablesPaidCost)}`}
            muted
          />
          <p className="text-xs text-muted-foreground">
            {s.payablesPaidCount} compromiso{s.payablesPaidCount === 1 ? '' : 's'} que pagaste
            este mes. Las devoluciones de préstamos no cuentan acá.
          </p>
        </div>
      ) : null}
    </>
  );
}
