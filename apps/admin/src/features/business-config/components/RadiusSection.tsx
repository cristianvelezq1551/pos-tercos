'use client';

import type { BusinessConfig } from '@pos-tercos/types';
import { Card, FormField, NumberInput, Switch } from '@pos-tercos/ui';
import { Bike, Loader2, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { logError } from '../../../lib/client-log';
import { updateBusinessConfig } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

/**
 * Domicilios: si se reparte y hasta dónde. Sin `SectionCard` porque no hay
 * borrador — los switches guardan al toque y el radio al salir del campo.
 */
export function RadiusSection({
  config,
  onSaved,
}: {
  config: BusinessConfig;
  onSaved: (c: BusinessConfig) => void;
}) {
  const [km, setKm] = useState<number | null>(config.orderRadiusKm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setKm(config.orderRadiusKm);
  }, [config.orderRadiusKm]);

  const patch = async (body: Parameters<typeof updateBusinessConfig>[0]) => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateBusinessConfig(body));
    } catch (e) {
      logError('web-config.radius', e);
      setError(getErrorMessage(e, 'No se pudo guardar.'));
      setKm(config.orderRadiusKm); // revertir a lo que sigue guardado
    } finally {
      setSaving(false);
    }
  };

  const commitKm = () => {
    if (km === null || km === config.orderRadiusKm) return;
    void patch({ orderRadiusKm: km });
  };

  return (
    <Card className="p-5 sm:p-6">
      <header className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Bike className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Domicilios</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Si repartís y hasta dónde llegás.
          </p>
        </div>
      </header>

      <Switch
        checked={config.deliveryEnabled}
        disabled={saving}
        onChange={(e) => void patch({ deliveryEnabled: e.target.checked })}
        label="Hacemos domicilios"
        description={
          config.deliveryEnabled
            ? 'La web ofrece “A domicilio” y le pide la dirección al cliente. El costo del envío lo cargás vos en cada pedido, antes de cobrar.'
            : 'La web solo ofrece “Recoger en el local”.'
        }
      />

      {config.deliveryEnabled ? (
        <div className="mt-5 space-y-4 border-t border-border pt-5">
          <FormField
            label="Hasta dónde llegamos"
            hint="Distancia en línea recta desde el local, no de recorrido: alguien a 9 km derecho puede estar a 14 km de manejo."
          >
            <div className="flex items-center gap-2">
              <NumberInput
                value={km}
                onChange={setKm}
                onBlur={commitKm}
                decimals={1}
                suffix="km"
                min={0.1}
                max={100}
                className="w-36"
                disabled={saving}
              />
              {saving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </div>
          </FormField>

          {!config.coords ? (
            <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
              Sin la ubicación del local no se puede medir nada: cargá el link de Google Maps
              arriba. Mientras tanto, este límite no se aplica.
            </p>
          ) : null}

          <Switch
            checked={config.ordersRespectRadius}
            disabled={saving}
            onChange={(e) => void patch({ ordersRespectRadius: e.target.checked })}
            label="Rechazar domicilios fuera del radio"
            description={
              config.ordersRespectRadius
                ? 'La web le pide la ubicación al cliente y bloquea si está lejos. Si niega el permiso, el pedido pasa igual — el radio filtra, no es un candado.'
                : 'Ahora mismo se acepta un domicilio a cualquier distancia.'
            }
          />
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </Card>
  );
}
