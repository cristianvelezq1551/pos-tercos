'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CartButton, CartDrawer } from '../features/cart';

export function WebTopbar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-blue-600 px-2 py-1 text-xs font-bold text-white">
          TERCOS
        </span>
        <span className="text-sm font-semibold tracking-tight text-gray-900">
          Pedí online
        </span>
      </div>
      <CartButton onClick={() => setOpen(true)} />
      <CartDrawer
        open={open}
        onClose={() => setOpen(false)}
        onCheckout={() => {
          setOpen(false);
          router.push('/checkout');
        }}
      />
    </header>
  );
}
