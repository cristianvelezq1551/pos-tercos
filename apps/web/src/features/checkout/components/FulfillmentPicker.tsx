'use client';

import type { ResolvedAddressResponse, WebOrderType } from '@pos-tercos/types';
import { cn, FormField, Textarea } from '@pos-tercos/ui';
import { Bike, Store } from 'lucide-react';
import { AddressAutocomplete, useBusiness } from '../../business';

/**
 * Recoger o domicilio. Solo aparece si el dueño reparte (`deliveryEnabled`);
 * si no, el pedido es siempre para recoger y no se le pregunta nada al cliente.
 */
export function FulfillmentPicker({
  type,
  addressNotes,
  onType,
  onResolvedAddress,
  onAddressNotes,
}: {
  type: WebOrderType;
  addressNotes: string;
  onType: (t: WebOrderType) => void;
  /** null = no hay una dirección verificada elegida todavía. */
  onResolvedAddress: (resolved: ResolvedAddressResponse | null) => void;
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
          hint="Pasas por el local"
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
          <AddressAutocomplete onResolved={onResolvedAddress} />
          {/* Torre, apto y portería NO se geocodifican: van aparte, y son
              justo lo que el repartidor necesita para tocar un timbre. */}
          <FormField label="Torre, apartamento, referencias">
            <Textarea
              value={addressNotes}
              onChange={(e) => onAddressNotes(e.target.value)}
              rows={2}
              placeholder="Torre 2, apto 502. Portería azul, el timbre no suena…"
              maxLength={300}
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            Te confirmamos el costo del domicilio por WhatsApp y ahí te pasamos el total a
            pagar.
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
