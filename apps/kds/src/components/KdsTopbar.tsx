import type { User } from '@pos-tercos/types';
import { LogoutButton } from '../features/auth';
import { APP_LABEL } from '../lib/auth-config';

export function KdsTopbar({ user }: { user: User | null }) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-gray-800 bg-gray-900 px-4 text-white">
      <div className="flex items-center gap-3">
        <span className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold">KDS</span>
        <span className="text-sm font-semibold tracking-tight">{APP_LABEL}</span>
      </div>
      <div className="flex items-center gap-3">
        {user ? (
          <span className="text-xs text-gray-300">
            {user.email} · <span className="font-medium text-white">{user.role}</span>
          </span>
        ) : null}
        <LogoutButton />
      </div>
    </header>
  );
}
