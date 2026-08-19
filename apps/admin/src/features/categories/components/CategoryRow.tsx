'use client';

import { Button, Input } from '@pos-tercos/ui';
import { ArrowDown, ArrowUp, Check, Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { ProductCategory } from '@pos-tercos/types';

interface CategoryRowProps {
  category: ProductCategory;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onRename: (name: string) => void;
  onToggleActive: (isActive: boolean) => void;
  onMove: (dir: 'up' | 'down') => void;
  onDelete: () => void;
}

export function CategoryRow({
  category,
  isFirst,
  isLast,
  busy,
  onRename,
  onToggleActive,
  onMove,
  onDelete,
}: CategoryRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);
  const count = category.productCount ?? 0;

  const commit = () => {
    const next = draft.trim();
    if (next && next !== category.name) onRename(next);
    setEditing(false);
  };

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-3">
        <div className="flex flex-col">
          <button
            type="button"
            disabled={busy}
            onClick={() => onMove('up')}
            aria-label="Subir"
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            style={{ visibility: isFirst ? 'hidden' : 'visible' }}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onMove('down')}
            aria-label="Bajar"
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            style={{ visibility: isLast ? 'hidden' : 'visible' }}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
      <td className="py-2 pr-3">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={draft}
              maxLength={60}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') {
                  setDraft(category.name);
                  setEditing(false);
                }
              }}
              className="h-8 w-48"
            />
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={commit}>
              <Check className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setDraft(category.name);
                setEditing(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
            className="group inline-flex items-center gap-2 text-left"
          >
            <span className={category.isActive ? 'font-medium' : 'text-muted-foreground line-through'}>
              {category.name}
            </span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
      </td>
      <td className="py-2 pr-3 text-sm tabular-nums text-muted-foreground">
        {count} {count === 1 ? 'producto' : 'productos'}
      </td>
      <td className="py-2 pr-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggleActive(!category.isActive)}
          className={`rounded-md px-2 py-0.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            category.isActive
              ? 'bg-success/15 text-success hover:bg-success/25'
              : 'bg-ink-800 text-muted-foreground hover:bg-ink-700'
          }`}
        >
          {category.isActive ? 'Activa' : 'Inactiva'}
        </button>
      </td>
      <td className="py-2 text-right">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy || count > 0}
          title={count > 0 ? 'Reasigna sus productos antes de borrar' : 'Borrar categoría'}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </td>
    </tr>
  );
}
