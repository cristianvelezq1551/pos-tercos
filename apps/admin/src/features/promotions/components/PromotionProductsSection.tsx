import type { Product } from '@pos-tercos/types';
import { Section, type FormState } from './PromotionFormHelpers';

interface PromotionProductsSectionProps {
  products: Product[];
  productsError: string | null;
  productIds: FormState['productIds'];
  onToggleProduct: (id: string) => void;
}

export function PromotionProductsSection({
  products,
  productsError,
  productIds,
  onToggleProduct,
}: PromotionProductsSectionProps) {
  return (
    <Section title={`Productos (${productIds.size} seleccionados)`}>
      {productsError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          No se pudieron cargar productos: {productsError}
        </p>
      )}
      {!productsError && products.length === 0 && (
        <p className="text-sm text-muted-foreground">Cargando productos…</p>
      )}
      {products.length > 0 && (
        <div className="grid max-h-80 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-border bg-card p-2 sm:grid-cols-2">
          {products.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                productIds.has(p.id)
                  ? 'border-primary bg-destructive/10'
                  : 'border-transparent hover:bg-muted/40'
              }`}
            >
              <input
                type="checkbox"
                checked={productIds.has(p.id)}
                onChange={() => onToggleProduct(p.id)}
              />
              <span className={productIds.has(p.id) ? 'font-medium' : ''}>
                {p.name}
              </span>
              {p.isCombo && (
                <span className="ml-auto text-xs text-purple-600">combo</span>
              )}
            </label>
          ))}
        </div>
      )}
    </Section>
  );
}
