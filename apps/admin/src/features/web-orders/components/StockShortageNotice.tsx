'use client';

import { Button } from '@pos-tercos/ui';
import { PackageX } from 'lucide-react';
import { useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import { cancelWebOrder } from '../api';

/**
 * "Se acabó el stock" no es un error del sistema: es una respuesta al cajero.
 *
 * El pedido web es una SOLICITUD hasta que se aprueba (no toca inventario). Si
 * entre que el cliente pidió y el cajero aprueba se acabó un insumo, el cobro
 * se rechaza — y correspondía, porque el stock se descuenta al aprobar. Pero un
 * 409 crudo deja al cajero sin saber qué hacer: acá se le dice QUÉ faltó y se
 * le da el botón para rechazar la solicitud, que es la única salida.
 */
export function StockShortageNotice({
  saleId,
  message,
  onRejected,
}: {
  saleId: string;
  message: string;
  onRejected: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // El backend manda "Stock insuficiente para esta venta:\n· Pan (necesita 2, hay 0)".
  const faltantes = message
    .split('\n')
    .map((l) => l.replace(/^·\s*/, '').trim())
    .filter((l) => l && !l.toLowerCase().startsWith('stock insuficiente'));

  const reject = async () => {
    setBusy(true);
    setErr(null);
    try {
      await cancelWebOrder(saleId);
      onRejected();
    } catch (e) {
      setErr(getErrorMessage(e, 'No se pudo rechazar'));
      setBusy(false);
    }
  };

  return (
    <section
      role="alert"
      className="rounded-xl border border-destructive/40 bg-destructive/10 p-4"
    >
      <p className="flex items-center gap-2 text-sm font-bold text-destructive">
        <PackageX className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        No se puede aprobar: se acabó el stock
      </p>

      {faltantes.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {faltantes.map((f, i) => (
            <li key={i} className="text-sm text-foreground">
              · {f}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-foreground">{message}</p>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        El pedido sigue sin cobrar y no tocó el inventario. Avisale al cliente por el chat
        antes de rechazarlo — si ya transfirió, hay que devolverle el dinero.
      </p>

      <Button variant="destructive" size="sm" className="mt-3" disabled={busy} onClick={reject}>
        {busy ? 'Rechazando…' : 'Rechazar pedido'}
      </Button>

      {err ? <p className="mt-2 text-xs text-destructive">{err}</p> : null}
    </section>
  );
}
