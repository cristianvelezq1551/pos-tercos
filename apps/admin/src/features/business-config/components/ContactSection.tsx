'use client';

import type { BusinessConfig } from '@pos-tercos/types';
import { FormField, Input } from '@pos-tercos/ui';
import { MapPin, Phone } from 'lucide-react';
import { updateBusinessConfig } from '../api/client';
import { useSectionDraft } from '../hooks/useSectionDraft';
import { SectionCard } from './SectionCard';

/** Contacto y ubicación: alimenta el footer, /ubicaciones y los botones de llamar/WhatsApp. */
export function ContactSection({
  config,
  onSaved,
}: {
  config: BusinessConfig;
  onSaved: (c: BusinessConfig) => void;
}) {
  const { draft, setDraft, dirty, state, error, save } = useSectionDraft({
    initial: {
      phone: config.phone,
      phoneDisplay: config.phoneDisplay,
      address: config.address,
      mapsUrl: config.mapsUrl,
    },
    toPatch: (d) => d,
    onSaved,
  });

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft({ ...draft, [key]: value });

  return (
    <SectionCard
      title="Contacto y ubicación"
      description="El teléfono, la dirección y el mapa que ve el cliente en la web."
      icon={<Phone className="h-4 w-4" strokeWidth={2} />}
      onSave={() => void save(updateBusinessConfig)}
      state={state}
      error={error}
      dirty={dirty}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Celular"
          hint="Con +57 y 10 dígitos. Con este número se arman el botón de llamar y el de WhatsApp."
        >
          <Input
            value={draft.phone}
            onChange={(e) => set('phone', e.target.value.trim())}
            placeholder="+573207615261"
            inputMode="tel"
          />
        </FormField>

        <FormField label="Cómo se muestra" hint="Solo estética. Ej: +57 320 761 5261">
          <Input
            value={draft.phoneDisplay}
            onChange={(e) => set('phoneDisplay', e.target.value)}
            placeholder="+57 320 761 5261"
          />
        </FormField>
      </div>

      <FormField label="Dirección">
        <Input
          value={draft.address}
          onChange={(e) => set('address', e.target.value)}
          placeholder="Cra 31 #37s-49, Envigado, Antioquia"
        />
      </FormField>

      <FormField
        label="Link de Google Maps"
        hint="Pegá el link de “Compartir” de Google Maps. Las coordenadas se deducen solas al guardar y alimentan el mapa y el botón de Waze."
      >
        <Input
          value={draft.mapsUrl}
          onChange={(e) => set('mapsUrl', e.target.value.trim())}
          placeholder="https://maps.app.goo.gl/…"
        />
      </FormField>

      <CoordsHint coords={config.coords} mapsUrl={config.mapsUrl} />
    </SectionCard>
  );
}

/**
 * Las coordenadas no se editan a mano: son consecuencia del link. Se muestran
 * para que el dueño vea si se pudieron deducir — si no, el mapa y Waze no van.
 */
function CoordsHint({ coords, mapsUrl }: { coords: string; mapsUrl: string }) {
  if (!mapsUrl) return null;
  if (coords) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="h-4 w-4 shrink-0 text-emerald-500" strokeWidth={2} />
        Ubicación detectada:{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums">{coords}</code>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
      No se pudieron deducir las coordenadas de ese link. El botón “Cómo llegar” va a funcionar,
      pero el mapa y Waze no. Probá con el link de “Compartir” de la app de Google Maps.
    </p>
  );
}
