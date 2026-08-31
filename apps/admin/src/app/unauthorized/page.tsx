import { Badge } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import Link from 'next/link';

/**
 * Dos negaciones distintas caían en el MISMO texto, y solo una era cierta:
 *
 * - El middleware bloquea a quien no entra al admin (un cocinero). Ahí sí
 *   corresponde decir qué roles entran.
 * - `requireRole` bloquea una SECCIÓN del dueño a un administrador. A esa
 *   persona se le decía "solo los roles ADMIN_OPERATIVO y DUEÑO pueden
 *   acceder" —siendo ella administradora— y se le ofrecía "volver al login",
 *   que es un callejón sin salida: su sesión está perfectamente bien.
 */
export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  const esSeccion = motivo === 'seccion';

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background p-6 text-center">
      <LineArtIllustration name="closed-shift" className="h-32 w-auto text-ink-300" />
      <Badge tone="danger" className="mt-4">
        {esSeccion ? 'Sección restringida' : 'Acceso denegado'}
      </Badge>
      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-foreground">
        {esSeccion ? 'Esta sección es solo del dueño' : 'Tu usuario no entra a esta aplicación'}
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        {esSeccion ? (
          <>
            Tu sesión está bien: lo que pasa es que esta parte —la plata del negocio y la auditoría—
            la abre solo el dueño. Todo lo demás lo sigues usando normal.
          </>
        ) : (
          <>
            Esta aplicación es para quien administra el negocio o atiende la caja. Si crees que
            deberías entrar, pídele al dueño que revise tu usuario.
          </>
        )}
      </p>
      <Link
        href={esSeccion ? '/' : '/login'}
        className="mt-8 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-150 hover:bg-red-700 hover:shadow-md active:translate-y-px"
      >
        {esSeccion ? 'Volver al inicio' : 'Volver al login'}
      </Link>
    </main>
  );
}
