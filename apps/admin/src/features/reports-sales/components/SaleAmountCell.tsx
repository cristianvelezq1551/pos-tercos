import type { Sale } from '@pos-tercos/types';
import { Bike } from 'lucide-react';
import { formatCop } from '../../../lib/format';

/**
 * El monto de una venta en el listado.
 *
 * La cifra grande es SIEMPRE lo que queda en el negocio (total − domicilio),
 * porque esta columna se suma a mano y tiene que dar el mismo número del pie y
 * del "Ingresos" de arriba. Antes mostraba el total bruto: en un pedido a
 * domicilio eso incluye la plata del repartidor, así que sumar la columna daba
 * de más y no cuadraba con ningún otro reporte (§7.v24).
 *
 * El domicilio no desaparece —hay que poder reconocer lo que pagó el cliente—:
 * va debajo, marcado, y sumado da el total cobrado.
 */
export function SaleAmountCell({ sale }: { sale: Sale }) {
  const net = sale.total - sale.deliveryFee;
  const conDomicilio = sale.deliveryFee > 0;

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className="inline-flex items-center gap-2">
        {/* Con descuento, el precio de lista tachado al lado: si no, una venta
            rebajada se ve idéntica a una barata y el descuento es invisible. */}
        {sale.discountTotal > 0 ? (
          <span className="text-xs font-normal text-muted-foreground line-through">
            {formatCop(sale.subtotal)}
          </span>
        ) : null}
        <span className="font-medium text-foreground">{formatCop(net)}</span>
      </span>
      {conDomicilio ? (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground"
          title={`El cliente pagó ${formatCop(sale.total)}: ${formatCop(net)} del pedido y ${formatCop(
            sale.deliveryFee,
          )} de domicilio, que es del repartidor.`}
        >
          <Bike className="h-3 w-3" aria-hidden />+{formatCop(sale.deliveryFee)} domicilio
        </span>
      ) : null}
    </span>
  );
}
