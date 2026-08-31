import * as React from 'react';
import { Badge, type BadgeProps, type BadgeTone } from './badge';

export interface StatusMappingEntry {
  /** Texto visible en el badge */
  label: string;
  /** Color tonal */
  tone: BadgeTone;
  /** Si true, badge con punto pulsante (live status) */
  pulse?: boolean;
}

export type StatusMapping<S extends string = string> = Record<S, StatusMappingEntry>;

export interface StatusBadgeProps<S extends string = string> extends Omit<
  BadgeProps,
  'children' | 'tone' | 'withDot'
> {
  /** Estado canónico (típicamente un enum del backend) */
  status: S;
  /** Mapping status → { label, tone, pulse } */
  mapping: StatusMapping<S>;
  /** Override del label si quieres algo distinto al mapping */
  label?: string;
  /** Override del tone si quieres algo distinto al mapping */
  tone?: BadgeTone;
  /** Forzar dot ON/OFF (default: lo decide pulse del mapping) */
  withDot?: boolean;
}

/**
 * StatusBadge tipado por enum. Centralizá el mapping una vez por dominio
 * (p.ej. `WEB_ORDER_STATUS_MAPPING` en `apps/admin/features/web-orders/lib/`)
 * y reúsalo en admin/POS/KDS.
 *
 * Si el status no está mapeado, renderiza un fallback `neutral` con el string crudo.
 */
export function StatusBadge<S extends string = string>({
  status,
  mapping,
  label,
  tone,
  withDot,
  variant = 'subtle',
  size,
  className,
  ...rest
}: StatusBadgeProps<S>) {
  const entry = mapping[status];
  const finalLabel = label ?? entry?.label ?? status;
  const finalTone: BadgeTone = tone ?? entry?.tone ?? 'neutral';
  const showDot = withDot ?? entry?.pulse ?? false;

  return (
    <Badge
      tone={finalTone}
      variant={variant}
      size={size}
      withDot={showDot}
      className={className}
      {...rest}
    >
      {showDot && entry?.pulse ? <PulseDot /> : null}
      {finalLabel}
    </Badge>
  );
}

function PulseDot() {
  return (
    <span aria-hidden="true" className="relative -ml-0.5 inline-flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  );
}
