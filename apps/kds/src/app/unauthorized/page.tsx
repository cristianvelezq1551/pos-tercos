import { Badge } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background p-6 text-center text-foreground">
      <LineArtIllustration name="closed-shift" className="h-32 w-auto text-ink-400" />
      <Badge tone="danger" className="mt-4">
        Acceso denegado
      </Badge>
      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-foreground">
        Tu rol no tiene acceso a Cocina
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        Solo los roles{' '}
        <span className="font-semibold text-foreground">Cocinero</span>,{' '}
        <span className="font-semibold text-foreground">Administrador operativo</span> y{' '}
        <span className="font-semibold text-foreground">Dueño</span> pueden operar la pantalla
        de cocina.
      </p>
      <Link
        href="/login"
        className="mt-8 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-red-600"
      >
        Volver al ingreso
      </Link>
    </main>
  );
}
