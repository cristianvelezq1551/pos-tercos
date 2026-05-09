'use client';

import { BrandLogo } from '@pos-tercos/brand';
import { LoginForm } from '@pos-tercos/ui';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { loginRequest } from '../api/login';
import { POS_ALLOWED_ROLES } from '../../../lib/auth-config';

export function LoginScreen() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const redirectAfterLogin = params.get('redirect') ?? '/';

  const handleSubmit = async ({ email, password }: { email: string; password: string }) => {
    setError(null);
    setPending(true);
    try {
      const result = await loginRequest({ email, password });
      if (!POS_ALLOWED_ROLES.includes(result.user.role)) {
        setError(`Tu rol (${result.user.role}) no tiene acceso al punto de venta.`);
        setPending(false);
        return;
      }
      window.location.assign(redirectAfterLogin);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Panel izquierdo · marca rojo Tizón */}
      <aside className="relative hidden flex-col items-center justify-center overflow-hidden bg-primary px-12 py-14 text-ink-50 lg:flex">
        <span
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.10),transparent_55%)]"
        />

        <div className="relative flex flex-col items-center gap-8 text-center">
          <BrandLogo variant="mark" theme="dark" size="h-72" />

          <p className="font-display text-5xl font-extrabold uppercase leading-[0.85] tracking-[0.01em]">
            Cobra
            <br />
            sin pelear.
          </p>
          <p className="caps text-[0.625rem] tracking-[0.3em] text-ink-50/85">
            Mostrador · Cocina
          </p>
        </div>

        <div className="absolute bottom-8 left-12 right-12 flex items-center justify-between text-xs text-ink-50/70">
          <span className="caps tracking-[0.2em]">Punto de venta</span>
          <span className="caps tracking-[0.2em]">Cajero</span>
        </div>
      </aside>

      {/* Panel derecho · formulario */}
      <section className="flex items-center justify-center bg-background px-6 py-10 sm:px-10">
        <div className="absolute left-1/2 top-8 -translate-x-1/2 lg:hidden">
          <BrandLogo variant="mark" theme="dark" size="h-14" />
        </div>

        <div className="w-full max-w-md">
          <LoginForm
            appLabel="Punto de venta"
            onSubmit={handleSubmit}
            isLoading={pending}
            errorMessage={error}
            submitLabel="Abrir caja"
            header={
              <header className="space-y-3">
                <span className="caps text-[0.6875rem] text-primary">Mostrador · Cajero</span>
                <h1 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-foreground">
                  Listo para
                  <br />
                  el turno.
                </h1>
                <p className="text-sm text-muted-foreground">
                  Inicia sesión, cuenta la plata y abre turno. Después es solo cobrar.
                </p>
              </header>
            }
            footerSlot={
              <p className="text-center text-[0.6875rem] text-muted-foreground">
                Si el lector de tarjeta no responde, primero verifica que el cajón esté cerrado.
              </p>
            }
          />
        </div>
      </section>
    </main>
  );
}
