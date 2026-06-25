import { Container, LoadingSkeleton } from '@pos-tercos/ui';

/**
 * Esqueleto genérico de página: encabezado + tabla. Lo usan tanto `loading.tsx`
 * (Suspense de ruta) como el gate de navegación cliente (`MainSkeletonGate`),
 * para que el cambio de módulo SIEMPRE muestre esqueleto y no congele la página
 * anterior mientras el Server Component hace su fetch.
 */
export function RouteSkeleton() {
  return (
    <Container size="7xl" padY="md">
      <div className="space-y-6">
        <LoadingSkeleton shape="text" width="40%" height="1.75rem" />
        <LoadingSkeleton shape="text" width="65%" />
        <div className="rounded-lg border border-border bg-card p-4">
          <LoadingSkeleton shape="table-row" count={8} />
        </div>
      </div>
    </Container>
  );
}
