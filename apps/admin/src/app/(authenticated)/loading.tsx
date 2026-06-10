import { Container, LoadingSkeleton } from '@pos-tercos/ui';

/**
 * Estado de carga a nivel de ruta: mientras un Server Component hace su fetch,
 * Next muestra esto en lugar de congelar la página anterior. La topbar/sidebar
 * (layout) permanecen.
 */
export default function Loading() {
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
