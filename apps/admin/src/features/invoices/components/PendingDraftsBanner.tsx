import Link from 'next/link';
import { FileClock } from 'lucide-react';

/**
 * Aviso de facturas guardadas y nunca confirmadas.
 *
 * Es el contrapeso del botón "Guardar para revisar": un borrador olvidado
 * significa mercancía que llegó y que el sistema no tiene: el inventario queda
 * corto, la caja bloquea productos por falta de stock y el gasto no aparece en
 * el resultado del mes. Por eso el aviso está donde se cargan las facturas y no
 * escondido detrás de una pestaña.
 */
export function PendingDraftsBanner({ count }: { count: number }) {
  if (count === 0) return null;
  const uno = count === 1;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2.5 text-sm text-warning">
      <FileClock className="h-4 w-4 shrink-0" strokeWidth={2} />
      <p>
        <span className="font-semibold">
          {uno ? 'Hay 1 factura guardada sin confirmar' : `Hay ${count} facturas guardadas sin confirmar`}
        </span>
        . Mientras no {uno ? 'la confirmes' : 'las confirmes'}, esa mercancía no está en el
        inventario ni el gasto entra al resultado del mes.
      </p>
      <Link
        href="/invoices?status=PENDING_REVIEW"
        className="font-medium text-warning underline underline-offset-2"
      >
        {uno ? 'Verla' : 'Verlas'}
      </Link>
    </div>
  );
}
