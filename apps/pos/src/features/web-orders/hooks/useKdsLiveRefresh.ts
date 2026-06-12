'use client';

import { KDS_NAMESPACE } from '@pos-tercos/types';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { keepSocketAuthFresh } from '../../../lib/socket-auth';

const API_WS_URL =
  process.env.NEXT_PUBLIC_API_WS_URL ?? 'http://localhost:3001';

/**
 * Suscribe al WS del KDS (`/ws/kds`) para que el cajero vea el estado de los
 * pedidos en tiempo real, igual que la cocina. En cada evento llama [onChange]
 * (el modal refetchea). El cajero ya está permitido en este WS.
 */
export function useKdsLiveRefresh(
  token: string | null,
  enabled: boolean,
  onChange: () => void,
) {
  useEffect(() => {
    if (!enabled || !token) return;
    const socket = io(`${API_WS_URL}${KDS_NAMESPACE}`, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    const disposeAuth = keepSocketAuthFresh(socket);
    socket.on('order.created', onChange);
    socket.on('order.status.changed', onChange);
    return () => {
      disposeAuth();
      socket.disconnect();
    };
    // onChange debe ser estable (useCallback en el caller).
  }, [token, enabled, onChange]);
}
