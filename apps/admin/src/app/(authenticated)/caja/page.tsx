import { Container, PageHeader } from '@pos-tercos/ui';

/**
 * Placeholder de la Caja unificada (Fase 1 del plan UNIFICACION-POS-ADMIN.md).
 * En Fase 2 se porta acá la venta/cobro/historial/arqueos del POS.
 */
export default function CajaPage() {
  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Caja"
        description="Punto de venta unificado (en construcción)."
      />
      <Container size="7xl" padY="md">
        <div className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          La caja se está integrando al panel. Por ahora seguí usando la app de
          cajero. Próximo paso: portar venta, cobro, historial y arqueos.
        </div>
      </Container>
    </>
  );
}
