'use client';

import {
  POS_NAMESPACE,
  WebOrderEventSchema,
  type PublicWebOrder,
} from '@pos-tercos/types';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { fetchPendingWebOrders } from '../api';
import { saleToPublicWebOrder } from '../lib/project';

const API_WS_URL =
  process.env.NEXT_PUBLIC_API_WS_URL ?? 'http://localhost:3001';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Sincroniza la lista de órdenes web pendientes contra el WS.
 * - `web-order.created` → agrega al state si type=WEB_*.
 * - `web-order.cancelled` → quita del state.
 *
 * (`web-order.customer-paid` removido en FASE 14.A.)
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

  useEffect(() => {
    if (!token) return;

    const socket = io(`${API_WS_URL}${POS_NAMESPACE}`, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnection('connected');
      // Al (re)conectar, recuperar pedidos que entraron mientras estábamos
      // desconectados (el WS no reenvía eventos perdidos durante la caída).
      void fetchPendingWebOrders()
        .then((sales) => {
          const projected = sales
            .map(saleToPublicWebOrder)
            .filter((o): o is PublicWebOrder => o !== null);
          setOrders(projected);
        })
        .catch(() => undefined);
    });
    socket.on('disconnect', () => setConnection('disconnected'));
    socket.on('connect_error', () => setConnection('error'));
    socket.on('auth.error', () => setConnection('error'));

    const apply = (raw: unknown) => {
      const parsed = WebOrderEventSchema.safeParse(raw);
      if (!parsed.success) return;
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

    // Red de seguridad: el badge cuenta PENDIENTE_PAGO. Cuando el cajero
    // confirma/rechaza un pedido NO llega evento web-order, así que sin esto
    // el contador quedaba stale (seguía contando pedidos ya cobrados/entregados).
    // Re-sincroniza cada 12s contra REST (fuente de verdad).
    const resync = () =>
      void fetchPendingWebOrders()
        .then((sales) => {
          const projected = sales
            .map(saleToPublicWebOrder)
            .filter((o): o is PublicWebOrder => o !== null);
          setOrders(projected);
        })
        .catch(() => undefined);
    const pollId = setInterval(resync, 12_000);

    return () => {
      clearInterval(pollId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  return { orders, connection };
}
