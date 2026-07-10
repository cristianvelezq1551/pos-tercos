'use client';

import { Button, ConfirmDialog, Input } from '@pos-tercos/ui';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { ProductCategory } from '@pos-tercos/types';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../api/client';
import { CategoryRow } from './CategoryRow';

export function CategoriesManager({ initial }: { initial: ProductCategory[] }) {
  const [cats, setCats] = useState<ProductCategory[]>(initial);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ProductCategory | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setCats(await listCategories());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    await run(() => createCategory({ name }));
    setNewName('');
  };

  const move = (cat: ProductCategory, dir: 'up' | 'down') => {
    const idx = cats.findIndex((c) => c.id === cat.id);
    const neighbor = cats[dir === 'up' ? idx - 1 : idx + 1];
    if (!neighbor) return;
    // Intercambia el orden con el vecino (dos updates).
    void run(async () => {
      await updateCategory(cat.id, { sortOrder: neighbor.sortOrder });
      await updateCategory(neighbor.id, { sortOrder: cat.sortOrder });
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="new-cat" className="text-sm font-medium">
            Nueva categoría
          </label>
          <Input
            id="new-cat"
            value={newName}
            maxLength={60}
            disabled={busy}
            placeholder="Hamburguesas, Bebidas, Acompañamientos…"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
          />
        </div>
        <Button type="button" disabled={busy || !newName.trim()} onClick={handleCreate}>
          <Plus className="mr-1 h-4 w-4" /> Crear
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {cats.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Todavía no hay categorías. Creá la primera arriba.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-8 py-2 pl-4" />
                <th className="py-2 pr-3 pl-0 font-medium">Categoría</th>
                <th className="py-2 pr-3 font-medium">En uso</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 pr-4 text-right font-medium">Borrar</th>
              </tr>
            </thead>
            <tbody className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4">
              {cats.map((c, i) => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  isFirst={i === 0}
                  isLast={i === cats.length - 1}
                  busy={busy}
                  onRename={(name) => void run(() => updateCategory(c.id, { name }))}
                  onToggleActive={(isActive) => void run(() => updateCategory(c.id, { isActive }))}
                  onMove={(dir) => move(c, dir)}
                  onDelete={() => setToDelete(c)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Al renombrar una categoría, todos sus productos se actualizan solos. No se puede borrar una
        categoría que tenga productos: reasignálos o desactivala.
      </p>

      <ConfirmDialog
        open={toDelete !== null}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          const target = toDelete;
          setToDelete(null);
          if (target) await run(() => deleteCategory(target.id));
        }}
        title="¿Borrar categoría?"
        description={`Vas a borrar "${toDelete?.name ?? ''}". Esta acción no se puede deshacer.`}
        confirmLabel="Sí, borrar"
        destructive
        pending={busy}
      />
    </div>
  );
}
