import { Badge } from '@pos-tercos/ui';
import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background p-6 text-center">
      <Badge tone="danger">Acceso denegado</Badge>
      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-foreground">
        Tu rol no tiene acceso a la cocina
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        Solo los roles <span className="font-semibold text-foreground">COCINERO</span>,{' '}
        <span className="font-semibold text-foreground">ADMIN_OPERATIVO</span> y{' '}
        <span className="font-semibold text-foreground">DUEÑO</span> pueden entrar.
      </p>
      <Link
        href="/login"
        className="mt-8 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-red-700"
      >
        Volver al login
      </Link>
    </main>
  );
}
