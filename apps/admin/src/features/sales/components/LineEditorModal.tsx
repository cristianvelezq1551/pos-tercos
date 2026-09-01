'use client';

import { Button, Dialog, Textarea } from '@pos-tercos/ui';
import { Minus, Plus, SplitSquareHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { CartLine } from '../lib/cart-types';

/**
 * Editor de UNA línea del carrito: cantidad, nota para cocina y quitar.
 *
 * Reemplaza a los tres íconos sin nombre que vivían en la fila (duplicar,
 * nota, quitar). Un ícono de papelito no le dice a nadie que ahí se escribe
 * "sin cebolla" — y en una caja se aprende mirando, no explorando.
 *
 * Ya NO hay "agregar otro aparte": ese botón AGREGABA una unidad (con dos
 * sándwiches dejaba tres). En su lugar está **separar**, que es lo que se
 * esperaba de él: reparte las unidades que ya están juntas, sin tocar el total.
 */
export function LineEditorModal({
  line,
  open,
  onClose,
  onQty,
  onNotes,
  onSeparar,
  onRemove,
}: {
  line: CartLine;
  open: boolean;
  onClose: () => void;
  onQty: (qty: number) => void;
  onNotes: (notes: string) => void;
  onSeparar: () => void;
  onRemove: () => void;
}) {
  const [nota, setNota] = useState(line.notes ?? '');

  const guardarYCerrar = () => {
    onNotes(nota);
    onClose();
  };

  const detalle = [line.size?.name, ...line.modifiers.map((m) => m.name)].filter(Boolean).join(' · ');

  return (
    <Dialog
      open={open}
      onClose={guardarYCerrar}
      title={line.productName}
      description={detalle || undefined}
      maxWidth="max-w-md"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button
            variant="ghost"
            className="min-h-11 text-destructive hover:bg-destructive/10"
            onClick={() => {
              onRemove();
              onClose();
            }}
          >
            <Trash2 className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
            Quitar
          </Button>
          <Button className="min-h-11" onClick={guardarYCerrar}>
            Listo
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Cantidad</p>
          <div className="inline-flex items-center rounded-xl border border-border">
            <button
              type="button"
              onClick={() => onQty(line.quantity - 1)}
              disabled={line.quantity <= 1}
              aria-label="Restar uno"
              className="inline-flex h-12 w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/40 disabled:opacity-30"
            >
              <Minus className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <span className="w-10 text-center text-lg font-semibold tabular text-foreground">
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => onQty(line.quantity + 1)}
              aria-label="Sumar uno"
              className="inline-flex h-12 w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/40"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="nota-linea"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Nota para cocina
          </label>
          <Textarea
            id="nota-linea"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            maxLength={200}
            autoFocus
            placeholder="Ej: sin cebolla, término medio, sin salsa"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Sale impresa en la comanda.{' '}
            {line.quantity > 1
              ? `Vale para las ${line.quantity} unidades — si necesitas notas distintas, sepáralas abajo.`
              : ''}
          </p>
        </div>

        {/* Solo aparece si hay más de una unidad junta: separar es lo único
            que no se resuelve tocando el producto otra vez. */}
        {line.quantity > 1 ? (
          <button
            type="button"
            onClick={() => {
              onNotes(nota);
              onSeparar();
              onClose();
            }}
            className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/30"
          >
            <SplitSquareHorizontal
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              strokeWidth={1.75}
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                Separar en {line.quantity} líneas
              </span>
              <span className="block text-xs text-muted-foreground">
                Para ponerle una nota distinta a cada una (ej. una con cebolla y otra sin).
              </span>
            </span>
          </button>
        ) : null}
      </div>
    </Dialog>
  );
}
