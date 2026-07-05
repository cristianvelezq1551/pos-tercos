import {
  LoginResponseSchema,
  UserSchema,
  type LoginRequest,
  type LoginResponse,
  type User,
} from '@pos-tercos/types';

export async function loginRequest(input: LoginRequest): Promise<LoginResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-App': 'cocina' },
    body: JSON.stringify(input),
    credentials: 'include',
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Credenciales inválidas');
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  return LoginResponseSchema.parse(await res.json());
}

export async function fetchMe(): Promise<User> {
  const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(`Auth check failed: ${res.status}`);
  return UserSchema.parse(await res.json());
}

export async function logoutRequest(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'X-Client-App': 'cocina' },
    credentials: 'include',
  });
}
