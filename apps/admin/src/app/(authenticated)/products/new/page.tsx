import { Container, PageHeader } from '@pos-tercos/ui';
import { ProductForm } from '../../../../features/products';

export default function NewProductPage() {
  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Nuevo producto"
        description="Lo que vendes en mostrador. Define el precio, la categoría y, si aplica, marca como combo."
        breadcrumbs={[
          { label: 'Productos', href: '/products' },
          { label: 'Nuevo' },
        ]}
      />
      <Container size="4xl" padY="md">
        <ProductForm />
      </Container>
    </>
  );
}
