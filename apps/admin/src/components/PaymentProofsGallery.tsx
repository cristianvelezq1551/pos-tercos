'use client';

import { MAX_PROOFS_POR_PAGO } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { getErrorMessage } from '../lib/errors';
import { prepararFoto } from '../lib/subir-archivo';

/**
 * Los comprobantes de UN pago. Son varios a propósito: una transferencia
 * partida en dos, el soporte del banco más la foto del recibo, la consignación
 * y el extracto. Con una sola imagen la segunda se perdía.
 *
 * La misma pieza sirve para factura, costo fijo, compromiso y abono de nómina:
 * cada pantalla le pasa cómo se lee, cómo se agrega y cómo se quita.
 */
export function PaymentProofsGallery({
  count,
  proofUrl,
  onAdd,
  onRemove,
  puedeQuedarVacio = false,
  readOnly = false,
}: {
  /** Cuántos comprobantes tiene el pago. */
  count: number;
  /** URL del comprobante en esa posición (0 = el primero). */
  proofUrl: (index: number) => string;
  /** Sube las imágenes elegidas. Debe refrescar el `count` al terminar. */
  onAdd?: (files: File[]) => Promise<void>;
  /** Quita el comprobante de esa posición. Debe refrescar el `count`. */
  onRemove?: (index: number) => Promise<void>;
  /** true = el pago admite quedarse sin comprobante (compromisos, nómina). */
  puedeQuedarVacio?: boolean;
  /** Solo mirar: sin botones de agregar ni quitar. */
  readOnly?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pendiente, setPendiente] = useState<null | 'subiendo' | 'quitando'>(null);
  const [error, setError] = useState<string | null>(null);
  // La imagen abierta en grande. Un comprobante se lee con el número, no con
  // una miniatura de 96 px.
  const [abierta, setAbierta] = useState<number | null>(null);

  const ocupado = pendiente !== null;
  const lleno = count >= MAX_PROOFS_POR_PAGO;
  const ultimo = count <= 1 && !puedeQuedarVacio;

  const agregar = async (files: FileList): Promise<void> => {
    if (!onAdd) return;
    setError(null);
    setPendiente('subiendo');
    try {
      const caben = Array.from(files).slice(0, MAX_PROOFS_POR_PAGO - count);
      const listos = await Promise.all(caben.map((f) => prepararFoto(f, 'comprobante-pago')));
      await onAdd(listos);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudieron subir los comprobantes.'));
    } finally {
      setPendiente(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const quitar = async (index: number): Promise<void> => {
    if (!onRemove) return;
    setError(null);
    setPendiente('quitando');
    try {
      await onRemove(index);
      setAbierta(null);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo quitar el comprobante.'));
    } finally {
      setPendiente(null);
    }
  };

  return (
    <div className="space-y-3">
      {count === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Este pago no tiene comprobantes.
        </p>
      ) : abierta !== null ? (
        <div className="space-y-2">
          <div className="flex justify-center rounded-lg border border-border bg-muted/30 p-2">
            <img
              src={proofUrl(abierta)}
              alt={`Comprobante ${abierta + 1} de ${count}`}
              className="max-h-[60vh] w-auto rounded"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Comprobante {abierta + 1} de {count}
            </span>
            <Button variant="outline" size="sm" onClick={() => setAbierta(null)}>
              Ver todos
            </Button>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: count }, (_, i) => (
            <li key={i} className="relative">
              <button
                type="button"
                onClick={() => setAbierta(i)}
                className="block w-full overflow-hidden rounded-lg border border-border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label={`Ver el comprobante ${i + 1} en grande`}
              >
                <img
                  src={proofUrl(i)}
                  alt={`Comprobante ${i + 1}`}
                  className="h-28 w-full object-cover"
                />
              </button>
              {!readOnly && onRemove && !ultimo ? (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void quitar(i)}
                  title="Quitar este comprobante"
                  aria-label={`Quitar el comprobante ${i + 1}`}
                  className="absolute right-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card/90 text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && onAdd ? (
        <>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={ocupado || lleno}
            onClick={() => inputRef.current?.click()}
          >
            {pendiente === 'subiendo'
              ? 'Subiendo…'
              : count > 0
                ? 'Agregar otro comprobante'
                : 'Subir comprobante'}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) void agregar(files);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {lleno
              ? `Llegaste al máximo de ${MAX_PROOFS_POR_PAGO} comprobantes.`
              : 'Puedes subir varias imágenes a la vez. JPEG, PNG o WebP.'}
            {ultimo && count > 0 ? ' Este pago necesita al menos un comprobante.' : ''}
          </p>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
