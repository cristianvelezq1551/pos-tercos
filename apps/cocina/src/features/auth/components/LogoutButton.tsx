'use client';

import { Button } from '@pos-tercos/ui';
import { Power } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { logoutRequest } from '../api';

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleClick = async () => {
    await logoutRequest();
    startTransition(() => {
      router.replace('/login');
      router.refresh();
    });
  };

  return (
    <Button
      variant="destructive"
      // 44 px: en celular es un objetivo de pulgar como cualquier otro.
      className="h-11 w-11 p-0"
      onClick={handleClick}
      disabled={pending}
      aria-label="Cerrar sesión"
      title="Cerrar sesión"
    >
      <Power className="h-5 w-5" strokeWidth={2.25} aria-hidden />
    </Button>
  );
}
