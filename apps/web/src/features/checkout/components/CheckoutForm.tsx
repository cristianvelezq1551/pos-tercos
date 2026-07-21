'use client';

import { cn, FormField, Input } from '@pos-tercos/ui';
import { MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type FormEvent } from 'react';
import type { WebOrderType } from '@pos-tercos/types';
import { LocationCheck } from '../../business';
import {
  cartLinesToCreateItems,
  useCartStore,
} from '../../cart';
import { computeCartPromoTotals, usePromotions } from '../../promotions';
import { createWebOrder } from '../api/create-order';
import { useCartReconcile } from '../hooks/use-cart-reconcile';
import { useActiveOrder } from '../store/active-order-store';
import { randomUUID } from '../../../lib/uuid';
import { CartChangesBanner } from './CartChangesBanner';
import { FulfillmentPicker } from './FulfillmentPicker';
import { OrderSummaryCard } from './OrderSummaryCard';
import { WhatsAppPaymentInfo } from './WhatsAppPaymentInfo';
import { COP } from '../../../lib/format';

export function CheckoutForm() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const hydrated = useCartStore((s) => s.hydrated);
  const clear = useCartStore((s) => s.clear);
  const setActiveOrder = useActiveOrder((s) => s.setOrder);

  const [name, setName] = useState('');
  const [phone10, setPhone10] = useState('');
  const [notes, setNotes] = useState('');
  const [type, setType] = useState<WebOrderType>('WEB_PICKUP');
  const [address, setAddress] = useState('');
  const [addressNotes, setAddressNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /** Ubicación del cliente + si quedó fuera de la zona (lo resuelve LocationCheck). */
  const [geo, setGeo] = useState<{
    coords: { lat: number; lng: number } | null;
    blocked: boolean;
  }>({ coords: null, blocked: false });

  const onGeoResolved = useCallback(
    (coords: { lat: number; lng: number } | null, blocked: boolean) =>
      setGeo({ coords, blocked }),
    [],
  );

  // §3.2: la idempotency-key se genera UNA vez por sesión de checkout (no por
  // intento). Si el POST llegó al server pero la respuesta se perdió, reintentar
  // con la MISMA key hace que el backend devuelva el pedido ganador — antes se
  // regeneraba en cada submit y un reintento creaba un SEGUNDO pedido real.
  const [idempotencyKey] = useState(() => randomUUID());

  // §3.1: al cambiar de "A domicilio" a "Recoger", limpiar el estado de geo — si
  // no, un `blocked` viejo (quedó fuera del radio) dejaba el botón Confirmar
  // deshabilitado para SIEMPRE sin ningún mensaje (LocationCheck ya desmontado).
  const onType = useCallback((next: WebOrderType) => {
    setType(next);
    if (next !== 'WEB_DELIVERY') setGeo({ coords: null, blocked: false });
  }, []);

  const { change, hasChanges, apply } = useCartReconcile();

  const promotions = usePromotions((s) => s.promotions);
  // Preview con promos del canal web; el total autoritativo lo calcula el
  // backend al crear el pedido con el mismo motor.
  const totals = computeCartPromoTotals(items, promotions);
  // Celular colombiano: 10 dígitos que empiezan en 3 (los móviles). Es el canal
  // de WhatsApp del pedido, por eso no aceptamos fijos ni números imposibles.
  const phoneValid = /^3\d{9}$/.test(phone10);
  const nameValid = name.trim().length >= 2;
  // Un domicilio sin dirección no lo puede entregar nadie.
  const addressValid = type !== 'WEB_DELIVERY' || address.trim().length >= 8;
  /**
   * No dejar pedir con: cambios del carrito sin revisar (precio viejo / producto
   * desactivado), un domicilio sin dirección, o una ubicación verificada fuera
   * del radio. El backend rechaza los tres igual — esto es la cara amable, para
   * que el cliente no llegue hasta el submit para enterarse.
   */
  // §3.1: `geo.blocked` solo aplica a domicilios (el radio no bloquea a quien
  // viene a recoger). Sin este gate por tipo, cambiar a "Recoger" dejaba el
  // botón trabado por un blocked residual del flujo de domicilio.
  const geoBlocking = type === 'WEB_DELIVERY' && geo.blocked;
  const canSubmit =
    items.length > 0 && nameValid && phoneValid && addressValid && !hasChanges && !geoBlocking;

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
      const result = await createWebOrder(
        {
          type,
          items: cartLinesToCreateItems(items),
          customerName: name.trim(),
          customerPhone: `+57${phone10}`,
          notes: notes.trim() || undefined,
          ...(type === 'WEB_DELIVERY'
            ? {
                deliveryAddress: address.trim(),
                deliveryNotes: addressNotes.trim() || undefined,
              }
            : {}),
          // Solo si el cliente compartió su ubicación. Sin esto el server no
          // valida el radio y acepta (el permiso se puede negar).
          ...(geo.coords ? { customerLat: geo.coords.lat, customerLng: geo.coords.lng } : {}),
        },
        idempotencyKey,
      );
      setActiveOrder({
        saleId: result.order.id,
        token: result.token,
        receiptNumber: result.order.receiptNumber,
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
      {hasChanges ? <CartChangesBanner change={change} onApply={apply} /> : null}
      <FulfillmentPicker
        type={type}
        address={address}
        addressNotes={addressNotes}
        onType={onType}
        onAddress={setAddress}
        onAddressNotes={setAddressNotes}
      />
      {/* El radio es la zona de cobertura del domicilio: a quien viene a
          recoger no se le pide la ubicación ni se lo bloquea por vivir lejos. */}
      {type === 'WEB_DELIVERY' ? <LocationCheck onResolved={onGeoResolved} /> : null}

      <OrderSummaryCard items={items} />

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
              ? 'Ingresa un celular válido (10 dígitos, empieza en 3).'
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
              {items.length === 1 ? '1 producto' : `${items.length} productos`}
              {totals.discount > 0 ? (
                <span className="font-semibold text-emerald-500">
                  {' '}
                  · −{COP.format(totals.discount)} en promos
                </span>
              ) : null}
            </span>
          </div>
          <span className="text-3xl font-extrabold tabular-nums text-foreground">
            {COP.format(totals.total)}
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
