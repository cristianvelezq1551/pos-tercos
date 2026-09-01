'use client';

import { Button, Dialog, Textarea } from '@pos-tercos/ui';
import { CopyPlus, Minus, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { CartLine } from '../lib/cart-types';

/**
 * Editor de UNA línea del carrito: cantidad, nota para cocina, otra unidad
 * aparte y quitar.
 *
 * Reemplaza a los tres íconos sin nombre que vivían en la fila (duplicar,
 * nota, quitar). El dueño lo dijo derecho: "no me parece intuitivo la forma de
 * agregar comentarios". Un ícono de papelito no le dice a nadie que ahí se
 * escribe "sin cebolla" — y en una caja se aprende mirando, no explorando.
 *
 * Acá cada acción tiene su nombre escrito y la nota es un campo grande con un
 * ejemplo dentro, que es lo que se estaba buscando.
 */
export function LineEditorModal({
  line,
  open,
  onClose,
  onQty,
  onNotes,
  onDuplicate,
  onRemove,
}: {
  line: CartLine;
  open: boolean;
  onClose: () => void;
  onQty: (qty: number) => void;
  onNotes: (notes: string) => void;
  onDuplicate: () => void;
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
              className="inline-flex h-12 w-12 items-center justify-center text-ink-600 transition-colors hover:bg-muted/40 disabled:opacity-30"
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
              className="inline-flex h-12 w-12 items-center justify-center text-ink-600 transition-colors hover:bg-muted/40"
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
              ? `Vale para las ${line.quantity} unidades de esta línea.`
              : 'Si necesitas otra unidad con nota distinta, usa el botón de abajo.'}
          </p>
        </div>

        {/* La razón de existir del duplicado: dos unidades con indicaciones
            distintas no caben en una sola línea. Escrito, se entiende; como
            ícono, nadie lo encontraba. */}
        <button
          type="button"
          onClick={() => {
            onNotes(nota);
            onDuplicate();
            onClose();
          }}
          className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/30"
        >
          <CopyPlus className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">
              Agregar otro, en línea aparte
            </span>
            <span className="block text-xs text-muted-foreground">
              Para ponerle una nota distinta (ej. una con cebolla y otra sin).
            </span>
          </span>
        </button>
      </div>
    </Dialog>
  );
}
