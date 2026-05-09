import { Container, PageHeader } from '@pos-tercos/ui';
import { SubproductForm } from '../../../../features/subproducts';

export default function NewSubproductPage() {
  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Nuevo subproducto"
        description="Intermedio cocinado que se usa en la receta de productos vendibles. Define cuántas unidades produce 1 corrida."
        breadcrumbs={[
          { label: 'Subproductos', href: '/subproducts' },
          { label: 'Nuevo' },
        ]}
      />
      <Container size="4xl" padY="md">
        <SubproductForm />
      </Container>
    </>
  );
}
