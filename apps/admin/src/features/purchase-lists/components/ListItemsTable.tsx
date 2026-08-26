'use client';

import type { PurchaseListItem } from '@pos-tercos/types';
import { Button, Input, Money, Quantity } from '@pos-tercos/ui';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  items: PurchaseListItem[];
  editable: boolean;
  onChangeQty: (itemId: string, quantity: number) => Promise<void>;
  onRemove: (itemId: string) => Promise<void>;
}

/**
 * Los renglones de la lista, con lo que hace falta para decidir la cantidad a
 * la vista: existencias, mínimo y en cuánto queda el inventario si se compra
 * eso. Sin la última columna, quien compra teclea un número a ciegas.
 */
export function ListItemsTable({ items, editable, onChangeQty, onRemove }: Props) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        La lista está vacía. Agrega abajo lo que haga falta.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="pb-2">Insumo / producto</th>
            <th className="pb-2 text-right">Hay / mínimo</th>
            <th className="pb-2 text-right">Comprar</th>
            <th className="pb-2 text-right">Queda en</th>
            <th className="pb-2 text-right">Costo est.</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              editable={editable}
              onChangeQty={onChangeQty}
              onRemove={onRemove}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemRow({
  item,
  editable,
  onChangeQty,
  onRemove,
}: {
  item: PurchaseListItem;
  editable: boolean;
  onChangeQty: (itemId: string, quantity: number) => Promise<void>;
  onRemove: (itemId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(String(item.quantity));
  const [pending, setPending] = useState(false);

  // El valor del servidor manda cuando cambia por fuera (otra pestaña, recarga).
  useEffect(() => {
    setDraft(String(item.quantity));
  }, [item.quantity]);

  const qty = Number(draft);
  const valida = Number.isFinite(qty) && qty > 0;
  // Se recalcula con lo TECLEADO, no con lo guardado: quien compra ve el efecto
  // de su número antes de confirmarlo.
  const queda = item.currentStock + (valida ? qty : item.quantity) * item.conversionFactor;
  const alcanza = queda >= item.thresholdMin;

  async function commit() {
    if (!valida || qty === item.quantity) {
      setDraft(String(item.quantity));
      return;
    }
    setPending(true);
    await onChangeQty(item.id, qty).catch(() => setDraft(String(item.quantity)));
    setPending(false);
  }

  return (
    <tr className="border-b border-border/60">
      <td className="py-2 pr-3">
        <span className="font-medium text-foreground">{item.entityName}</span>
        {item.supplierName ? (
          <span className="block text-xs text-muted-foreground">{item.supplierName}</span>
        ) : (
          <span className="block text-xs text-warning">Sin proveedor asignado</span>
        )}
      </td>
      <td className="py-2 text-right tabular-nums">
        <span className={item.currentStock < item.thresholdMin ? 'text-destructive' : ''}>
          <Quantity value={item.currentStock} maxDecimals={1} className="text-current" />
        </span>
        <span className="text-xs text-muted-foreground">
          {' / '}
          <Quantity value={item.thresholdMin} maxDecimals={1} className="text-current" />
          {` ${item.unitStock}`}
        </span>
      </td>
      <td className="py-2 text-right">
        {editable ? (
          <span className="inline-flex items-center gap-1">
            <Input
              type="number"
              min={0}
              step="any"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commit()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              disabled={pending}
              className="w-20 text-right"
              aria-label={`Cantidad de ${item.entityName}`}
            />
            <span className="text-xs text-muted-foreground">{item.unitPurchase}</span>
          </span>
        ) : (
          <Quantity value={item.quantity} unit={item.unitPurchase} maxDecimals={2} />
        )}
      </td>
      <td className="py-2 text-right tabular-nums">
        <span className={alcanza ? 'text-foreground' : 'text-destructive'}>
          <Quantity value={queda} unit={item.unitStock} maxDecimals={1} className="text-current" />
        </span>
        {!alcanza ? (
          <span className="block text-xs text-destructive">no alcanza el mínimo</span>
        ) : null}
      </td>
      <td className="py-2 text-right">
        {item.estTotal === null ? (
          <span className="text-xs text-muted-foreground" title="Nunca se ha comprado con factura">
            sin costo
          </span>
        ) : (
          <Money amount={item.estTotal} />
        )}
      </td>
      <td className="py-2 pl-2 text-right">
        {editable ? (
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => void onRemove(item.id)}
            aria-label={`Quitar ${item.entityName}`}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        ) : null}
      </td>
    </tr>
  );
}
