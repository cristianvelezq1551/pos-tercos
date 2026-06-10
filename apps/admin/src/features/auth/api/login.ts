import { LoginResponseSchema, type LoginRequest, type LoginResponse } from '@pos-tercos/types';

export async function loginRequest(input: LoginRequest): Promise<LoginResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-App': 'admin' },
    body: JSON.stringify(input),
    credentials: 'include',
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Credenciales inválidas');
    }
    // 403 (usuario inactivo) y otros: mostrar el mensaje del backend.
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }

  const json = (await res.json()) as unknown;
  return LoginResponseSchema.parse(json);
}
