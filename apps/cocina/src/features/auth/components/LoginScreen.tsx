'use client';

import { BrandLogo } from '@pos-tercos/brand';
import { LoginForm } from '@pos-tercos/ui';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { loginRequest } from '../api';
import { COCINA_ALLOWED_ROLES } from '../../../lib/auth-config';
import { getErrorMessage } from '../../../lib/errors';

export function LoginScreen() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const rawRedirect = params.get('redirect') ?? '/';
  // Open-redirect guard (CWE-601): solo rutas relativas same-origin.
  const redirectAfterLogin = /^\/(?!\/)/.test(rawRedirect) ? rawRedirect : '/';

  const handleSubmit = async ({ email, password }: { email: string; password: string }) => {
    setError(null);
    setPending(true);
    try {
      const result = await loginRequest({ email, password });
      if (!COCINA_ALLOWED_ROLES.includes(result.user.role)) {
        setError(`Tu rol (${result.user.role}) no tiene acceso a la cocina.`);
        setPending(false);
        return;
      }
      window.location.assign(redirectAfterLogin);
    } catch (e) {
      setError(getErrorMessage(e, 'Error desconocido'));
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col items-center justify-center overflow-hidden bg-primary px-12 py-14 text-ink-50 lg:flex">
        <span
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.10),transparent_55%)]"
        />
        <div className="relative flex flex-col items-center gap-8 text-center">
          <BrandLogo variant="mark" theme="dark" size="h-72" />
          <p className="font-display text-5xl font-extrabold uppercase leading-[0.85] tracking-[0.01em]">
            Cocina
            <br />
            al día.
          </p>
          <p className="caps text-[0.625rem] tracking-[0.3em] text-ink-50/85">
            Recetas · Producción · Inventario
          </p>
        </div>
      </aside>

      <section className="flex items-center justify-center bg-background px-6 py-10 sm:px-10">
        <div className="absolute left-1/2 top-8 -translate-x-1/2 lg:hidden">
          <BrandLogo variant="mark" theme="dark" size="h-14" />
        </div>
        <div className="w-full max-w-md">
          <LoginForm
            appLabel="Cocina"
            onSubmit={handleSubmit}
            isLoading={pending}
            errorMessage={error}
            submitLabel="Entrar a cocina"
            header={
              <header className="space-y-3">
                <span className="caps text-[0.6875rem] text-primary">App del cocinero</span>
                <h1 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-foreground">
                  Manos
                  <br />
                  a la obra.
                </h1>
                <p className="text-sm text-muted-foreground">
                  Consultá recetas, registrá producción y mantené el inventario al día.
                </p>
              </header>
            }
          />
        </div>
      </section>
    </main>
  );
}
