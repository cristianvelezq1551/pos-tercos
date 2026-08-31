import { AlertTriangle } from 'lucide-react';

/**
 * Qué significa aprobar o rechazar un conteo.
 *
 * La pantalla ofrecía dos botones —"Aprobar y ajustar" y "Rechazar"— sin decir
 * qué hacía ninguno. Y desde que el faltante de conteo es una PÉRDIDA con línea
 * propia en el estado financiero (§7.v43), aprobar no es un trámite: baja el
 * resultado del mes por el valor de lo que no apareció. Quien decide tiene que
 * saber eso ANTES de tocar el botón.
 */
export function CountApprovalGuide() {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
      <p>
        El cocinero cuenta <strong className="text-foreground">a ciegas</strong>: no ve cuánto
        debería haber, así que lo que anota es lo que vio. Tú sí ves las dos cifras y decides.
      </p>
      <dl className="mt-2 space-y-1.5">
        <div>
          <dt className="inline font-semibold text-foreground">Aprobar y ajustar: </dt>
          <dd className="inline">
            el stock del sistema pasa a ser lo contado. Si faltaba, esa diferencia se registra como{' '}
            <strong className="text-foreground">pérdida del mes</strong> (aparece en Finanzas y en
            Uso y mermas, valorizada a lo que costó). Si sobraba, el stock sube.
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold text-foreground">Rechazar: </dt>
          <dd className="inline">
            no cambia nada — ni el stock, ni las cuentas. El conteo queda archivado como descartado.
            Es para cuando el número está mal, no para cuando el faltante te incomoda.
          </dd>
        </div>
      </dl>
      <p className="mt-2">
        <span className="font-semibold text-foreground">Antes de aprobar, revisa</span> que hayan
        contado en la unidad correcta (gramos y no paquetes), que no falte cargar una factura que ya
        llegó, y que no haya producción sin registrar. Cualquiera de esas tres explica una
        diferencia que no es una pérdida real.
      </p>
      <p className="mt-2 flex items-start gap-1.5 text-warning">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Aprobar no se deshace con un botón: el movimiento queda para siempre. Si te equivocas, se
          corrige con otro conteo, y esa corrección se acredita al mes en que se declaró la pérdida.
        </span>
      </p>
    </div>
  );
}
