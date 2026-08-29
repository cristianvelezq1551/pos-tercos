import type { Promotion } from '@pos-tercos/types';
import { formatCop } from '../../../lib/format';
import { channelLabel, labelFor } from './PromotionFormHelpers';

/** Ficha de solo lectura de la promoción. Vive aparte para que el detalle
 *  —que además maneja apagar/encender— no se pase de las 200 líneas. */
export function PromotionSummaryCard({
  promotion,
  statusLabel,
}: {
  promotion: Promotion;
  statusLabel: string | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Row label="Tipo" value={labelFor(promotion.type)} />
        <Row
          label="Estado"
          value={statusLabel ?? (promotion.isActive ? 'Encendida' : 'Apagada')}
        />
        <Row label="Dónde aplica" value={channelLabel(promotion.channel)} />
        <Row label="Descuento" value={describeDiscount(promotion)} mono />
        <Row label="Días" value={describeDays(promotion.daysOfWeekMask)} mono />
        <Row
          label="Horario"
          value={`${hhmm(promotion.timeStart)} – ${hhmm(promotion.timeEnd)}`}
          mono
        />
        <Row
          label="Vigencia"
          value={
            !promotion.activeFrom && !promotion.activeTo
              ? 'Sin límite'
              : `${promotion.activeFrom ?? '—'} → ${promotion.activeTo ?? '—'}`
          }
          mono
        />
        <Row label="Creada por" value={promotion.createdByName ?? '—'} />
        <Row
          label="Creada el"
          value={new Date(promotion.createdAt).toLocaleString('es-CO')}
          mono
        />
      </dl>
    </div>
  );
}

function describeDiscount(p: Promotion): string {
  switch (p.type) {
    case 'PERCENT_OFF':
      return p.discountPct !== null ? `${(p.discountPct * 100).toFixed(0)}%` : '—';
    case 'FIXED_OFF':
      return p.discountFixed !== null ? formatCop(p.discountFixed) : '—';
    case 'BOGO':
      return `Compra ${p.bogoBuyQty ?? '?'}, lleva ${p.bogoGetQty ?? '?'} gratis`;
    case 'COMBO_OFF': {
      if (p.discountPct !== null)
        return `${(p.discountPct * 100).toFixed(0)}% (solo combos)`;
      if (p.discountFixed !== null) return `${formatCop(p.discountFixed)} (solo combos)`;
      return '—';
    }
  }
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
function describeDays(mask: number): string {
  if (mask === 127) return 'Todos los días';
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    if ((mask & (1 << i)) !== 0) days.push(DAY_LABELS[i]);
  }
  return days.join(', ');
}

function hhmm(s: string): string {
  return s.slice(0, 5);
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-foreground ${mono ? 'tabular-nums' : ''}`}>{value}</dd>
    </>
  );
}
