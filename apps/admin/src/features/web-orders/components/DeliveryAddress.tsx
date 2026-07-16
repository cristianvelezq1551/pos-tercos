'use client';

import type { Sale } from '@pos-tercos/types';
import { Bike, MapPin, Store } from 'lucide-react';

/**
 * A dónde va el pedido. Sin esto el cajero no puede despachar un domicilio.
 * La dirección ESCRITA es la que manda; el mapa es una ayuda opcional (el GPS
 * solo existe si el cliente dio permiso).
 */
export function DeliveryAddress({ sale }: { sale: Sale }) {
  if (sale.type !== 'WEB_DELIVERY') {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
        <Store className="h-3.5 w-3.5" strokeWidth={2} />
        Recoge en el local
      </p>
    );
  }

  const coords =
    sale.deliveryLat != null && sale.deliveryLng != null
      ? `${sale.deliveryLat},${sale.deliveryLng}`
      : null;

  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-primary/10 p-2.5">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
        <Bike className="h-3.5 w-3.5" strokeWidth={2.25} />
        Domicilio
      </p>
      <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
        {sale.deliveryAddress}
      </p>
      {sale.deliveryNotes ? (
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{sale.deliveryNotes}</p>
      ) : null}
      {coords ? (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coords)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} />
          Abrir en el mapa
        </a>
      ) : null}
    </div>
  );
}
