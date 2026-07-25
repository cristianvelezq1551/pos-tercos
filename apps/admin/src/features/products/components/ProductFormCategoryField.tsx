'use client';

import { Button, Input, Label, Select } from '@pos-tercos/ui';
import Link from 'next/link';
import { useState } from 'react';
import { createCategory } from '../../categories';
import { getErrorMessage } from '../../../lib/errors';

const NEW_OPTION = '__new__';

interface ProductFormCategoryFieldProps {
  value: string;
  onChange: (name: string) => void;
  /** Categorías activas del catálogo curado (nombres). */
  categories: string[];
  disabled?: boolean;
  /** Obligatoria al CREAR: sin categoría el producto solo se ve en \"Todo\". */
  required?: boolean;
}

export function ProductFormCategoryField({
  value,
  onChange,
  categories,
  disabled,
  required = false,
}: ProductFormCategoryFieldProps) {
  const [options, setOptions] = useState<string[]>(categories);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El producto puede tener una categoría que ya no está en la lista activa
  // (ej. desactivada): la incluimos para no perderla al editar.
  const all = value && !options.includes(value) ? [value, ...options] : options;

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createCategory({ name });
      setOptions((prev) => (prev.includes(created.name) ? prev : [...prev, created.name]));
      onChange(created.name);
      setCreating(false);
      setNewName('');
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo crear la categoría.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="category">Categoría{required ? ' *' : ''}</Label>
        <Link href="/categories" className="text-xs text-primary hover:underline">
          Administrar
        </Link>
      </div>

      {creating ? (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={newName}
            maxLength={60}
            disabled={busy}
            placeholder="Nombre de la categoría"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleCreate();
              }
              if (e.key === 'Escape') setCreating(false);
            }}
          />
          <Button type="button" size="sm" disabled={busy || !newName.trim()} onClick={handleCreate}>
            Crear
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setCreating(false);
              setNewName('');
            }}
          >
            Cancelar
          </Button>
        </div>
      ) : (
        <Select
          id="category"
          required={required}
          disabled={disabled}
          value={value}
          onChange={(e) => {
            if (e.target.value === NEW_OPTION) {
              setCreating(true);
              return;
            }
            onChange(e.target.value);
          }}
        >
          <option value="">— Sin categoría —</option>
          {all.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={NEW_OPTION}>＋ Crear nueva categoría…</option>
        </Select>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
