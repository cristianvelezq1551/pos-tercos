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
}

const LoginForm = React.forwardRef<HTMLFormElement, LoginFormProps>(
  ({ appLabel, onSubmit, isLoading = false, errorMessage = null, className }, ref) => {
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
          'mx-auto w-full max-w-sm space-y-6 rounded-lg border border-gray-200 bg-white p-8 shadow-sm',
          className,
        )}
        noValidate
      >
        <header className="space-y-1 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">{appLabel}</p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Iniciar sesión</h1>
          <p className="text-sm text-gray-500">Ingresá tus credenciales para continuar.</p>
        </header>

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
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {errorMessage}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={isLoading || !email || !password}>
          {isLoading ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
    );
  },
);
LoginForm.displayName = 'LoginForm';

export { LoginForm };
