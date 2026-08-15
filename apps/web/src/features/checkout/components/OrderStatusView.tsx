'use client';

import type { PublicWebOrder } from '@pos-tercos/types';
import { cn } from '@pos-tercos/ui';
import { Check, Clock, XCircle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { COP } from '../../../lib/format';
import { CheckoutSteps } from '../../../components/CheckoutSteps';
import { isTerminalStatus, useActiveOrder } from '../store/active-order-store';
import { useOrderPoller } from './OrderStatusPoller';
import { PaymentInstructionsView } from './PaymentInstructionsView';
import { SendOrderByWhatsApp } from './SendOrderByWhatsApp';
import { WhatsAppPaymentInfo } from './WhatsAppPaymentInfo';

/**
 * Lo que ve el cliente después de pedir.
 *
 * §7.v25 — La página NO cuenta el progreso del pedido (recibido → preparando →
 * listo → en camino). Esos avances los marca el cajero a mano y en la práctica
 * no siempre ocurren: una barra de progreso que nunca avanza es peor que no
 * tenerla, porque promete algo que no va a pasar. El progreso viaja por
 * WhatsApp, que es donde el cliente ya está hablando con el local.
 *
 * Quedan TRES desenlaces, no ocho estados:
 *   1. Falta que pagues → cómo pagar (lo único accionable de esta pantalla)
 *   2. Pago confirmado  → tu número de pedido; el resto llega por WhatsApp
 *   3. Cancelado        → se cerró sin pagar
 */
type Outcome = 'awaiting_payment' | 'confirmed' | 'canceled';

function outcomeOf(status: string): Outcome {
  if (status === 'PENDIENTE_PAGO') return 'awaiting_payment';
  if (status.startsWith('CANCELADO') || status === 'VOID') return 'canceled';
  // PAGADO y cualquier avance posterior (preparando / listo / entregado) son lo
  // mismo para el cliente: su pago entró y el local se está encargando.
  return 'confirmed';
}

const OUTCOME_META: Record<
  Outcome,
  { icon: LucideIcon; iconBg: string; title: string; failed?: boolean }
> = {
  awaiting_payment: { icon: Clock, iconBg: 'bg-[#C00101]', title: 'Esperando tu pago' },
  confirmed: { icon: Check, iconBg: 'bg-[#16A34A]', title: '¡Pago confirmado!' },
  canceled: {
    icon: XCircle,
    iconBg: 'bg-destructive',
    title: 'Pedido cancelado',
    failed: true,
  },
};

/**
 * En domicilio, mientras el local no cotice el envío con el domiciliario, el
 * `total` NO es final: mostrarlo como "Total" haría que el cliente transfiera
 * de menos y el cobro —que valida monto exacto— lo rechazaría.
 */
function waitingDeliveryFee(order: PublicWebOrder): boolean {
  return Boolean(order.deliveryAddress) && order.deliveryFee === 0;
}

export function OrderStatusView({
  initial,
  token,
  paymentInstructions,
  businessName,
}: {
  initial: PublicWebOrder;
  token: string;
  paymentInstructions: string;
  businessName: string;
}) {
  const { order, conn } = useOrderPoller(initial, token);
  const outcome = outcomeOf(order.status);
  const meta = OUTCOME_META[outcome];
  const Icon = meta.icon;
  const isDelivery = Boolean(order.deliveryAddress);
  const esperandoEnvio = waitingDeliveryFee(order);

  useEffect(() => {
    const active = useActiveOrder.getState().order;
    if (isTerminalStatus(order.status)) {
      if (active?.saleId === initial.id) {
        useActiveOrder.getState().clear();
      }
      return;
    }
    if (!active || active.saleId !== initial.id) {
      useActiveOrder.getState().setOrder({
        saleId: initial.id,
        token,
        receiptNumber: order.receiptNumber,
        // Usar la fecha REAL del backend (no Date.now()): al abrir la URL de
        // seguimiento en otro dispositivo sin la orden persistida, el TTL de 24h
        // debe contarse desde la creación real, no desde "ahora".
        createdAt:
          active?.saleId === initial.id
            ? active.createdAt
            : new Date(order.createdAt).getTime(),
      });
    }
  }, [order.status, order.createdAt, initial.id, token, order.receiptNumber]);

  return (
    <div className="flex flex-col" aria-live="polite">
      <CheckoutSteps current={outcome === 'awaiting_payment' ? 2 : 3} />
      <div className="mx-auto flex max-w-[520px] flex-col items-center gap-7 px-6 py-10 sm:px-12 lg:px-20">
        <div
          className={cn(
            'reveal-scale inline-flex h-20 w-20 items-center justify-center rounded-full shadow-lg',
            meta.iconBg,
          )}
        >
          <Icon className="h-9 w-9 text-white" strokeWidth={2.25} />
        </div>

        <div className="flex flex-col gap-2 text-center">
          <h1 className="reveal-up stagger-1 text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
            {meta.title}
          </h1>
          <p className="reveal-up stagger-2 text-sm text-muted-foreground sm:text-base">
            {outcome === 'awaiting_payment'
              ? `Pedido #${order.receiptNumber} · Te escribimos por WhatsApp para coordinar la transferencia`
              : outcome === 'confirmed'
                ? `Tu pedido #${order.receiptNumber} ya está en manos del local`
                : `Pedido #${order.receiptNumber} · No se completó el pago`}
          </p>
          {conn === 'reconnecting' ? (
            <p className="text-xs font-medium text-warning">⚠ Reconectando…</p>
          ) : null}
        </div>

        {outcome === 'confirmed' ? (
          <div className="w-full max-w-[420px] rounded-xl border-2 border-[#16A34A] bg-[#16A34A]/10 px-6 py-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Tu pedido
            </p>
            <p className="font-display text-5xl font-extrabold leading-none text-foreground">
              #{order.receiptNumber}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isDelivery
                ? 'Te avisamos por WhatsApp cuando salga hacia tu dirección.'
                : 'Te avisamos por WhatsApp cuando esté listo para retirar.'}
            </p>
          </div>
        ) : null}

        <DetailsCard order={order} businessName={businessName} />

        {outcome === 'awaiting_payment' ? (
          <div className="flex w-full max-w-[420px] flex-col gap-4">
            {/* Sin el envío cotizado, el total no es final: pedirle que pague
                ahora sería pedirle un número que va a cambiar. */}
            {esperandoEnvio ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-center">
                <p className="text-sm font-semibold text-amber-500">
                  Falta el costo del domicilio
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ya abrimos WhatsApp con tu pedido: envíanoslo y te confirmamos el total con
                  el envío. Solo ahí haces la transferencia.
                </p>
              </div>
            ) : (
              <>
                <WhatsAppPaymentInfo isDelivery={isDelivery} />
                {/* El poller trae paymentInstructions FRESCO (incluye el total con
                    envío una vez cotizado); el prop de SSR quedó con el total de la
                    creación (sin envío) y solo sirve de fallback. */}
                <PaymentInstructionsView
                  text={order.paymentInstructions ?? paymentInstructions}
                />
              </>
            )}
            {/* Último y en tono secundario: el chat ya se abrió al confirmar.
                Esto es solo por si el navegador lo bloqueó o se cerró. */}
            <SendOrderByWhatsApp order={order} />
            <p className="text-center text-sm text-muted-foreground">
              Esta página se actualiza sola cuando confirmemos tu pago.
            </p>
          </div>
        ) : null}

        <Link
          href="/"
          className={cn(
            'inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold transition-colors',
            meta.failed
              ? 'bg-primary text-primary-foreground hover:bg-red-700'
              : 'border border-border bg-card text-foreground hover:bg-muted',
          )}
        >
          Hacer otro pedido
        </Link>
      </div>
    </div>
  );
}

