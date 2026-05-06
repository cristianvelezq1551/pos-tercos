'use client';

import { cn, FormField, Input } from '@pos-tercos/ui';
import type { GeocodeResponse, WebOrderType } from '@pos-tercos/types';
import { Bike, MessageCircle, Store } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type FormEvent } from 'react';
import {
  cartLinesToCreateItems,
  cartSubtotal,
  useCartStore,
} from '../../cart';
import { createWebOrder } from '../api/create-order';
import { useActiveOrder } from '../store/active-order-store';
import { DeliveryAddressInput } from './DeliveryAddressInput';
import { OrderSummaryCard } from './OrderSummaryCard';
import { WhatsAppPaymentInfo } from './WhatsAppPaymentInfo';
import { COP } from '../../../lib/format';

export function CheckoutForm() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const hydrated = useCartStore((s) => s.hydrated);
  const clear = useCartStore((s) => s.clear);
  const setActiveOrder = useActiveOrder((s) => s.setOrder);

  const [type, setType] = useState<WebOrderType>('WEB_PICKUP');
  const [name, setName] = useState('');
  const [phone10, setPhone10] = useState('');
  const [address, setAddress] = useState('');
  const [geocode, setGeocode] = useState<GeocodeResponse | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const subtotal = cartSubtotal(items);
  const phoneValid = /^\d{10}$/.test(phone10);
  const nameValid = name.trim().length >= 2;
  const deliveryReady =
    type === 'WEB_PICKUP' || (geocode !== null && geocode.withinDeliveryRadius);
  const canSubmit = items.length > 0 && nameValid && phoneValid && deliveryReady;

  const handleGeocode = useCallback((g: GeocodeResponse | null) => {
    setGeocode(g);
  }, []);
  const handleSwitchToPickup = useCallback(() => {
    setType('WEB_PICKUP');
    setGeocode(null);
  }, []);

  if (hydrated && items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">Tu carrito está vacío.</p>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="mt-5 inline-flex h-10 items-center rounded-full border border-border bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          Volver al menú
        </button>
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
          deliveryAddress:
            type === 'WEB_DELIVERY'
              ? geocode?.formattedAddress ?? address.trim()
              : undefined,
          deliveryLat: type === 'WEB_DELIVERY' ? geocode?.lat : undefined,
          deliveryLng: type === 'WEB_DELIVERY' ? geocode?.lng : undefined,
          notes: notes.trim() || undefined,
        },
        idempotencyKey,
      );
      setActiveOrder({
        saleId: result.order.id,
        token: result.token,
        receiptNumber: result.order.receiptNumber,
        type: result.order.type,
        createdAt: Date.now(),
      });
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <OrderSummaryCard items={items} />

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-bold text-foreground">¿Cómo recibes el pedido?</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DeliveryOptionCard
            icon={<Store className="h-5 w-5" strokeWidth={1.75} />}
            title="Recoger en tienda"
            description="Carrera 31 # 37s-49"
            active={type === 'WEB_PICKUP'}
            onClick={() => setType('WEB_PICKUP')}
          />
          <DeliveryOptionCard
            icon={<Bike className="h-5 w-5" strokeWidth={1.75} />}
            title="Domicilio"
            description="Cobertura 3 km"
            active={type === 'WEB_DELIVERY'}
            onClick={() => setType('WEB_DELIVERY')}
          />
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <FormField label="Tu nombre" required>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como te van a llamar al retirar"
            maxLength={120}
            required
          />
        </FormField>

        <FormField
          label="Celular (Colombia)"
          error={
            phone10.length > 0 && !phoneValid
              ? 'Ingresa los 10 dígitos del celular.'
              : undefined
          }
          required
        >
          <div className="flex gap-2">
            <span className="inline-flex h-10 items-center rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground">
              +57
            </span>
            <Input
              type="tel"
              inputMode="numeric"
              value={phone10}
              onChange={(e) =>
                setPhone10(e.target.value.replace(/\D/g, '').slice(0, 10))
              }
              placeholder="3001234567"
              maxLength={10}
              required
            />
          </div>
        </FormField>

        {type === 'WEB_DELIVERY' ? (
          <DeliveryAddressInput
            value={address}
            onChange={setAddress}
            onGeocode={handleGeocode}
            onSwitchToPickup={handleSwitchToPickup}
            disabled={pending}
          />
        ) : null}

        <FormField label="Notas (opcional)">
          <Input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Sin cebolla, salsa aparte, etc."
            maxLength={500}
          />
        </FormField>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground">Total estimado</span>
            <span className="text-xs text-muted-foreground">
              {items.length === 1 ? '1 producto' : `${items.length} productos`} · sin
              promociones aplicadas
            </span>
          </div>
          <span className="text-3xl font-extrabold tabular-nums text-foreground">
            {COP.format(subtotal)}
          </span>
        </div>
      </section>

      <WhatsAppPaymentInfo />

      {error ? (
        <p
          role="alert"
          className={cn(
            'rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground',
          )}
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={!canSubmit || pending}
          className="press inline-flex h-13 w-full items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-6 text-base font-bold text-white shadow-lg transition-colors hover:bg-[#22C35E] hover:shadow-[#25D366]/30 active:bg-[#1FAE54] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ height: 52 }}
        >
          <MessageCircle className="h-5 w-5" strokeWidth={2} />
          {pending ? 'Enviando pedido…' : 'Confirmar y recibir datos de pago'}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" strokeWidth={2} />
          Te enviaremos un mensaje de WhatsApp para coordinar la transferencia
        </p>
      </div>
    </form>
  );
}

function DeliveryOptionCard({
  icon,
  title,
  description,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'press flex items-start gap-3 rounded-xl border p-4 text-left transition-colors',
        active
          ? 'border-primary bg-primary/[0.06] shadow-sm shadow-primary/10'
          : 'border-border bg-card hover:border-muted-foreground',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        )}
      >
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-bold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}
