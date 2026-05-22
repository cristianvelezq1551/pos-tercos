'use client';

import { Button } from '@pos-tercos/ui';
import type { Stockable } from '@pos-tercos/types';
import { InvoiceItemRow, type DraftRow } from './InvoiceItemRow';

interface ItemsSectionProps {
  rows: DraftRow[];
  stockables: Stockable[];
  disabled?: boolean;
  onAdd: () => void;
  onUpdate: (localId: string, patch: Partial<DraftRow>) => void;
  onRemove: (localId: string) => void;
  onStockableCreated: (item: Stockable) => void;
}

export function ItemsSection({
  rows,
  stockables,
  disabled,
  onAdd,
  onUpdate,
  onRemove,
  onStockableCreated,
}: ItemsSectionProps) {
  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Ítems ({rows.length})</h3>
        <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={disabled}>+ Agregar fila</Button>
      </header>

      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="rounded-md border border-dashed border-input bg-muted/40 p-4 text-center text-sm text-muted-foreground">
            La IA no extrajo ítems o los borraste todos. Agrega al menos uno.
          </p>
        )}
        {rows.map((row, idx) => (
          <InvoiceItemRow
            key={row.localId}
            index={idx + 1}
            row={row}
            stockables={stockables}
            disabled={disabled}
            onChange={(patch) => onUpdate(row.localId, patch)}
            onRemove={() => onRemove(row.localId)}
            onStockableCreated={onStockableCreated}
          />
        ))}
      </div>
    </section>
  );
}
