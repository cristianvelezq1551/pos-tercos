'use client';

import { PaymentProofsDialog } from '../../../components/PaymentProofsDialog';
import { Paperclip } from 'lucide-react';
import { useState } from 'react';

/**
 * "Este pago tiene comprobante" — y **se abre al tocarlo**.
 *
 * Es un icono y no la palabra "Comprobante" porque en una tarjeta de ~270 px
 * esa etiqueta se llevaba un tercio de la fila. Pero un clip pide que lo
 * toquen: cuando era solo informativo, el dueño intentaba abrirlo y no pasaba
 * nada. Aquí el cockpit es una vista de AUDITORÍA, así que el diálogo va en
 * modo lectura; agregar o quitar comprobantes se hace en el módulo de cada
 * pago, donde además está el resto de la información.
 *
 * ⚠️ El área de clic la fijan `min-h`/`min-w`, NUNCA el contenido: con un solo
 * comprobante no se escribe el número y el botón quedaría del tamaño del icono
 * (12 px), que es el bug que el dueño reportó en producción.
 */
export function ProofMark({
  count,
  title,
  description,
  proofUrl,
}: {
  count: number;
  /** Encabezado del diálogo, ej. "Comprobante de la factura". */
  title: string;
  /** Qué pago es, ej. "FRUVER · F7162626". */
  description: string;
  proofUrl: (index: number) => string;
}) {
  const [abierto, setAbierto] = useState(false);
  if (count <= 0) return null;

  const texto = count > 1 ? `Ver ${count} comprobantes` : 'Ver comprobante';
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={texto}
        aria-label={`${texto} de ${description}`}
        className="-my-1.5 -mr-1.5 inline-flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center gap-0.5 rounded-md text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {count > 1 ? count : null}
      </button>
      {abierto ? (
        <PaymentProofsDialog
          title={title}
          description={description}
          initialCount={count}
          proofUrl={proofUrl}
          readOnly
          onClose={() => setAbierto(false)}
        />
      ) : null}
    </>
  );
}
