'use client';

import { cn } from '@pos-tercos/ui';
import type { Ingredient, InvoiceDraftResponse, Supplier } from '@pos-tercos/types';
import { useEffect, useState } from 'react';
import { listIngredients } from '../../ingredients';
import { uploadInvoicePhoto } from '../api/client';
import { listSuppliers } from '../utils/suppliers-api';
import { InvoiceConfirmModal } from './InvoiceConfirmModal';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif';

export function InvoiceUploader() {
  const [draft, setDraft] = useState<InvoiceDraftResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  useEffect(() => {
    Promise.all([listSuppliers(), listIngredients()])
      .then(([s, i]) => {
        setSuppliers(s);
        setIngredients(i);
      })
      .catch(() => {
        // silent — pickers will refetch on demand
      });
  }, []);

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const result = await uploadInvoicePhoto(file);
      setDraft(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => setDraft(null);

  const handleConfirmed = async () => {
    setDraft(null);
    // Refresh ingredients since user may have created some inline
    listIngredients()
      .then(setIngredients)
      .catch(() => {});
  };

  return (
    <div className="space-y-6">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors',
          dragOver
            ? 'border-blue-400 bg-blue-50/50'
            : 'border-gray-300 bg-white hover:border-gray-400',
          uploading && 'pointer-events-none opacity-60',
        )}
      >
        <input
          type="file"
          accept={ACCEPTED_TYPES}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            // reset input so the same file can be picked again
            e.target.value = '';
          }}
        />
        <svg
          className={cn(
            'h-12 w-12',
            dragOver ? 'text-blue-500' : 'text-gray-400',
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 7.5m0 0L7.5 12M12 7.5v12"
          />
        </svg>
        <p className="mt-3 text-sm font-medium text-gray-900">
          {uploading ? 'Procesando con IA…' : 'Arrastrá una foto o hacé click para elegir'}
        </p>
        <p className="mt-1 text-xs text-gray-500">JPG, PNG, WebP o GIF · hasta 10 MB</p>
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-semibold">Cómo funciona</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-blue-800">
          <li>La IA lee la foto y extrae proveedor, ítems, cantidades y precios.</li>
          <li>Aparece un modal con todo cargado para que revises y edites.</li>
          <li>Confirmar genera los movimientos de inventario y guarda la factura.</li>
        </ol>
      </div>

      {draft && (
        <InvoiceConfirmModal
          draft={draft}
          suppliers={suppliers}
          ingredients={ingredients}
          onClose={handleClose}
          onConfirmed={handleConfirmed}
          onIngredientCreated={(ingredient) => setIngredients((prev) => [...prev, ingredient].sort((a, b) => a.name.localeCompare(b.name)))}
        />
      )}
    </div>
  );
}
