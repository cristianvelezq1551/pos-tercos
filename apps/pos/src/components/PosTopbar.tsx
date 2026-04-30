import type { User } from '@pos-tercos/types';
import { LogoutButton } from '../features/auth';
import { APP_LABEL } from '../lib/auth-config';

export function PosTopbar({ user }: { user: User | null }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-3">
        <span className="rounded-md bg-blue-600 px-2 py-1 text-xs font-bold text-white">POS</span>
        <span className="text-sm font-semibold tracking-tight">{APP_LABEL}</span>
      </div>
      <div className="flex items-center gap-3">
        {user ? (
          <span className="text-sm text-gray-600">
            {user.email} · <span className="font-medium text-gray-900">{user.role}</span>
          </span>
        ) : null}
        <LogoutButton />
      </div>
    </header>
  );
}
