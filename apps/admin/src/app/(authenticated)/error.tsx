'use client';

import { Button, Container } from '@pos-tercos/ui';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';

const MARCA_RECARGA = 'admin:ultima-recarga-por-chunk';
// Ventana anti-bucle: si el archivo de verdad no está, recargar en loop dejaría
// la pantalla parpadeando para siempre. Una recarga por minuto como mucho.
const ESPERA_ENTRE_RECARGAS_MS = 60_000;

/** Un pedazo del programa que no llegó al navegador (conexión o versión nueva). */
function esCargaIncompleta(error: Error) {
  return error.name === 'ChunkLoadError' || /Loading chunk .+ failed/i.test(error.message);
}

/**
 * Marca la recarga y dice si toca recargar ahora.
 *
 * Va en try/catch porque `sessionStorage` LANZA con el almacenamiento bloqueado
 * (modo privado, política del equipo) — y un error boundary que revienta no lo
 * atrapa nadie: la pantalla queda en blanco. Sin poder marcar tampoco se
 * recarga sola: sin marca no hay cómo frenar el bucle, y una pantalla
 * parpadeando para siempre es peor que un botón.
 */
function puedeRecargar(): boolean {
  try {
    const previa = Number(sessionStorage.getItem(MARCA_RECARGA) ?? 0);
    if (Date.now() - previa < ESPERA_ENTRE_RECARGAS_MS) return false;
    sessionStorage.setItem(MARCA_RECARGA, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

/**
 * Error boundary de ruta: captura cualquier throw no manejado dentro del área
 * autenticada (p. ej. un fallo de parseo) y muestra una página con marca en vez
 * del overlay crudo de Next.
 *
 * Caso aparte: cuando lo que falló es la DESCARGA de un pedazo del programa,
 * `reset` re-renderiza el mismo segmento sin traer lo que falta y la persona se
 * queda varada tocando "Reintentar". Eso solo se arregla recargando, así que se
 * recarga solo (una vez por minuto) y, si aun así falla, el botón lo dice.
 */
export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const cargaIncompleta = esCargaIncompleta(error);
  const [recargando, setRecargando] = useState(cargaIncompleta);

  useEffect(() => {
    console.error('[admin] error de ruta', error);
    if (!cargaIncompleta) return;

    if (!puedeRecargar()) {
      setRecargando(false);
      return;
    }
    window.location.reload();
  }, [error, cargaIncompleta]);

  if (recargando) {
    return (
      <Container size="2xl" padY="md">
        <p className="mt-8 text-center text-sm text-muted-foreground">Recargando la pantalla…</p>
      </Container>
    );
  }

  return (
    <Container size="2xl" padY="md">
      <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-8 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-bg text-warning">
          <AlertTriangle className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
            {cargaIncompleta ? 'La pantalla no terminó de cargar' : 'Algo salió mal'}
          </h1>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {cargaIncompleta
              ? 'Se cortó la descarga de esta sección. Revisa la conexión y vuelve a cargar la página.'
              : 'No pudimos cargar esta sección. Puede ser una caída temporal del sistema. Intenta de nuevo en un momento.'}
          </p>
        </div>
        <div className="flex gap-2">
          {cargaIncompleta ? (
            <Button onClick={() => window.location.reload()}>Cargar de nuevo</Button>
          ) : (
            <Button onClick={() => reset()}>Reintentar</Button>
          )}
          <Button variant="outline" onClick={() => (window.location.href = '/')}>
            Ir al inicio
          </Button>
        </div>
      </div>
    </Container>
  );
}
