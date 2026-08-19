'use client';

import {
  POS_NAMESPACE,
  WebOrderEventSchema,
  type PublicWebOrder,
} from '@pos-tercos/types';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { logError } from '../../../lib/client-log';
import { keepSocketAuthFresh } from '../../../lib/socket-auth';
import { usePolling } from '../../../lib/use-polling';
import { fetchPendingWebOrders } from '../api';
import { saleToPublicWebOrder } from '../lib/project';

const API_WS_URL =
  process.env.NEXT_PUBLIC_API_WS_URL ?? 'http://localhost:3001';

/** Red de seguridad REST (el WS no reenvía eventos perdidos en una caída). */
const RESYNC_MS = 12_000;

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Sincroniza la lista de órdenes web pendientes contra el WS `/ws/pos`.
 * - `web-order.created` → agrega al state si sigue PENDIENTE_PAGO.
 * - `web-order.cancelled` → quita del state.
 * - Reconexión con token VIVO (keepSocketAuthFresh): el JWT del handshake
 *   SSR vence; sin refresh, una reconexión horas después queda rechazada.
 * - Resync REST cada 12s (pausado con pestaña oculta) — cubre eventos
 *   perdidos y transiciones que no emiten evento (confirmar/entregar).
 */
export function useWebOrdersSocket(
  initial: PublicWebOrder[],
  token: string | null,
) {
  const [orders, setOrders] = useState<PublicWebOrder[]>(initial);
  const [connection, setConnection] = useState<ConnectionState>(
    token ? 'connecting' : 'error',
  );
  const socketRef = useRef<Socket | null>(null);

  // `initial` (SSR) solo siembra el estado en el primer mount; después manda
  // el WS. No re-sincronizamos con `initial` para no revertir un removeLocal
  // optimista cuando el layout hace router.refresh.

  const resync = async () => {
    try {
      const sales = await fetchPendingWebOrders();
      const projected = sales
        .map(saleToPublicWebOrder)
        .filter((o): o is PublicWebOrder => o !== null);
      setOrders(projected);
    } catch (err) {
      logError('web-orders-resync', err);
    }
  };

  // El resync corre siempre que haya sesión (aunque el socket esté caído es
  // justamente cuando más lo necesitamos), pausado con la pestaña oculta.
  usePolling(resync, RESYNC_MS, { enabled: token !== null, immediate: false });

  useEffect(() => {
    if (!token) return;

    const socket = io(`${API_WS_URL}${POS_NAMESPACE}`, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;
    const disposeAuth = keepSocketAuthFresh(socket);

    socket.on('connect', () => {
      setConnection('connected');
      // Al (re)conectar, recuperar pedidos que entraron durante la caída.
      void resync();
    });
    socket.on('disconnect', () => setConnection('disconnected'));
    socket.on('connect_error', (err) => {
      setConnection('error');
      logError('web-orders-socket', err, { stage: 'connect_error' });
    });
    socket.on('auth.error', () => setConnection('error'));

    const apply = (raw: unknown) => {
      const parsed = WebOrderEventSchema.safeParse(raw);
      if (!parsed.success) {
        logError('web-orders-socket', 'evento con shape inválido', {
          issues: parsed.error.issues.slice(0, 3),
        });
        return;
      }
      const { event, order } = parsed.data;
      setOrders((current) => {
        if (event === 'web-order.cancelled') {
          return current.filter((o) => o.id !== order.id);
        }
        // si la orden ya no es PENDIENTE_PAGO al server, sacarla del drawer
        if (order.status !== 'PENDIENTE_PAGO') {
          return current.filter((o) => o.id !== order.id);
        }
        const idx = current.findIndex((o) => o.id === order.id);
        if (idx === -1) {
          // Insertar manteniendo orden por createdAt asc (FIFO)
          const next = [...current, order];
          next.sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
          return next;
        }
        const next = current.slice();
        next[idx] = order;
        return next;
      });
    };

    socket.on('web-order.created', apply);
    socket.on('web-order.cancelled', apply);

    return () => {
      disposeAuth();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  return { orders, connection };
}
