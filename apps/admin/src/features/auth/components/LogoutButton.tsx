'use client';

import { Button } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { logoutRequest } from '../api/logout';

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleClick = async () => {
    await logoutRequest();
    // Limpia la shell de caja cacheada por el SW: lleva datos del operativo
    // (caja/historial) y otro operativo en el mismo equipo no debe verla offline.
    navigator.serviceWorker?.controller?.postMessage('clear-nav-cache');
    startTransition(() => {
      router.replace('/login');
      router.refresh();
    });
  };

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={pending}>
      {pending ? 'Saliendo…' : 'Cerrar sesión'}
    </Button>
  );
}
