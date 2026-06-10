export async function logoutRequest(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'X-Client-App': 'pos' },
    credentials: 'include',
  });
}
