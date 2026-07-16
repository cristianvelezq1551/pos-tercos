'use client';

import type { WebOrderType } from '@pos-tercos/types';
import { cn, FormField, Input, Textarea } from '@pos-tercos/ui';
import { Bike, Store } from 'lucide-react';
import { useBusiness } from '../../business';

/**
 * Recoger o domicilio. Solo aparece si el dueño reparte (`deliveryEnabled`);
 * si no, el pedido es siempre para recoger y no se le pregunta nada al cliente.
 */
export function FulfillmentPicker({
  type,
  address,
  addressNotes,
  onType,
  onAddress,
  onAddressNotes,
}: {
  type: WebOrderType;
  address: string;
  addressNotes: string;
  onType: (t: WebOrderType) => void;
  onAddress: (v: string) => void;
  onAddressNotes: (v: string) => void;
}) {
  const deliveryEnabled = useBusiness((s) => s.business.radius.deliveryEnabled);
  if (!deliveryEnabled) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Option
          active={type === 'WEB_PICKUP'}
          icon={<Store className="h-5 w-5" strokeWidth={2} />}
          label="Recoger"
          hint="Pasás por el local"
          onClick={() => onType('WEB_PICKUP')}
        />
        <Option
          active={type === 'WEB_DELIVERY'}
          icon={<Bike className="h-5 w-5" strokeWidth={2} />}
          label="A domicilio"
          hint="Te lo llevamos"
          onClick={() => onType('WEB_DELIVERY')}
        />
      </div>

      {type === 'WEB_DELIVERY' ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <FormField
            label="Dirección de entrega"
            hint="Escribí calle, número y apartamento. Cuanto más claro, más rápido llega."
            required
          >
            <Input
              value={address}
              onChange={(e) => onAddress(e.target.value)}
              placeholder="Cra 43A #5-15, torre 2, apto 502"
              autoComplete="street-address"
            />
          </FormField>
          <FormField label="Referencias (opcional)">
            <Textarea
              value={addressNotes}
              onChange={(e) => onAddressNotes(e.target.value)}
              rows={2}
              placeholder="Portería azul, el timbre no suena, llamar al llegar…"
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            El costo del domicilio se paga aparte al repartidor. Te lo confirmamos por WhatsApp.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Option({
  active,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-col items-center gap-1 rounded-xl border px-4 py-4 transition-colors',
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-muted',
      )}
    >
      <span className={active ? 'text-primary' : undefined}>{icon}</span>
      <span className="text-sm font-bold">{label}</span>
      <span className="text-xs">{hint}</span>
    </button>
  );
}
