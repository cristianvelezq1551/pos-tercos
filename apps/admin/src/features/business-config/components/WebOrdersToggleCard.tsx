'use client';

import { Button, Card } from '@pos-tercos/ui';
import { Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateBusinessConfig } from '../api/client';

/**
 * Kill-switch de pedidos web (#13): ante abuso del formulario público (cada
 * pedido dispara un WhatsApp pago), el dueño apaga los pedidos al instante
 * sin deploy. El API rechaza POST /web/orders y la web oculta el checkout.
 */
export function WebOrdersToggleCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await updateBusinessConfig({ webOrdersEnabled: !enabled });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="px-5 py-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Globe className="h-4 w-4 text-primary" strokeWidth={1.75} />
        Pedidos web
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {enabled
          ? 'Los clientes pueden pedir desde la web. Si hay abuso (pedidos basura / spam de WhatsApp), apagalos acá al instante.'
          : 'PAUSADOS: la web muestra el menú pero no deja pedir, y el API rechaza pedidos nuevos.'}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <span
          className={`text-sm font-semibold ${enabled ? 'text-success' : 'text-destructive'}`}
        >
          {enabled ? '● Activos' : '○ Pausados'}
        </span>
        <Button
          variant={enabled ? 'outline' : 'default'}
          size="sm"
          onClick={() => void toggle()}
          disabled={pending}
        >
          {pending ? 'Guardando…' : enabled ? 'Pausar pedidos' : 'Reactivar pedidos'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
