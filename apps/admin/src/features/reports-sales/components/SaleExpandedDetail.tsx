import type { Sale } from '@pos-tercos/types';
import { formatCop } from '../../../lib/format';
import { methodLabel } from '../lib/payment-label';

/** Contenido de la fila expandida: líneas del pedido + totales + pagos. */
export function SaleExpandedDetail({ sale }: { sale: Sale }) {
  const lines = sale.items ?? [];
  return (
    <div className="space-y-3">
      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin detalle de productos disponible.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-muted-foreground">
              <th className="pb-1 text-left font-semibold">Producto</th>
              <th className="pb-1 text-right font-semibold">Cant.</th>
              <th className="pb-1 text-right font-semibold">Precio</th>
              <th className="pb-1 text-right font-semibold">Desc.</th>
              <th className="pb-1 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {lines.map((it) => (
              <tr key={it.id}>
                <td className="py-1.5 text-foreground">
                  {it.productName ?? 'Producto'}
                  {it.sizeName ? (
                    <span className="text-muted-foreground"> · {it.sizeName}</span>
                  ) : null}
                  {it.modifiers.length > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      ({it.modifiers.map((m) => m.name).join(', ')})
                    </span>
                  )}
                  {it.notes ? (
                    <span className="block text-[10px] italic text-muted-foreground">
                      {it.notes}
                    </span>
                  ) : null}
                </td>
                <td className="py-1.5 text-right tabular-nums">{it.quantity}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {formatCop(it.unitPrice)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {it.lineDiscount > 0 ? `−${formatCop(it.lineDiscount)}` : '—'}
                </td>
                <td className="py-1.5 text-right tabular-nums font-medium text-foreground">
                  {formatCop(it.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 border-t border-border/60 pt-2 text-xs">
        <div className="space-y-0.5 text-muted-foreground">
          {sale.discountTotal > 0 && (
            <p>
              Subtotal:{' '}
              <span className="tabular-nums text-foreground">{formatCop(sale.subtotal)}</span> ·
              Descuento:{' '}
              <span className="tabular-nums text-warning">−{formatCop(sale.discountTotal)}</span>
            </p>
          )}
          {sale.discountReason ? (
            <p className="italic">Motivo descuento: {sale.discountReason}</p>
          ) : null}
          {/* El domicilio no es ingreso: se dice acá para que el total no se
              lea como si todo se hubiera quedado en el negocio. */}
          {sale.deliveryFee > 0 ? (
            <p>
              Domicilio (del repartidor):{' '}
              <span className="tabular-nums text-foreground">{formatCop(sale.deliveryFee)}</span> ·
              Queda en el negocio:{' '}
              <span className="tabular-nums text-foreground">
                {formatCop(sale.total - sale.deliveryFee)}
              </span>
            </p>
          ) : null}
          {sale.payments && sale.payments.length > 1 && (
            <p>
              Pagos:{' '}
              {sale.payments
                .map((p) => `${methodLabel(p.method)} ${formatCop(p.amount)}`)
                .join(' · ')}
            </p>
          )}
        </div>
        <p className="text-sm font-semibold text-foreground">
          Total: <span className="tabular-nums">{formatCop(sale.total)}</span>
        </p>
      </div>
    </div>
  );
}
