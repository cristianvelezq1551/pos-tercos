import { PromotionForm } from '../../../../features/promotions';

export default function NewPromotionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nueva promoción</h1>
        <p className="mt-1 text-sm text-gray-600">
          Configurá tipo, descuento, días y horario. La promo se aplica
          automáticamente cuando un producto seleccionado se vende dentro de
          la ventana.
        </p>
      </div>
      <PromotionForm />
    </div>
  );
}
