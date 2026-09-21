import type { Product } from '@pos-tercos/types';
import { Section, type FormState } from './PromotionFormHelpers';

interface PromotionProductsSectionProps {
  products: Product[];
  productsError: string | null;
  productIds: FormState['productIds'];
  sizeIdsByProduct: FormState['sizeIdsByProduct'];
  onToggleProduct: (id: string) => void;
  onToggleSize: (productId: string, sizeId: string) => void;
  onAllSizes: (productId: string) => void;
}

export function PromotionProductsSection({
  products,
  productsError,
  productIds,
  sizeIdsByProduct,
  onToggleProduct,
  onToggleSize,
  onAllSizes,
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
        <div className="grid max-h-96 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-border bg-card p-2 sm:grid-cols-2">
          {products.map((p) => {
            const elegido = productIds.has(p.id);
            const conVariantes = elegido && (p.sizes?.length ?? 0) > 0;
            return (
              <div
                key={p.id}
                className={`rounded-md border px-2 py-1.5 text-sm ${
                  elegido ? 'border-primary bg-destructive/10' : 'border-transparent hover:bg-muted/40'
                }`}
              >
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={elegido} onChange={() => onToggleProduct(p.id)} />
                  <span className={elegido ? 'font-medium' : ''}>{p.name}</span>
                  {p.isCombo && <span className="ml-auto text-xs text-purple-600">combo</span>}
                </label>
                {conVariantes ? (
                  <VariantPicker
                    product={p}
                    sizeIds={sizeIdsByProduct[p.id]}
                    onToggleSize={onToggleSize}
                    onAllSizes={onAllSizes}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/**
 * A qué variantes se limita la promo de ESTE producto. "Todas" es el default y
 * lo que hoy hacen todas las promos; limitar existe porque "Papas TERCOS" tiene
 * tres tamaños y el dueño quería la promo solo en uno.
 */
function VariantPicker({
  product,
  sizeIds,
  onToggleSize,
  onAllSizes,
}: {
  product: Product;
  /** undefined = todas las variantes. */
  sizeIds: string[] | undefined;
  onToggleSize: (productId: string, sizeId: string) => void;
  onAllSizes: (productId: string) => void;
}) {
  const todas = sizeIds === undefined;
  const chip = (activo: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs ${
      activo
        ? 'border-primary bg-primary/10 font-medium text-foreground'
        : 'border-border text-muted-foreground hover:bg-muted/40'
    }`;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6" role="group" aria-label={`Variantes de ${product.name}`}>
      <button type="button" className={chip(todas)} aria-pressed={todas} onClick={() => onAllSizes(product.id)}>
        Todas las variantes
      </button>
      {(product.sizes ?? []).map((s) => {
        const activo = !todas && sizeIds.includes(s.id);
        return (
          <button
            type="button"
            key={s.id}
            className={chip(activo)}
            aria-pressed={activo}
            onClick={() => onToggleSize(product.id, s.id)}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
