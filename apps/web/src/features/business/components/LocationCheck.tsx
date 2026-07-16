'use client';

import { cn } from '@pos-tercos/ui';
import { Check, Loader2, MapPin, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { useGeolocation, type GeoResult } from '../hooks/useGeolocation';

/**
 * Verificación de zona de cobertura en el checkout. Avisa ANTES de que el
 * cliente llene todo el formulario y descubra al final que está lejos.
 *
 * Si niega el permiso lo dejamos seguir: el server revalida y, sin
 * coordenadas, acepta (el radio es un filtro, no un candado).
 */
export function LocationCheck({
  onResolved,
}: {
  onResolved: (coords: { lat: number; lng: number } | null, blocked: boolean) => void;
}) {
  const { enabled, status, result, request, radiusKm } = useGeolocation();

  useEffect(() => {
    if (!enabled) {
      onResolved(null, false);
      return;
    }
    if (status === 'ok' && result) {
      onResolved({ lat: result.lat, lng: result.lng }, !result.inRange);
      return;
    }
    // Permiso negado o GPS no disponible: sin coordenadas y sin bloqueo.
    if (status === 'denied' || status === 'unavailable') onResolved(null, false);
  }, [enabled, status, result, onResolved]);

  if (!enabled) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {status === 'idle' ? (
        <Idle onClick={request} radiusKm={radiusKm} />
      ) : status === 'asking' ? (
        <Row icon={<Loader2 className="h-4 w-4 animate-spin" />} tone="muted">
          Buscando tu ubicación…
        </Row>
      ) : status === 'ok' && result ? (
        <Resolved result={result} radiusKm={radiusKm} />
      ) : (
        <Row icon={<TriangleAlert className="h-4 w-4" />} tone="muted">
          No pudimos verificar tu ubicación. Podés seguir con el pedido; si quedás fuera de
          nuestra zona te avisamos por WhatsApp.
        </Row>
      )}
    </div>
  );
}

function Idle({ onClick, radiusKm }: { onClick: () => void; radiusKm: number }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Llegamos hasta <strong className="text-foreground">{radiusKm} km</strong> del local.
        Verificá que estés dentro de la zona.
      </p>
      <button
        type="button"
        onClick={onClick}
        className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-muted px-6 text-sm font-semibold text-foreground transition-colors hover:bg-ink-700"
      >
        <MapPin className="h-4 w-4" strokeWidth={2.25} />
        Usar mi ubicación
      </button>
    </div>
  );
}

function Resolved({ result, radiusKm }: { result: GeoResult; radiusKm: number }) {
  const km = result.distanceKm;
  if (result.inRange) {
    return (
      <Row icon={<Check className="h-4 w-4" strokeWidth={2.5} />} tone="ok">
        {km === null
          ? 'Ubicación confirmada.'
          : `Estás a ${km.toFixed(1)} km — dentro de nuestra zona.`}
      </Row>
    );
  }
  return (
    <Row icon={<TriangleAlert className="h-4 w-4" />} tone="bad">
      Estás a {km!.toFixed(1)} km y llegamos hasta {radiusKm} km. Por ahora no podemos tomar tu
      pedido, pero te esperamos en el local.
    </Row>
  );
}

function Row({
  icon,
  tone,
  children,
}: {
  icon: React.ReactNode;
  tone: 'ok' | 'bad' | 'muted';
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 text-sm',
        tone === 'ok' && 'text-emerald-500',
        tone === 'bad' && 'text-destructive',
        tone === 'muted' && 'text-muted-foreground',
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </p>
  );
}
