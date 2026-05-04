'use client';

import { Button, Input, Label } from '@pos-tercos/ui';
import type { WebOrderType } from '@pos-tercos/types';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { COP } from '../../../lib/format';
import {
  cartLinesToCreateItems,
  cartSubtotal,
  useCartStore,
} from '../../cart';
import { createWebOrder } from '../api/create-order';

export function CheckoutForm() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const hydrated = useCartStore((s) => s.hydrated);
  const clear = useCartStore((s) => s.clear);

  const [type, setType] = useState<WebOrderType>('WEB_PICKUP');
  const [name, setName] = useState('');
  const [phone10, setPhone10] = useState(''); // 10 dígitos, sin +57
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const subtotal = cartSubtotal(items);
  const phoneValid = /^\d{10}$/.test(phone10);
  const nameValid = name.trim().length >= 2;
  const addressValid = type === 'WEB_PICKUP' || address.trim().length >= 5;
  const canSubmit = items.length > 0 && nameValid && phoneValid && addressValid;

  if (hydrated && items.length === 0) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-6 text-center">
        <p className="text-sm text-amber-900">Tu carrito está vacío.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/')}>
          Volver al menú
        </Button>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || pending) return;
    setError(null);
    setPending(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const result = await createWebOrder(
        {
          type,
          items: cartLinesToCreateItems(items),
          customerName: name.trim(),
          customerPhone: `+57${phone10}`,
          deliveryAddress: type === 'WEB_DELIVERY' ? address.trim() : undefined,
          notes: notes.trim() || undefined,
        },
        idempotencyKey,
      );
      // Vaciar carrito al confirmar — la orden ya fue creada en el backend
      clear();
      router.push(
        `/checkout/success/${result.order.id}?token=${encodeURIComponent(result.token)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section>
        <Label>¿Cómo recibís el pedido?</Label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <TypeButton
            label="Recoger en tienda"
            sublabel="Listo en ~20 min"
            active={type === 'WEB_PICKUP'}
            onClick={() => setType('WEB_PICKUP')}
          />
          <TypeButton
            label="Domicilio"
            sublabel="Cobertura 3 km"
            active={type === 'WEB_DELIVERY'}
            onClick={() => setType('WEB_DELIVERY')}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="name">Tu nombre</Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como te van a llamar al retirar"
            maxLength={120}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Celular (Colombia)</Label>
          <div className="flex gap-2">
            <span className="inline-flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
              +57
            </span>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              value={phone10}
              onChange={(e) => setPhone10(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="3001234567"
              maxLength={10}
              required
            />
          </div>
          {phone10.length > 0 && !phoneValid ? (
            <p className="text-xs text-amber-700">Ingresá los 10 dígitos del celular.</p>
          ) : null}
        </div>

        {type === 'WEB_DELIVERY' ? (
          <div className="space-y-2">
            <Label htmlFor="address">Dirección de entrega</Label>
            <Input
              id="address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Carrera 11 # 23-45, apto 302"
              maxLength={500}
              required
            />
            <p className="text-[11px] text-gray-500">
              Validación de zona 3 km llega en próxima fase.
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Input
            id="notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Sin cebolla, salsa aparte, etc."
            maxLength={500}
          />
        </div>
      </section>

      <section className="rounded-md bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Subtotal estimado</span>
          <span className="text-lg font-bold tabular-nums">{COP.format(subtotal)}</span>
        </div>
        <p className="mt-1 text-[11px] text-gray-500">
          Total final con promociones se calcula al confirmar el pedido.
        </p>
      </section>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <Button type="submit" className="h-12 w-full text-base" disabled={!canSubmit || pending}>
        {pending ? 'Enviando pedido…' : 'Enviar pedido'}
      </Button>
      <p className="text-center text-[11px] text-gray-500">
        Al enviar, generamos tu pedido y te mostramos cómo pagarlo. NO hay reembolso post-pago.
      </p>
    </form>
  );
}

function TypeButton({
  label,
  sublabel,
  active,
  onClick,
}: {
  label: string;
  sublabel: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start rounded-md border p-3 text-left transition ${
        active
          ? 'border-blue-600 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <span className={`text-sm font-semibold ${active ? 'text-blue-900' : 'text-gray-900'}`}>
        {label}
      </span>
      <span className="mt-0.5 text-[11px] text-gray-500">{sublabel}</span>
    </button>
  );
}
