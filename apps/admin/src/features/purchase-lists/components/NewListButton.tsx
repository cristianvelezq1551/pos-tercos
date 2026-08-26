'use client';

import { Button } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import { createPurchaseList } from '../api';

/**
 * Dos formas de arrancar. La primera es la normal: la lista nace con todo lo
 * que está bajo el mínimo y quien compra ajusta, en vez de teclear desde cero
 * —que es donde se olvidan cosas—.
 *
 * El mensaje de error va ACOTADO: esta columna del encabezado no se encoge, y
 * un texto largo suelto acá le come el espacio al título.
 */
export function NewListButton() {
  const router = useRouter();
  const [pending, setPending] = useState<'auto' | 'vacia' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function crear(kind: 'auto' | 'vacia') {
    setPending(kind);
    setError(null);
    try {
      const list = await createPurchaseList({
        title: `Pedido del ${new Date().toLocaleDateString('es-CO')}`,
        prefillFromLowStock: kind === 'auto',
      });
      router.push(`/purchase-lists/${list.id}`);
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo crear la lista.'));
      setPending(null);
    }
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button size="sm" onClick={() => void crear('auto')} disabled={pending !== null}>
          {pending === 'auto' ? 'Creando…' : 'Nueva lista con lo que falta'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void crear('vacia')}
          disabled={pending !== null}
        >
          {pending === 'vacia' ? 'Creando…' : 'Empezar vacía'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="max-w-xs break-words text-xs text-destructive sm:text-right">
          {error}
        </p>
      ) : null}
    </div>
  );
}
