import { Container, PageHeader } from '@pos-tercos/ui';
import { InvoiceUploader } from '../../../../features/invoices';

export default function NewInvoicePage() {
  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title="Nueva factura"
        description="Sube una foto y deja que la IA extraiga proveedor, items y precios — o cárgala manualmente si no tienes foto. Editas todo antes de confirmar."
        breadcrumbs={[{ label: 'Facturas', href: '/invoices' }, { label: 'Nueva' }]}
      />
      <Container size="6xl" padY="md">
        <InvoiceUploader />
      </Container>
    </>
  );
}
