'use client';

import { Label } from '@pos-tercos/ui';

interface ProductFormEmojiFieldProps {
  emoji: string;
  onChange: (emoji: string) => void;
  disabled?: boolean;
}

/** Emojis frecuentes de comida rápida (comidas + bebidas + postres). El usuario
 *  también puede pegar cualquier otro emoji en el input. */
const SUGGESTED = [
  // Comidas
  '🍔', '🍟', '🌭', '🥪', '🥙', '🌮', '🌯', '🫓',
  '🧆', '🥟', '🍗', '🍖', '🥩', '🍕', '🥓', '🍳',
  '🧀', '🥗', '🍝', '🍜', '🍚', '🍲', '🥘', '🍤',
  // Bebidas
  '🥤', '🧃', '🧋', '🥛', '💧', '🍾', '🧉', '☕',
  '🍺', '🍹',
  // Postres
  '🍦', '🍨', '🍰', '🧁', '🍪', '🍩', '🍫',
] as const;

export function ProductFormEmojiField({ emoji, onChange, disabled }: ProductFormEmojiFieldProps) {
  return (
    <div className="space-y-2">
      <Label>Ícono (emoji)</Label>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED.map((e) => {
          const selected = emoji === e;
          return (
            <button
              key={e}
              type="button"
              disabled={disabled}
              onClick={() => onChange(selected ? '' : e)}
              aria-pressed={selected}
              aria-label={`Elegir ${e}`}
              className={`flex h-9 w-9 items-center justify-center rounded-md border text-lg transition-colors disabled:opacity-50 ${
                selected
                  ? 'border-primary bg-primary/15 ring-1 ring-primary'
                  : 'border-border bg-background hover:bg-muted'
              }`}
            >
              {e}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={emoji}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Otro emoji…"
          maxLength={24}
          className="h-9 w-24 rounded-md border border-input bg-background px-3 text-center text-lg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        {emoji ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange('')}
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Quitar
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Se muestra en el menú online cuando el producto no tiene foto.
      </p>
    </div>
  );
}
