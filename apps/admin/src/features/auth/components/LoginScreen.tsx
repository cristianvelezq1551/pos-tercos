'use client';

import { LoginForm } from '@pos-tercos/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { loginRequest } from '../api/login';
import { APP_LABEL, ADMIN_ALLOWED_ROLES } from '../../../lib/auth-config';

export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const redirectAfterLogin = params.get('redirect') ?? '/';

  const handleSubmit = async ({ email, password }: { email: string; password: string }) => {
    setError(null);
    try {
      const result = await loginRequest({ email, password });
      if (!ADMIN_ALLOWED_ROLES.includes(result.user.role)) {
        setError(`Tu rol (${result.user.role}) no tiene acceso a esta app.`);
        return;
      }
      startTransition(() => {
        router.replace(redirectAfterLogin);
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <LoginForm
        appLabel={APP_LABEL}
        onSubmit={handleSubmit}
        isLoading={pending}
        errorMessage={error}
      />
    </main>
  );
}
