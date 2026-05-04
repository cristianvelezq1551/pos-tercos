'use client';

import type { PublicWebOrder } from '@pos-tercos/types';
import { COP } from '../../../lib/format';
import { useOrderPoller } from './OrderStatusPoller';
import { PaymentInstructionsView } from './PaymentInstructionsView';

const STATUS_LABEL: Record<string, { label: string; tone: 'pending' | 'cooking' | 'ready' | 'done' | 'failed' }> = {
  PENDIENTE_PAGO: { label: 'Esperando tu pago', tone: 'pending' },
  PAGADO: { label: 'Pago verificado · pasamos a cocina', tone: 'cooking' },
  EN_PREPARACION: { label: 'En preparación', tone: 'cooking' },
  LISTO_DESPACHO: { label: '¡Listo para retirar!', tone: 'ready' },
  ASIGNADO: { label: 'Repartidor asignado', tone: 'cooking' },
  EN_RUTA: { label: 'En camino', tone: 'cooking' },
  ENTREGADO: { label: 'Entregado', tone: 'done' },
  CANCELADO_NO_PAGO: { label: 'Cancelado por falta de pago', tone: 'failed' },
  CANCELADO_SIN_REEMBOLSO: { label: 'Cancelado', tone: 'failed' },
  VOID: { label: 'Anulado', tone: 'failed' },
  DEVUELTO: { label: 'Devuelto', tone: 'failed' },
  EN_DISPUTA: { label: 'En disputa', tone: 'failed' },
};

const TONE_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-900 ring-amber-200',
  cooking: 'bg-blue-50 text-blue-900 ring-blue-200',
  ready: 'bg-emerald-50 text-emerald-900 ring-emerald-300',
  done: 'bg-gray-50 text-gray-700 ring-gray-200',
  failed: 'bg-red-50 text-red-900 ring-red-200',
};

export function OrderStatusView({
  initial,
  token,
  paymentInstructions,
}: {
  initial: PublicWebOrder;
  token: string;
  paymentInstructions: string;
}) {
  const { order, conn } = useOrderPoller(initial, token);
  const meta = STATUS_LABEL[order.status] ?? STATUS_LABEL.PENDIENTE_PAGO!;
  const ringStyles = TONE_STYLES[meta.tone] ?? TONE_STYLES.pending!;

  return (
    <div className="space-y-6">
      <header
        className={`rounded-lg p-5 ring-2 ${ringStyles}`}
        aria-live="polite"
      >
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
          Pedido #{order.receiptNumber}
        </p>
        <p className="mt-1 text-2xl font-bold tracking-tight">{meta.label}</p>
        <p className="mt-2 text-sm opacity-80">
          {order.type === 'WEB_PICKUP' ? 'Recoger en tienda' : 'Domicilio'} ·{' '}
          {order.customerName} · {COP.format(order.total)}
        </p>
        {conn === 'reconnecting' ? (
          <p className="mt-2 text-[11px] opacity-60">⚠ Reconectando…</p>
        ) : null}
      </header>

      {order.status === 'PENDIENTE_PAGO' ? (
        <PaymentSection instructions={paymentInstructions} />
      ) : null}

      {order.status === 'LISTO_DESPACHO' && order.type === 'WEB_PICKUP' ? (
        <div className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-900">
          ¡Tu pedido está listo! Acercate al mostrador con el número{' '}
          <strong>#{order.receiptNumber}</strong>.
        </div>
      ) : null}

      <ItemsSummary order={order} />
    </div>
  );
}

function PaymentSection({ instructions }: { instructions: string }) {
  // FASE 9: el flujo es cajero-driven via WhatsApp.
  // El cliente sigue las instrucciones de pago (Nequi/transferencia) y
  // espera el mensaje del local pidiendo el comprobante. Ya no hay
  // botón "Ya pagué" — el cajero acepta el pedido + abre WA y desde
  // ahí coordina el comprobante.
  return (
    <section className="space-y-4">
      <PaymentInstructionsView text={instructions} />
      <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-semibold">¿Qué sigue?</p>
        <p className="mt-1">
          Te vamos a contactar por WhatsApp para pedirte el comprobante. Ahí
          mismo te confirmamos cuando recibamos el pago. Esta página se
          actualiza sola.
        </p>
      </div>
    </section>
  );
}

function ItemsSummary({ order }: { order: PublicWebOrder }) {
  return (
    <section className="rounded-md border border-gray-200 bg-white p-4 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Resumen
      </p>
      <div className="mt-3 space-y-1">
        <Row label="Subtotal" value={order.subtotal} />
        {order.discountTotal > 0 ? (
          <Row label="Descuentos" value={-order.discountTotal} highlight />
        ) : null}
        <Row label="Total" value={order.total} bold />
      </div>
      {order.deliveryAddress ? (
        <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
          Entregar en: <span className="font-medium">{order.deliveryAddress}</span>
        </p>
      ) : null}
    </section>
  );
}

function Row({
  label,
  value,
  highlight = false,
  bold = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={highlight ? 'text-emerald-700' : 'text-gray-600'}>{label}</span>
      <span
        className={`tabular-nums ${highlight ? 'font-medium text-emerald-700' : 'text-gray-900'} ${bold ? 'text-base font-bold' : ''}`}
      >
        {COP.format(value)}
      </span>
    </div>
  );
}
