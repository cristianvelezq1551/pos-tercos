'use client';

import { Button, Container } from '@pos-tercos/ui';
import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

/**
 * Error boundary de ruta: captura cualquier throw no manejado dentro del área
 * autenticada (p. ej. un fallo de parseo) y muestra una página con marca en vez
 * del overlay crudo de Next. `reset` reintenta el render del segmento.
 */
export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin] error de ruta', error);
  }, [error]);

  return (
    <Container size="2xl" padY="md">
      <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-8 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-bg text-warning">
          <AlertTriangle className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
            Algo salió mal
          </h1>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            No pudimos cargar esta sección. Puede ser una caída temporal del sistema. Intenta de
            nuevo en un momento.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => reset()}>Reintentar</Button>
          <Button variant="outline" onClick={() => (window.location.href = '/')}>
            Ir al inicio
          </Button>
        </div>
      </div>
    </Container>
  );
}
