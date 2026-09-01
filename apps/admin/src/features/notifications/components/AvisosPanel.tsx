'use client';

import type { PushDevice } from '@pos-tercos/types';
import { Button, Card, Switch } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import {
  deletePushSubscription,
  getPushStatus,
  savePushSubscription,
  sendPushTest,
} from '../api/client';
import {
  datosDeSuscripcion,
  desuscribirDispositivo,
  revisarSoporte,
  suscribirDispositivo,
  suscripcionActual,
  type SoporteAvisos,
} from '../lib/push-browser';
import { DispositivosList } from './DispositivosList';
import { SinSoporteAviso } from './SinSoporteAviso';

/**
 * Activa o desactiva los avisos EN ESTE DISPOSITIVO. El interruptor es por
 * dispositivo y no por persona a propósito: el permiso lo da el navegador, así
 * que el celular y el computador se activan por separado.
 */
export function AvisosPanel() {
  const [soporte, setSoporte] = useState<SoporteAvisos | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [activo, setActivo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const sub = await suscripcionActual();
    setActivo(sub !== null);
    const status = await getPushStatus(sub?.endpoint);
    setPublicKey(status.publicKey);
    setDevices(status.devices);
    // Este dispositivo cree estar suscrito pero el servidor no lo tiene: pasa
    // si borraron la fila o si se reinstaló el navegador. Se vuelve a guardar
    // en silencio en vez de mostrar un interruptor encendido que no avisa.
    if (sub && !status.devices.some((d) => d.isCurrent)) {
      await savePushSubscription(datosDeSuscripcion(sub));
      setDevices((await getPushStatus(sub.endpoint)).devices);
    }
  }, []);

  useEffect(() => {
    const s = revisarSoporte();
    setSoporte(s);
    if (!s.ok) {
      setCargando(false);
      return;
    }
    recargar()
      .catch((e: unknown) => setError(getErrorMessage(e)))
      .finally(() => setCargando(false));
  }, [recargar]);

  const alternar = async (encender: boolean) => {
    setTrabajando(true);
    setError(null);
    setAviso(null);
    try {
      if (encender) {
        if (!publicKey) throw new Error('El servidor todavía no tiene configuradas las llaves.');
        const sub = await suscribirDispositivo(publicKey);
        await savePushSubscription(datosDeSuscripcion(sub));
      } else {
        const sub = await suscripcionActual();
        // Primero el servidor: si se suelta el navegador y falla la baja, el
        // servidor seguiría mandando avisos a un dispositivo que ya no escucha.
        if (sub) await deletePushSubscription(sub.endpoint);
        await desuscribirDispositivo();
      }
      await recargar();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
      // El interruptor refleja lo que el navegador dice, no lo que se quiso.
      await recargar().catch(() => undefined);
    } finally {
      setTrabajando(false);
    }
  };

  const probar = async () => {
    setTrabajando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await sendPushTest();
      setAviso(
        r.sent > 0
          ? `Aviso enviado a ${r.sent} ${r.sent === 1 ? 'dispositivo' : 'dispositivos'}. Debería aparecer en un momento.`
          : `No se envió: ${r.reason ?? 'ningún dispositivo lo aceptó'}.`,
      );
      await recargar();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setTrabajando(false);
    }
  };

  if (cargando) return <Card className="p-6 text-sm text-ink-400">Cargando…</Card>;
  if (soporte && !soporte.ok) return <SinSoporteAviso motivo={soporte.motivo} />;

  return (
    <div className="space-y-4">
      {publicKey === null && (
        <Card className="border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          El servidor todavía no tiene las llaves de notificación configuradas, así que no puede
          enviar avisos. Hay que generarlas y ponerlas en las variables del servidor.
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-medium">Avisos en este dispositivo</h2>
            <p className="mt-1 text-sm text-ink-400">
              Descuadres de caja, anulaciones, cortesías, descuentos manuales, subidas de costo e
              insumos que cruzan el mínimo. Llegan aunque tengas la app cerrada.
            </p>
          </div>
          <Switch
            // Sin nombre, un lector de pantalla solo anuncia "switch".
            aria-label="Avisos en este dispositivo"
            checked={activo}
            disabled={trabajando || publicKey === null}
            onChange={(e) => void alternar(e.target.checked)}
          />
        </div>

        {activo && (
          <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
            <Button variant="secondary" disabled={trabajando} onClick={() => void probar()}>
              Enviar aviso de prueba
            </Button>
            <span className="text-xs text-muted-foreground">
              Comprueba que de verdad llega. Un aviso que nadie probó no se sabe si suena.
            </span>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {aviso && <p className="mt-3 text-sm text-emerald-400">{aviso}</p>}
      </Card>

      <DispositivosList devices={devices} />
    </div>
  );
}
