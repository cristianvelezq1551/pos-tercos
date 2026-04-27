import { UserSchema, type User } from '@pos-tercos/types';

export async function fetchMe(): Promise<User> {
  const res = await fetch('/api/auth/me', {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Auth check failed: ${res.status}`);
  }

  const json = (await res.json()) as unknown;
  return UserSchema.parse(json);
}
