'use client';

import * as React from 'react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { cn } from '../lib/utils';

export interface LoginFormProps {
  appLabel: string;
  onSubmit: (input: { email: string; password: string }) => Promise<void> | void;
  isLoading?: boolean;
  errorMessage?: string | null;
  className?: string;
  /**
   * Slot opcional que reemplaza el header default ({appLabel + título}).
   * Pasar p.ej. un `<BrandHeader>` para layouts editoriales con logo grande.
   */
  header?: React.ReactNode;
  /**
   * Slot debajo del botón submit. Útil para footer legal, links secundarios.
   */
  footerSlot?: React.ReactNode;
  /** Personalizar texto del botón submit. Default "Ingresar". */
  submitLabel?: string;
}

const LoginForm = React.forwardRef<HTMLFormElement, LoginFormProps>(
  (
    {
      appLabel,
      onSubmit,
      isLoading = false,
      errorMessage = null,
      className,
      header,
      footerSlot,
      submitLabel = 'Ingresar',
    },
    ref,
  ) => {
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isLoading) return;
      await onSubmit({ email, password });
    };

    return (
      <form
        ref={ref}
        onSubmit={handleSubmit}
        className={cn(
          'w-full space-y-6',
          !header && 'mx-auto max-w-sm rounded-2xl border border-border bg-card p-8 shadow-md',
          className,
        )}
        noValidate
      >
        {header ?? (
          <header className="space-y-1.5 text-center">
            <p className="caps text-[0.6875rem] text-primary">{appLabel}</p>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
              Iniciar sesión
            </h1>
            <p className="text-sm text-muted-foreground">
              Ingresá tus credenciales para continuar.
            </p>
          </header>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              disabled={isLoading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-password">Contraseña</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              disabled={isLoading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>

        {errorMessage ? (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-md border border-destructive/30 bg-red-50 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isLoading || !email || !password}
        >
          {isLoading ? 'Ingresando…' : submitLabel}
        </Button>

        {footerSlot}
      </form>
    );
  },
);
LoginForm.displayName = 'LoginForm';

export { LoginForm };
