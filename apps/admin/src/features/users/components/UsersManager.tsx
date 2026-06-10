'use client';

import type { ManagedUser } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { KeyRound, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UsersTable } from './UsersTable';
import { UserFormDialog } from './UserFormDialog';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import { SetPinDialog } from './SetPinDialog';
import { DeleteUserDialog } from './DeleteUserDialog';
import { ChangeMyPinDialog } from './ChangeMyPinDialog';

type Modal =
  | { kind: 'create' }
  | { kind: 'edit'; user: ManagedUser }
  | { kind: 'reset'; user: ManagedUser }
  | { kind: 'pin'; user: ManagedUser }
  | { kind: 'delete'; user: ManagedUser }
  | { kind: 'myPin' }
  | null;

export function UsersManager({ users }: { users: ManagedUser[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);

  const close = (): void => setModal(null);
  const onSuccess = (): void => {
    close();
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setModal({ kind: 'myPin' })}>
          <KeyRound className="h-4 w-4" strokeWidth={1.75} />
          Cambiar mi PIN
        </Button>
        <Button onClick={() => setModal({ kind: 'create' })}>
          <UserPlus className="h-4 w-4" strokeWidth={1.75} />
          Nuevo usuario
        </Button>
      </div>

      <UsersTable
        users={users}
        onEdit={(user) => setModal({ kind: 'edit', user })}
        onResetPassword={(user) => setModal({ kind: 'reset', user })}
        onSetPin={(user) => setModal({ kind: 'pin', user })}
        onDelete={(user) => setModal({ kind: 'delete', user })}
      />

      {(modal?.kind === 'create' || modal?.kind === 'edit') && (
        <UserFormDialog
          open
          user={modal.kind === 'edit' ? modal.user : null}
          onClose={close}
          onSuccess={onSuccess}
        />
      )}
      {modal?.kind === 'reset' && (
        <ResetPasswordDialog user={modal.user} onClose={close} onSuccess={onSuccess} />
      )}
      {modal?.kind === 'pin' && (
        <SetPinDialog user={modal.user} onClose={close} onSuccess={onSuccess} />
      )}
      {modal?.kind === 'delete' && (
        <DeleteUserDialog user={modal.user} onClose={close} onSuccess={onSuccess} />
      )}
      {modal?.kind === 'myPin' && <ChangeMyPinDialog onClose={close} onSuccess={onSuccess} />}
    </div>
  );
}
