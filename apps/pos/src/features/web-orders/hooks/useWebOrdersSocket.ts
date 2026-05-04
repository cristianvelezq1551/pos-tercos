'use client';

import {
  POS_NAMESPACE,
  POS_WEB_ORDERS_ROOM,
  WebOrderEventSchema,
  type PublicWebOrder,
} from '@pos-tercos/types';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const API_WS_URL =
  process.env.NEXT_PUBLIC_API_WS_URL ?? 'http://localhost:3001';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Sincroniza la lista de órdenes web pendientes contra el WS.
 * - `web-order.created` → agrega al state si type=WEB_*.
 * - `web-order.cancelled` → quita del state.
 *
 * (`web-order.customer-paid` removido en FASE 14.A; el flujo es
 *  cajero-driven via wa.me desde FASE 9.)
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

  useEffect(() => {
    setOrders(initial);
  }, [initial]);

  useEffect(() => {
    if (!token) return;

    void POS_WEB_ORDERS_ROOM; // imported for clarity
    const socket = io(`${API_WS_URL}${POS_NAMESPACE}`, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnection('connected'));
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

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  /** Patch local: usado tras confirm-payment para sacar la sale del drawer. */
  const removeLocal = (saleId: string) =>
    setOrders((c) => c.filter((o) => o.id !== saleId));

  return { orders, connection, removeLocal };
}
