'use client';

import { Button } from '@pos-tercos/ui';
import { LogOut } from 'lucide-react';
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
    // En un teléfono la barra de caja no da para el texto: abajo de `sm` queda
    // solo el ícono (con su etiqueta accesible) y así entra sin desbordar.
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      aria-label="Cerrar sesión"
      title="Cerrar sesión"
    >
      <LogOut className="h-4 w-4 sm:hidden" strokeWidth={2} aria-hidden />
      <span className="hidden sm:inline">{pending ? 'Saliendo…' : 'Cerrar sesión'}</span>
    </Button>
  );
}