function DetailsCard({
  order,
  businessName,
}: {
  order: PublicWebOrder;
  businessName: string;
}) {
  const esperandoEnvio = waitingDeliveryFee(order);
  const rows: { label: string; value: string; strong?: boolean }[] = [];

  if (order.discountTotal > 0) {
    rows.push({ label: 'Subtotal', value: COP.format(order.subtotal) });
    rows.push({ label: 'Descuentos', value: `−${COP.format(order.discountTotal)}` });
  }
  // El domicilio va ANTES del total: es una línea que suma. Puesto después, el
  // total se leía como si le faltara sumar algo.
  if (esperandoEnvio) {
    rows.push({ label: 'Domicilio', value: 'te lo confirmamos por WhatsApp' });
  } else if (order.deliveryFee > 0) {
    rows.push({ label: 'Domicilio', value: COP.format(order.deliveryFee) });
  }
  rows.push({
    label: esperandoEnvio ? 'Tu pedido (sin envío)' : 'Total',
    value: COP.format(order.total),
    strong: !esperandoEnvio,
  });
  // Un domicilio no se recoge en el local: decirle "Recoger en TERCOS" a
  // quien pidió a domicilio es directamente información falsa.
  rows.push(
    order.deliveryAddress
      ? { label: 'Entregamos en', value: order.deliveryAddress }
      : { label: 'Recoger en', value: businessName },
  );

  return (
    <section className="w-full max-w-[420px] rounded-xl border border-border bg-card p-6">
      {order.items.length > 0 ? (
        <>
          <ul className="flex flex-col gap-2.5">
            {order.items.map((it, i) => (
              <li key={i} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-foreground">
                    ×{it.quantity} {it.productName}
                    {it.sizeName ? ` · ${it.sizeName}` : ''}
                  </span>
                  {it.modifiers.length > 0 ? (
                    <span className="block text-xs text-primary">
                      + {it.modifiers.join(', ')}
                    </span>
                  ) : null}
                  {it.notes ? (
                    <span className="block text-xs italic text-muted-foreground">
                      “{it.notes}”
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-sm font-semibold text-foreground">
                  {COP.format(it.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
          <div className="my-4 h-px bg-border" />
        </>
      ) : null}
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span
              className={cn(
                'text-right font-semibold text-foreground',
                row.strong ? 'text-base' : 'text-sm',
              )}
            >
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
