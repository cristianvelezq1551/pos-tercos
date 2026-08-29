import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { toleranciaDelTotal } from '@pos-tercos/domain';
import type { UserRole } from '@prisma/client';

/**
 * Reglas de la factura que comparten más de un service. Viven acá y no dentro
 * de uno de ellos para que confirmar y editar el flete usen EXACTAMENTE la
 * misma tolerancia y los mismos permisos: dos copias de una regla de plata se
 * separan al primer retoque (ya pasó con el prorrateo del envío, §7.v31).
 */

/**
 * El total pagado tiene que explicarse: mercancía (los ítems) más el domicilio.
 *
 * El flete entra a la ecuación porque `total` es lo que se le pagó al
 * proveedor. Antes de que existiera el campo, una factura con domicilio no se
 * podía confirmar —el delta se iba de la tolerancia— y la única salida era
 * inflar el precio de un insumo, que escondía el gasto dentro del costo de un
 * producto al azar.
 */
export function assertTotalCoherente(opts: {
  total: number;
  itemsSum: number;
  freight: number;
}): void {
  const { total, itemsSum, freight } = opts;
  if (freight < 0) {
    throw new BadRequestException('El domicilio no puede ser negativo.');
  }
  if (freight > total) {
    throw new BadRequestException(
      `El domicilio ($${freight.toLocaleString('es-CO')}) no puede ser mayor al total de la factura ($${total.toLocaleString('es-CO')}).`,
    );
  }
  const delta = Math.abs(total - (itemsSum + freight));
  const tolerancia = toleranciaDelTotal(total);
  if (delta > tolerancia) {
    const detalle =
      freight > 0
        ? `la suma de items ($${itemsSum.toLocaleString('es-CO')}) más el domicilio ($${freight.toLocaleString('es-CO')})`
        : `la suma de items ($${itemsSum.toLocaleString('es-CO')})`;
    throw new BadRequestException(
      `Total de la factura ($${total.toLocaleString('es-CO')}) no coincide con ${detalle}. Diferencia: $${delta.toLocaleString('es-CO')} (tolerancia $${Math.round(tolerancia).toLocaleString('es-CO')}).`,
    );
  }
}

/**
 * Quién puede tocar la plata de una factura: el Dueño, o quien la creó.
 *
 * Se aplica al pago y también a editar el domicilio de una factura ya pagada —
 * las dos cosas mueven los bolsillos de tesorería.
 */
export function assertPuedeGestionarPago(
  actorRole: UserRole,
  actorId: string,
  uploadedById: string | null,
): void {
  if (actorRole === 'DUENO') return;
  if (uploadedById !== actorId) {
    throw new ForbiddenException(
      'Solo el Dueño o quien creó la factura puede gestionar su pago.',
    );
  }
}
