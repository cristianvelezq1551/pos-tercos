import { Container, PageHeader } from '@pos-tercos/ui';
import { SupplierForm } from '../../../../features/suppliers';

export default function NewSupplierPage() {
  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title="Nuevo proveedor"
        description="Distribuidor que te factura insumos o productos para reventa."
        breadcrumbs={[{ label: 'Proveedores', href: '/suppliers' }, { label: 'Nuevo' }]}
      />
      <Container size="4xl" padY="md">
        <SupplierForm />
      </Container>
    </>
  );
}
