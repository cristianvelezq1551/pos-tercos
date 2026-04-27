import Link from 'next/link';
import { IngredientForm } from '../../../../features/ingredients';

export default function NewIngredientPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/ingredients" className="text-sm text-blue-600 hover:underline">
          ← Volver a insumos
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Nuevo insumo</h1>
      </div>
      <div className="max-w-2xl">
        <IngredientForm />
      </div>
    </div>
  );
}
