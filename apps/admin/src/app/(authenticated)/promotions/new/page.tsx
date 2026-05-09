import { Container, PageHeader } from '@pos-tercos/ui';
import { PromotionForm } from '../../../../features/promotions';

export default function NewPromotionPage() {
  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Nueva promoción"
        description="Configura tipo, descuento, días y horario. La promoción se aplica automáticamente cuando un producto seleccionado se vende dentro de la ventana."
        breadcrumbs={[
          { label: 'Promociones', href: '/promotions' },
          { label: 'Nueva' },
        ]}
      />
      <Container size="6xl" padY="md">
        <PromotionForm />
      </Container>
    </>
  );
}
