import { Container, PageHeader } from '@pos-tercos/ui';
import { Users } from 'lucide-react';
import { UsersManager } from '../../../features/users';
import { getUsersServer } from '../../../features/users/server';
import { requireRole } from '../../../lib/guards';

export default async function UsersPage() {
  await requireRole(['DUENO']);
  const result = await getUsersServer();

  return (
    <>
      <PageHeader
        eyebrow="Equipo"
        title="Usuarios"
        description="Gestioná el personal: crea empleados, asigna roles, resetea contraseñas y PIN de aprobación, y desactiva a quien ya no trabaja."
        icon={<Users className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        {Array.isArray(result) ? (
          <UsersManager users={result} />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning"
          >
            {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
