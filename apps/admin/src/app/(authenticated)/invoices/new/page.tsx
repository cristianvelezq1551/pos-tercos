import { Container, PageHeader } from '@pos-tercos/ui';
import { InvoiceUploader } from '../../../../features/invoices';

export default function NewInvoicePage() {
  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title="Nueva factura"
        description="Sube una foto de factura del proveedor. La IA extrae los datos y abre una ventana donde puedes editar todo antes de confirmar."
        breadcrumbs={[{ label: 'Facturas', href: '/invoices' }, { label: 'Nueva' }]}
      />
      <Container size="6xl" padY="md">
        <InvoiceUploader />
      </Container>
    </>
  );
}
