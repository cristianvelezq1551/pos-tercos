'use client';

import type { PublicWebOrder } from '@pos-tercos/types';
import { cn } from '@pos-tercos/ui';
import {
  AlertCircle,
  Check,
  ChefHat,
  Clock,
  PackageCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { COP } from '../../../lib/format';
import { CheckoutSteps } from '../../../components/CheckoutSteps';
import { isTerminalStatus, useActiveOrder } from '../store/active-order-store';
import { useOrderPoller } from './OrderStatusPoller';
import { PaymentInstructionsView } from './PaymentInstructionsView';
import { StatusTimeline } from './StatusTimeline';
import { SendOrderByWhatsApp } from './SendOrderByWhatsApp';
import { WhatsAppPaymentInfo } from './WhatsAppPaymentInfo';

interface StatusMeta {
  icon: LucideIcon;
  iconBg: string;
  title: string;
  subtitle: (order: PublicWebOrder) => string;
  /** Active step index for the 3-pill timeline (0 = none active). */
  timelineActive: 0 | 1 | 2 | 3;
  footerNote?: string;
  isFailed?: boolean;
}

const STATUS_MAP: Record<string, StatusMeta> = {
  PENDIENTE_PAGO: {
    icon: Clock,
    iconBg: 'bg-[#C00101]',
    title: 'Esperando tu pago',
    subtitle: (o) =>
      `Pedido #${o.receiptNumber} · Te contactaremos por WhatsApp para coordinar la transferencia`,
    timelineActive: 0,
    footerNote: 'Esta página se actualiza sola — puedes dejarla abierta.',
  },
  PAGADO: {
    icon: Check,
    iconBg: 'bg-[#16A34A]',
    title: '¡Pago confirmado!',
    subtitle: (o) => `Tu pedido #${o.receiptNumber} ha sido recibido`,
    timelineActive: 1,
    footerNote: 'Te avisamos por WhatsApp cuando esté listo.',
  },
  EN_PREPARACION: {
    icon: ChefHat,
    iconBg: 'bg-[#16A34A]',
    title: 'Tu pedido está en cocina',
    subtitle: (o) => `Pedido #${o.receiptNumber} · Estamos preparándolo`,
    timelineActive: 2,
    footerNote: 'Te avisamos por WhatsApp cuando esté listo.',
  },
  LISTO_DESPACHO: {
    icon: PackageCheck,
    iconBg: 'bg-[#16A34A]',
    // §3.4: un DOMICILIO no se retira — va en camino. El copy se bifurca por
    // `deliveryAddress` (antes decía "Acércate al mostrador" a todos, mintiéndole
    // al cliente que pidió a domicilio; el WhatsApp ya bifurca "va en camino").
    title: '¡Listo para retirar!',
    subtitle: (o) =>
      o.deliveryAddress
        ? `Pedido #${o.receiptNumber} · Va en camino 🛵`
        : `Pedido #${o.receiptNumber} · Acércate al mostrador`,
    timelineActive: 3,
  },
  ENTREGADO: {
    icon: Check,
    iconBg: 'bg-[#16A34A]',
    title: '¡Pedido entregado!',
    subtitle: (o) => `Pedido #${o.receiptNumber} · Gracias por tu compra`,
    timelineActive: 3,
    footerNote: '¡Te esperamos pronto!',
  },
  CANCELADO_NO_PAGO: {
    icon: XCircle,
    iconBg: 'bg-destructive',
    title: 'Pedido cancelado',
    subtitle: (o) => `Pedido #${o.receiptNumber} · Cancelado por falta de pago`,
    timelineActive: 0,
    isFailed: true,
  },
  CANCELADO_SIN_REEMBOLSO: {
    icon: XCircle,
    iconBg: 'bg-destructive',
    title: 'Pedido cancelado',
    subtitle: (o) => `Pedido #${o.receiptNumber} · El local canceló este pedido`,
    timelineActive: 0,
    isFailed: true,
  },
  VOID: {
    icon: AlertCircle,
    iconBg: 'bg-destructive',
    title: 'Pedido anulado',
    subtitle: (o) => `Pedido #${o.receiptNumber}`,
    timelineActive: 0,
    isFailed: true,
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
  const meta = STATUS_MAP[order.status] ?? STATUS_MAP.PENDIENTE_PAGO!;
  const Icon = meta.icon;

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

  const showPayment = order.status === 'PENDIENTE_PAGO';
  const esperandoEnvio = waitingDeliveryFee(order);
  const showPickupBanner = order.status === 'LISTO_DESPACHO';
  const stepsCurrent: 1 | 2 | 3 = order.status === 'PENDIENTE_PAGO' ? 2 : 3;
  // §3.4: un domicilio no se retira. Todo el copy de "listo/retirar" se bifurca.
  const isDelivery = Boolean(order.deliveryAddress);
  const readyTitle = isDelivery ? '¡Va en camino!' : '¡Listo para retirar!';

  return (
    <div className="flex flex-col" aria-live="polite">
      <CheckoutSteps current={stepsCurrent} />
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
          {order.status === 'LISTO_DESPACHO' ? readyTitle : meta.title}
        </h1>
        <p className="reveal-up stagger-2 text-sm text-muted-foreground sm:text-base">{meta.subtitle(order)}</p>
        {conn === 'reconnecting' ? (
          <p className="text-xs font-medium text-warning">⚠ Reconectando…</p>
        ) : null}
      </div>

      {order.status === 'PAGADO' || order.status === 'LISTO_DESPACHO' ? (
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

      <StatusTimeline active={meta.timelineActive} />

      {showPickupBanner ? (
        <div className="w-full max-w-[420px] rounded-xl border border-[#16A34A] bg-[#16A34A]/10 p-4 text-center">
          <p className="text-sm text-foreground">
            {isDelivery ? (
              <>
                Tu pedido{' '}
                <strong className="text-[#16A34A]">#{order.receiptNumber}</strong> va en
                camino 🛵 a: {order.deliveryAddress}
              </>
            ) : (
              <>
                Acércate al mostrador con tu pedido{' '}
                <strong className="text-[#16A34A]">#{order.receiptNumber}</strong>.
              </>
            )}
          </p>
        </div>
      ) : null}

      {showPayment ? (
        <div className="flex w-full max-w-[420px] flex-col gap-4">
          {/* Primero el botón: abrir el chat es la acción que queremos que haga. */}
          <SendOrderByWhatsApp order={order} />
          {/* Sin el envío cotizado, el total no es final: pedirle que pague
              ahora sería pedirle un número que va a cambiar. */}
          {esperandoEnvio ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-center">
              <p className="text-sm font-semibold text-amber-500">
                Falta el costo del domicilio
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Envíanos tu pedido por WhatsApp y te confirmamos el total con el envío. Solo
                ahí haces la transferencia.
              </p>
            </div>
          ) : (
            <>
              <WhatsAppPaymentInfo />
              {/* El poller trae paymentInstructions FRESCO (incluye el total con
                  envío una vez cotizado); el prop de SSR quedó con el total de la
                  creación (sin envío) y solo sirve de fallback. */}
              <PaymentInstructionsView
                text={order.paymentInstructions ?? paymentInstructions}
              />
            </>
          )}
        </div>
      ) : null}

      {meta.footerNote ? (
        <p className="text-center text-sm text-muted-foreground">{meta.footerNote}</p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className={cn(
            'inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold transition-colors',
            meta.isFailed
              ? 'bg-primary text-primary-foreground hover:bg-red-700'
              : 'border border-border bg-card text-foreground hover:bg-muted',
          )}
        >
          Hacer otro pedido
        </Link>
      </div>
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
  const rows: { label: string; value: string }[] = [
    {
      label: esperandoEnvio ? 'Tu pedido' : 'Total',
      value: COP.format(order.total),
    },
    // Un domicilio no se recoge en el local: decirle "Recoger en TERCOS" a
    // quien pidió a domicilio es directamente información falsa.
    order.deliveryAddress
      ? { label: 'Entregamos en', value: order.deliveryAddress }
      : { label: 'Recoger en', value: businessName },
  ];
  if (esperandoEnvio) {
    rows.splice(1, 0, { label: 'Domicilio', value: 'te lo confirmamos por WhatsApp' });
  } else if (order.deliveryFee > 0) {
    rows.splice(1, 0, { label: 'Domicilio', value: COP.format(order.deliveryFee) });
  }
  if (order.status === 'PAGADO' || order.status === 'EN_PREPARACION') {
    rows.push({ label: 'Tiempo estimado', value: 'Listo en ~20 min' });
  }

  if (order.discountTotal > 0) {
    rows.unshift({
      label: 'Descuentos',
      value: `−${COP.format(order.discountTotal)}`,
    });
    rows.unshift({ label: 'Subtotal', value: COP.format(order.subtotal) });
  }

  return (
    <section className="w-full max-w-[420px] rounded-xl border border-border bg-card p-6">
      {order.items.length > 0 ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tu pedido
          </p>
          <ul className="mt-3 flex flex-col gap-2.5">
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
      <ul className="flex flex-col gap-4">
        {rows.map((row, idx) => (
          <li key={row.label}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <span className="text-right text-sm font-semibold text-foreground">
                {row.value}
              </span>
            </div>
            {idx < rows.length - 1 ? (
              <div className="mt-4 h-px bg-border" />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
