'use client';

import { Input, Label, cn } from '@pos-tercos/ui';
import { Trash2 } from 'lucide-react';
import type { Stockable, StockableType } from '@pos-tercos/types';
import { ItemAssociation } from './ItemAssociation';
import { NumField } from './NumField';
import { derivarLinea, type ImporteQueManda } from './derivar-linea';

export interface DraftRow {
  localId: string;
  selection: { entityType: StockableType; id: string } | null;
  descriptionRaw: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  suggestion?: { entityType: StockableType; id: string; name: string; score: number } | null;
  /** Desglose de empaque detectado por la IA (ej. "150 g X 10 U"). */
  packUnits?: number | null;
  packSizePerUnit?: number | null;
  packSizeMeasure?: string | null;
  /** Conversión verificada a la unidad base del insumo (unidades base por 1 de
   *  la línea). Se siembra al asociar; el panel la deja editar. */
  baseFactor?: number | null;
  /** Cuál de los dos importes escribió la persona por última vez: al cambiar la
   *  cantidad se recalcula el OTRO. Solo vive en el formulario. */
  manda?: ImporteQueManda;
}

interface InvoiceItemRowProps {
  index: number;
  row: DraftRow;
  stockables: Stockable[];
  disabled?: boolean;
  onChange: (patch: Partial<DraftRow>) => void;
  onRemove: () => void;
  onStockableCreated: (item: Stockable) => void;
}

export function InvoiceItemRow({
  index,
  row,
  stockables,
  disabled,
  onChange,
  onRemove,
  onStockableCreated,
}: InvoiceItemRowProps) {
  const isMatched = row.selection !== null;

  // Escribiendo dos de los tres, el tercero sale solo: el proveedor cobra por
  // kilo, el bulto trae 5,2 kg y en el papel viene el total de la línea.
  const editar = (campo: 'cantidad' | 'unitario' | 'total') => (valor: number) => {
    const { quantity, unitPrice, total, manda } = derivarLinea(row, campo, valor);
    onChange({ quantity, unitPrice, total, manda });
  };
  const derivado = row.manda === 'total' ? 'unitario' : 'total';

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        isMatched ? 'border-success-border bg-success-bg/30' : 'border-warning-border bg-warning-bg/30',
      )}
    >
      <div className="flex items-start gap-2 text-xs">
        <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-700 font-mono text-[10px] font-semibold text-foreground">
          {index}
        </span>
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`desc-${row.localId}`}>Descripción tal como aparece en factura</Label>
              <Input
                id={`desc-${row.localId}`}
                disabled={disabled}
                value={row.descriptionRaw}
                onChange={(e) => onChange({ descriptionRaw: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-2">
              {isMatched ? (
                <span className="inline-flex items-center rounded-full bg-success-bg px-2 py-1 text-xs font-medium text-success">
                  ✓ Asociado
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-warning-bg px-2 py-1 text-xs font-medium text-warning">
                  ⚠ Sin asociar
                </span>
              )}
              <button
                type="button"
                onClick={onRemove}
                disabled={disabled}
                className="rounded-md p-1.5 text-red-500 hover:bg-destructive/10"
                aria-label="Quitar fila"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <NumField id={`qty-${row.localId}`} label="Cantidad" value={row.quantity} onChange={editar('cantidad')} disabled={disabled} />
            <div className="space-y-1.5">
              <Label htmlFor={`unit-${row.localId}`}>Unidad</Label>
              <Input
                id={`unit-${row.localId}`}
                disabled={disabled}
                value={row.unit}
                onChange={(e) => onChange({ unit: e.target.value })}
                placeholder="kg, lt, unidad, caja"
              />
            </div>
            <NumField
              id={`price-${row.localId}`}
              label="Costo unit."
              value={row.unitPrice}
              onChange={editar('unitario')}
              money
              decimals={2}
              hint={derivado === 'unitario' ? 'calculado' : undefined}
              disabled={disabled}
            />
            <NumField
              id={`total-${row.localId}`}
              label="Total costo"
              value={row.total}
              onChange={editar('total')}
              money
              hint={derivado === 'total' ? 'calculado' : undefined}
              disabled={disabled}
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Escribe la cantidad y uno de los dos costos: el otro se calcula solo.
          </p>

          {row.packUnits && !isMatched ? (
            <p className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-400 ring-1 ring-inset ring-blue-500/20">
              📦 IA detectó empaque: 1 {row.unit} = {row.packUnits}
              {row.packSizePerUnit ? ` × ${row.packSizePerUnit} ${row.packSizeMeasure ?? ''}`.trimEnd() : ' u'}
              {' · '}asocia el insumo para ajustar la conversión
            </p>
          ) : null}

          <ItemAssociation
            row={row}
            stockables={stockables}
            disabled={disabled}
            onChange={onChange}
            onStockableCreated={onStockableCreated}
          />
        </div>
      </div>
    </div>
  );
}
