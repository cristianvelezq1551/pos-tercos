import type { VoidInvoicePreview } from '@pos-tercos/types';
import { AlertTriangle } from 'lucide-react';

/**
 * Qué le pasa al inventario si se anula.
 *
 * El aviso de lo que queda en negativo va primero y en rojo a propósito: es la
 * única consecuencia que se siente el mismo día en el local. Un insumo en
 * negativo hace que la caja rechace el cobro de todo producto que lo use.
 */
export function VoidImpactTable({ preview }: { preview: VoidInvoicePreview }) {
  return (
    <div className="space-y-3">
      {preview.goesNegative.length > 0 && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <p>
            <span className="font-semibold">
              {preview.goesNegative.length === 1
                ? 'Un insumo queda en negativo'
                : `${preview.goesNegative.length} insumos quedan en negativo`}
            </span>{' '}
            ({preview.goesNegative.join(', ')}). La caja va a rechazar el cobro de los productos que
            los usen hasta que cargues la factura corregida.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40">
              <tr>
                <Th>Ítem</Th>
                <Th align="right">Ahora</Th>
                <Th align="right">Se devuelve</Th>
                <Th align="right">Queda en</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {preview.lines.map((l) => (
                <tr key={`${l.entityType}-${l.entityId}`}>
                  <Td>{l.name}</Td>
                  <Td align="right" mono>
                    {formatear(l.currentStock)} {l.unit}
                  </Td>
                  <Td align="right" mono>
                    <span className="text-destructive">{formatear(l.delta)}</span>
                  </Td>
                  <Td align="right" mono>
                    <span className={l.resultingStock < 0 ? 'font-semibold text-destructive' : ''}>
                      {formatear(l.resultingStock)} {l.unit}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatear(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 4 });
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2 text-foreground ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}
