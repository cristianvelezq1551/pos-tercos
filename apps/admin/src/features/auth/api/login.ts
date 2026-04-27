import { LoginResponseSchema, type LoginRequest, type LoginResponse } from '@pos-tercos/types';

export async function loginRequest(input: LoginRequest): Promise<LoginResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) {
      throw new Error('Credenciales inválidas');
    }
    throw new Error(`Error ${res.status}: ${text || res.statusText}`);
  }

  const json = (await res.json()) as unknown;
  return LoginResponseSchema.parse(json);
}
