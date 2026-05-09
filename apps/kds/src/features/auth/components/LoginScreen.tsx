'use client';

import { BrandLogo } from '@pos-tercos/brand';
import { LoginForm } from '@pos-tercos/ui';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { loginRequest } from '../api/login';
import { KDS_ALLOWED_ROLES } from '../../../lib/auth-config';

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
      if (!KDS_ALLOWED_ROLES.includes(result.user.role)) {
        setError(`Tu rol (${result.user.role}) no tiene acceso a Cocina.`);
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
    <main className="grid min-h-dvh bg-background lg:grid-cols-[1fr_1fr]">
      <aside className="relative hidden flex-col items-center justify-center overflow-hidden bg-card px-12 py-14 text-foreground lg:flex">
        <span
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_30%_15%,rgba(229,41,62,0.12),transparent_55%)]"
        />
        <div className="relative flex flex-col items-center gap-8 text-center">
          <BrandLogo variant="mark" theme="dark" size="h-64" />
          <p className="font-display text-4xl font-extrabold uppercase leading-[0.9] tracking-[0.02em]">
            Cocina al
            <br />
            <span className="text-primary">ritmo justo.</span>
          </p>
          <p className="caps text-[0.625rem] tracking-[0.3em] text-muted-foreground">
            Pantalla de cocina · KDS
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
                <span className="caps text-[0.6875rem] text-primary">Cocina</span>
                <h1 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-foreground">
                  Manos al
                  <br />
                  fuego.
                </h1>
                <p className="text-sm text-muted-foreground">
                  Inicia sesión para ver los pedidos en preparación y marcar listos.
                </p>
              </header>
            }
          />
        </div>
      </section>
    </main>
  );
}
