'use client';

import { BrandLogo } from '@pos-tercos/brand';
import { LoginForm } from '@pos-tercos/ui';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { loginRequest } from '../api/login';
import { ADMIN_ALLOWED_ROLES } from '../../../lib/auth-config';
import { getErrorMessage } from '../../../lib/errors';

export function LoginScreen() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const rawRedirect = params.get('redirect') ?? '/';
  // Open-redirect guard (CWE-601): solo aceptamos rutas relativas same-origin.
  // Rechaza URLs absolutas (`https://evil…`) y protocol-relative (`//evil…`).
  const redirectAfterLogin = /^\/(?!\/)/.test(rawRedirect) ? rawRedirect : '/';

  const handleSubmit = async ({ email, password }: { email: string; password: string }) => {
    setError(null);
    setPending(true);
    try {
      const result = await loginRequest({ email, password });
      if (!ADMIN_ALLOWED_ROLES.includes(result.user.role)) {
        setError(`Tu rol (${result.user.role}) no tiene acceso a esta aplicación.`);
        setPending(false);
        return;
      }
      window.location.assign(redirectAfterLogin);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo iniciar sesión. Volvé a intentar.'));
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Panel izquierdo · marca */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 px-12 py-14 text-ink-50 lg:flex">
        <span
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_30%_15%,rgba(255,255,255,0.05),transparent_55%)]"
        />

        <div className="relative flex items-center gap-3">
          <BrandLogo variant="mark" theme="dark" size="h-10" />
          <span className="font-display text-2xl font-extrabold uppercase tracking-[0.04em]">
            Tercos
          </span>
        </div>

        <div className="relative flex flex-col items-center gap-8 text-center">
          <BrandLogo variant="mark" theme="dark" size="h-64" />
          <div className="space-y-3">
            <p className="font-display text-4xl font-extrabold uppercase leading-[0.9] tracking-[0.02em]">
              Hambre con
              <br />
              <span className="text-primary">carácter.</span>
            </p>
            <p className="caps text-[0.625rem] tracking-[0.3em] text-ink-400">
              Envigado
            </p>
          </div>
        </div>

        <div className="relative flex items-center justify-between text-xs text-ink-400">
          <span className="caps tracking-[0.2em]">Administración</span>
          <span className="caps tracking-[0.2em]">2026</span>
        </div>
      </aside>

      {/* Panel derecho · formulario */}
      <section className="flex items-center justify-center bg-background px-6 py-10 sm:px-10">
        <div className="absolute left-1/2 top-8 -translate-x-1/2 lg:hidden">
          <BrandLogo variant="mark" theme="dark" size="h-14" />
        </div>

        <div className="w-full max-w-md">
          <LoginForm
            appLabel="Administración"
            onSubmit={handleSubmit}
            isLoading={pending}
            errorMessage={error}
            submitLabel="Entrar"
            header={
              <header className="space-y-3">
                <span className="caps text-[0.6875rem] text-primary">Administración</span>
                <h1 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-foreground">
                  Bienvenido
                  <br />
                  de vuelta.
                </h1>
                <p className="text-sm text-muted-foreground">
                  Ingresa tus credenciales para gestionar el inventario, las recetas, las facturas
                  y los reportes.
                </p>
              </header>
            }
            footerSlot={
              <p className="text-center text-[0.6875rem] text-muted-foreground">
                ¿Problemas para entrar? Habla con el dueño antes de seguir intentando.
              </p>
            }
          />
        </div>
      </section>
    </main>
  );
}
