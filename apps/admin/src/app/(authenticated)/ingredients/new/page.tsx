import { Container, PageHeader } from '@pos-tercos/ui';
import { IngredientForm } from '../../../../features/ingredients';

export default function NewIngredientPage() {
  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Nuevo insumo"
        description="Materia prima que compras a proveedores. Define unidad de compra, unidad de receta y factor de conversión."
        breadcrumbs={[{ label: 'Insumos', href: '/ingredients' }, { label: 'Nuevo' }]}
      />
      <Container size="4xl" padY="md">
        <IngredientForm />
      </Container>
    </>
  );
}
