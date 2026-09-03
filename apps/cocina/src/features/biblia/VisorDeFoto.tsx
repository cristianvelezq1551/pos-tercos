'use client';

import { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

/**
 * La foto a pantalla completa, con acercamiento.
 *
 * En la ficha la imagen mide unos 200 px de alto, y varias traen el despiece
 * del plato con el gramaje de cada ingrediente escrito en letra diminuta: ahí
 * no se lee nada. El pellizco del navegador amplía la página entera, no la
 * foto, así que hace falta un visor propio.
 *
 * Dos niveles y no un pellizco continuo a propósito: el cocinero tiene las
 * manos ocupadas y un toque es más fácil de acertar que un gesto de dos dedos.
 * Al acercar, el contenedor scrollea para recorrer la imagen.
 */
export function VisorDeFoto({
  url,
  label,
  alt,
  onClose,
}: {
  url: string | null;
  label?: string | null;
  alt: string;
  onClose: () => void;
}) {
  const [cerca, setCerca] = useState(false);

  // Al abrir otra foto se vuelve a la vista completa: heredar el acercamiento
  // de la anterior deja al cocinero mirando una esquina sin saber de qué.
  useEffect(() => setCerca(false), [url]);

  // En FASE DE CAPTURA y deteniendo la propagación: el diálogo de la receta
  // también cierra con Escape, y sin esto una sola pulsación cerraba los dos —
  // se miraba la foto en grande y se perdía la receta de atrás.
  useEffect(() => {
    if (!url) return;
    const cerrarConEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', cerrarConEsc, true);
    return () => document.removeEventListener('keydown', cerrarConEsc, true);
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[60] flex flex-col bg-ink-950/95"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          {label || alt}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setCerca((v) => !v)}
            aria-label={cerca ? 'Alejar' : 'Acercar'}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/10"
          >
            {cerca ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className={`flex-1 ${cerca ? 'overflow-auto' : 'flex items-center justify-center p-4'}`}>
        <img
          src={url}
          alt={alt}
          onClick={() => setCerca((v) => !v)}
          className={
            cerca
              ? 'w-[250%] max-w-none cursor-zoom-out'
              : 'max-h-full max-w-full cursor-zoom-in object-contain'
          }
        />
      </div>

      <p className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
        {cerca ? 'Desliza para recorrerla · toca para alejar' : 'Toca la foto para acercarla'}
      </p>
    </div>
  );
}
