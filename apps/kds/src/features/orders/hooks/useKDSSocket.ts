'use client';

import {
  KDS_NAMESPACE,
  KdsEventSchema,
  type Sale,
} from '@pos-tercos/types';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const KITCHEN_STATUSES = new Set<Sale['status']>([
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
]);

const API_WS_URL =
  process.env.NEXT_PUBLIC_API_WS_URL ?? 'http://localhost:3001';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Sincroniza la cola de cocina contra el WS del backend. Recibe `initial`
 * (snapshot SSR) + `token` (JWT del cocinero leído de la cookie httpOnly por
 * SSR; el browser no puede leer la cookie cross-origin, por eso lo pasamos
 * en el handshake.auth).
 */
export function useKDSSocket(initial: Sale[], token: string | null) {
  const [orders, setOrders] = useState<Sale[]>(initial);
  const [connection, setConnection] = useState<ConnectionState>(
    token ? 'connecting' : 'error',
  );
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    setOrders(initial);
  }, [initial]);

  useEffect(() => {
    if (!token) return;

    const socket = io(`${API_WS_URL}${KDS_NAMESPACE}`, {
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
    socket.on('auth.error', (err: { reason?: string }) => {
      // eslint-disable-next-line no-console
      console.error('[KDS WS] auth.error', err);
      setConnection('error');
    });

    const apply = (payload: unknown) => {
      const parsed = KdsEventSchema.safeParse(payload);
      if (!parsed.success) return;
      const sale = parsed.data.sale;

      setOrders((current) => {
        const idx = current.findIndex((s) => s.id === sale.id);
        if (!KITCHEN_STATUSES.has(sale.status)) {
          if (idx === -1) return current;
          return current.filter((s) => s.id !== sale.id);
        }
        if (idx === -1) {
          const next = [...current, sale];
          next.sort((a, b) => {
            const aTs = a.paidAt ? new Date(a.paidAt).getTime() : 0;
            const bTs = b.paidAt ? new Date(b.paidAt).getTime() : 0;
            return aTs - bTs;
          });
          return next;
        }
        const next = current.slice();
        next[idx] = sale;
        return next;
      });
    };

    socket.on('order.created', apply);
    socket.on('order.status.changed', apply);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  return { orders, setOrders, connection };
}
