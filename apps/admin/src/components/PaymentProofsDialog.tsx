'use client';

import { Button, Dialog } from '@pos-tercos/ui';
import { useState } from 'react';
import { PaymentProofsGallery } from './PaymentProofsGallery';

/**
 * Diálogo de comprobantes de un pago. Cada feature (factura, costo fijo,
 * compromiso, abono de nómina) le pasa cómo se leen, cómo se agregan y cómo se
 * quitan los suyos — la pantalla es la misma porque la pregunta es la misma.
 */
export function PaymentProofsDialog({
  title,
  description,
  initialCount,
  proofUrl,
  onAdd,
  onRemove,
  puedeQuedarVacio = false,
  readOnly = false,
  onClose,
  onChanged,
}: {
  title: string;
  description: string;
  initialCount: number;
  proofUrl: (index: number) => string;
  /** Sube y devuelve cuántos comprobantes quedaron. */
  onAdd?: (files: File[]) => Promise<number>;
  /** Quita y devuelve cuántos comprobantes quedaron. */
  onRemove?: (index: number) => Promise<number>;
  puedeQuedarVacio?: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  // El diálogo se queda abierto tras agregar o quitar, así que el conteo local
  // manda hasta que la página vuelva a cargar los datos.
  const [count, setCount] = useState(initialCount);

  const refrescar = (nuevo: number): void => {
    setCount(nuevo);
    onChanged?.();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={count > 1 ? `${title} (${count})` : title}
      description={description}
      maxWidth="max-w-2xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <PaymentProofsGallery
        count={count}
        proofUrl={proofUrl}
        readOnly={readOnly}
        puedeQuedarVacio={puedeQuedarVacio}
        onAdd={onAdd ? async (files) => refrescar(await onAdd(files)) : undefined}
        onRemove={onRemove ? async (i) => refrescar(await onRemove(i)) : undefined}
      />
    </Dialog>
  );
}
