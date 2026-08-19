'use client';

import { cn, FormField, Input } from '@pos-tercos/ui';
import { MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type FormEvent } from 'react';
import { buildWebOrderLink } from '@pos-tercos/domain';
import type { ResolvedAddressResponse, WebOrderType } from '@pos-tercos/types';
import {
  cartLinesToCreateItems,
  useCartStore,
} from '../../cart';
import { useBusiness } from '../../business';
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
import { getErrorMessage } from '../../../lib/errors';

export function CheckoutForm() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const hydrated = useCartStore((s) => s.hydrated);
  const clear = useCartStore((s) => s.clear);
  const setActiveOrder = useActiveOrder((s) => s.setOrder);
  // Teléfono del local: es el destinatario del chat que se abre al confirmar.
  const businessPhone = useBusiness((s) => s.business.contact.phone);

  const [name, setName] = useState('');
  const [phone10, setPhone10] = useState('');
  const [notes, setNotes] = useState('');
  const [type, setType] = useState<WebOrderType>('WEB_PICKUP');
  const [addressNotes, setAddressNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /**
   * Dirección VERIFICADA por el server (con coordenadas firmadas y el veredicto
   * de cobertura). null mientras el cliente no elija una de la lista.
   */
  const [address, setAddress] = useState<ResolvedAddressResponse | null>(null);

  const onResolvedAddress = useCallback(
    (resolved: ResolvedAddressResponse | null) => setAddress(resolved),
    [],
  );

  // §3.2: la idempotency-key se genera UNA vez por sesión de checkout (no por
  // intento). Si el POST llegó al server pero la respuesta se perdió, reintentar
  // con la MISMA key hace que el backend devuelva el pedido ganador — antes se
  // regeneraba en cada submit y un reintento creaba un SEGUNDO pedido real.
  const [idempotencyKey] = useState(() => randomUUID());

  // §3.1: al volver a "Recoger", olvidar la dirección — si no, un "fuera de
  // zona" viejo dejaba el botón trabado para siempre y sin explicación (el
  // componente que mostraba el motivo ya no estaba en pantalla).
  const onType = useCallback((next: WebOrderType) => {
    setType(next);
    if (next !== 'WEB_DELIVERY') setAddress(null);
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
  // Un domicilio necesita una dirección ELEGIDA de la lista: sin coordenadas
  // verificadas no se puede saber si llegamos hasta allá.
  const addressValid = type !== 'WEB_DELIVERY' || address !== null;
  /**
   * No dejar pedir con: cambios del carrito sin revisar (precio viejo / producto
   * desactivado), un domicilio sin dirección verificada, o una dirección que
   * quedó fuera de la zona. El backend rechaza los tres igual — esto es la cara
   * amable, para que el cliente no llegue hasta el submit para enterarse.
   */
  const outOfRange = type === 'WEB_DELIVERY' && address !== null && !address.inRange;
  const canSubmit =
    items.length > 0 && nameValid && phoneValid && addressValid && !hasChanges && !outOfRange;

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

    /**
     * La pestaña de WhatsApp se abre ACÁ, dentro del gesto del cliente.
     *
     * Antes había un botón aparte en la pantalla siguiente ("Enviar mi pedido
     * por WhatsApp") que mucha gente no iba a tocar — y sin ese mensaje el
     * pedido quedaba esperando a que el cajero se acordara de escribir. El
     * motivo técnico que lo justificaba (que el cliente escribiera primero para
     * abrir la ventana de 24 h de la API de Meta) desapareció cuando los avisos
     * pasaron a salir del WhatsApp del cajero: ya no hay ventana ni templates.
     *
     * Se abre en blanco antes del `await` porque un `window.open` posterior a
     * una espera lo bloquea el navegador (no viene de un gesto). Si el
     * bloqueador igual la mata, `SendOrderByWhatsApp` sigue en la pantalla de
     * seguimiento como respaldo.
     */
    const waTab = window.open('', '_blank');

    try {
      const result = await createWebOrder(
        {
          type,
          items: cartLinesToCreateItems(items),
          customerName: name.trim(),
          customerPhone: `+57${phone10}`,
          notes: notes.trim() || undefined,
          ...(type === 'WEB_DELIVERY' && address
            ? {
                deliveryAddress: address.formatted,
                deliveryNotes: addressNotes.trim() || undefined,
                // El sobre firmado por el server: lleva las coordenadas de la
                // dirección y es lo único con lo que se puede sostener el
                // rechazo por distancia (un lat/lng suelto se edita).
                addressToken: address.addressToken,
              }
            : {}),
        },
        idempotencyKey,
      );
      setActiveOrder({
        saleId: result.order.id,
        token: result.token,
        receiptNumber: result.order.receiptNumber,
        createdAt: Date.now(),
      });

      const wa = buildWebOrderLink({
        businessPhone,
        receiptNumber: result.order.receiptNumber,
        customerName: result.order.customerName,
        items: result.order.items.map((it) => ({
          productName: it.productName,
          sizeName: it.sizeName,
          quantity: it.quantity,
          modifiers: it.modifiers,
          notes: it.notes,
        })),
        total: result.order.total,
        deliveryAddress: result.order.deliveryAddress,
        deliveryNotes: result.order.deliveryNotes,
      });
      // Sin teléfono del negocio configurado no hay a dónde escribir: se cierra
      // la pestaña en blanco en vez de dejarla colgada.
      if (waTab && wa) waTab.location.href = wa.url;
      else waTab?.close();

      clear();
      router.push(
        `/checkout/success/${result.order.id}?token=${encodeURIComponent(result.token)}`,
      );
    } catch (err) {
      waTab?.close();
      setError(getErrorMessage(err, 'Error desconocido'));
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      {hasChanges ? <CartChangesBanner change={change} onApply={apply} /> : null}
      <FulfillmentPicker
        type={type}
        addressNotes={addressNotes}
        onType={onType}
        onResolvedAddress={onResolvedAddress}
        onAddressNotes={setAddressNotes}
      />

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

      <WhatsAppPaymentInfo isDelivery={type === 'WEB_DELIVERY'} />

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
          {pending ? 'Enviando pedido…' : 'Confirmar y abrir WhatsApp'}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" strokeWidth={2} />
          Se abre el chat con tu pedido ya escrito: solo tienes que enviarlo
        </p>
      </div>
    </form>
  );
}
