import type { ManagedUser } from '@pos-tercos/types';
import { Badge, Button, DataTable, EmptyState, type DataTableColumn } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { ROLE_LABEL, PIN_ROLES } from '../lib/roles';

interface UsersTableProps {
  users: ManagedUser[];
  onEdit: (u: ManagedUser) => void;
  onResetPassword: (u: ManagedUser) => void;
  onSetPin: (u: ManagedUser) => void;
  onDelete: (u: ManagedUser) => void;
}

export function UsersTable({ users, onEdit, onResetPassword, onSetPin, onDelete }: UsersTableProps) {
  const columns: DataTableColumn<ManagedUser>[] = [
    {
      key: 'name',
      header: 'Nombre',
      cell: (u) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium text-foreground">{u.fullName}</span>
            {u.isPrimaryOwner ? (
              <span
                title="Dueño principal — protegido"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
              >
                <ShieldCheck className="h-3 w-3" strokeWidth={2} /> Principal
              </span>
            ) : null}
          </span>
          <span className="truncate text-xs text-muted-foreground">{u.email}</span>
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Rol',
      cell: (u) => <Badge tone="neutral" size="sm">{ROLE_LABEL[u.role]}</Badge>,
    },
    {
      key: 'pin',
      header: 'PIN',
      hideOnMobile: true,
      cell: (u) =>
        PIN_ROLES.includes(u.role) ? (
          u.hasPin ? (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} /> Configurado
            </span>
          ) : (
            <span className="text-xs text-warning">Sin PIN</span>
          )
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (u) =>
        u.active ? (
          <Badge tone="success" size="sm">Activo</Badge>
        ) : (
          <Badge tone="neutral" size="sm">Inactivo</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (u) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => onEdit(u)}>
            Editar
          </Button>
          {/* El dueño principal es intocable: nadie le cambia clave/PIN ni lo elimina. */}
          {!u.isPrimaryOwner ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => onResetPassword(u)}>
                Clave
              </Button>
              {PIN_ROLES.includes(u.role) && u.active ? (
                <Button variant="ghost" size="sm" onClick={() => onSetPin(u)}>
                  PIN
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(u)}
                className="text-destructive hover:text-destructive"
              >
                Eliminar
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={users}
      rowKey={(u) => u.id}
      columns={columns}
      emptyState={
        <EmptyState
          illustration={<LineArtIllustration name="empty-plate" />}
          title="Aún no hay usuarios"
          description="Crea los usuarios de tu equipo: cajeros, cocineros y administradores."
        />
      }
    />
  );
}
