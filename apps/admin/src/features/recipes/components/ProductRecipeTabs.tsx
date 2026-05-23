'use client';

import type {
  Ingredient,
  ProductSize,
  RecipeResponse,
  Subproduct,
} from '@pos-tercos/types';
import { cn } from '@pos-tercos/ui';
import { useState } from 'react';
import { RecipeEditor } from './RecipeEditor';

interface VariantRecipe {
  size: ProductSize;
  recipe: RecipeResponse;
}

/**
 * Editor de receta de un producto CON variantes: pestaña "Receta base" (común a
 * todas) + una pestaña por variante (su receta aditiva, ej. la proteína).
 */
export function ProductRecipeTabs({
  productId,
  productName,
  ingredients,
  subproducts,
  baseRecipe,
  variants,
}: {
  productId: string;
  productName: string;
  ingredients: Ingredient[];
  subproducts: Subproduct[];
  baseRecipe: RecipeResponse;
  variants: VariantRecipe[];
}) {
  const [active, setActive] = useState<'base' | string>('base');
  const tabs = [
    { key: 'base', label: 'Receta base' },
    ...variants.map((v) => ({ key: v.size.id, label: v.size.name })),
  ];
  const activeVariant = variants.find((v) => v.size.id === active) ?? null;

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
        La <strong>receta base</strong> aplica a todas las variantes. Cada variante{' '}
        <strong>suma</strong> su propia receta encima (ej. la proteína: Carne descuenta
        carne, Pollo descuenta pollo).
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={cn(
              '-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === 'base' ? (
        <RecipeEditor
          key="base"
          parentType="product"
          parentId={productId}
          parentName={productName}
          initialRecipe={baseRecipe}
          ingredients={ingredients}
          subproducts={subproducts}
          showExpandedCost
          hideHeader
        />
      ) : activeVariant ? (
        <RecipeEditor
          key={activeVariant.size.id}
          parentType="product"
          parentId={productId}
          parentName={`${productName} · ${activeVariant.size.name}`}
          sizeId={activeVariant.size.id}
          initialRecipe={activeVariant.recipe}
          ingredients={ingredients}
          subproducts={subproducts}
          hideHeader
        />
      ) : null}
    </div>
  );
}
