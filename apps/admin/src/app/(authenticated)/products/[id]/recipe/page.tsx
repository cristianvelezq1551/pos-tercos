import { notFound } from 'next/navigation';
import { Container, PageHeader } from '@pos-tercos/ui';
import {
  ComboRecipeView,
  SinRecetaNotice,
  ProductRecipeTabs,
  RecipeEditor,
  VariantCostSummary,
} from '../../../../../features/recipes';
import { ApiError, serverFetchJson } from '../../../../../lib/api-server';
import { requireRole } from '../../../../../lib/guards';
import type {
  ExpandedCostResponse,
  Ingredient,
  Product,
  ProductSize,
  RecipeResponse,
  Subproduct,
} from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductRecipePage({ params }: PageProps) {
  // Solo Dueño puede modificar recetas — el editor de receta es Dueño-only.
  await requireRole(['DUENO']);
  const { id } = await params;

  let product: Product;
  let recipe: RecipeResponse;
  let ingredients: Ingredient[];
  let subproducts: Subproduct[];

  try {
    [product, recipe, ingredients, subproducts] = await Promise.all([
      serverFetchJson<Product>(`/products/${id}`),
      serverFetchJson<RecipeResponse>(`/products/${id}/recipe`),
      serverFetchJson<Ingredient[]>('/ingredients?only_active=true'),
      serverFetchJson<Subproduct[]>('/subproducts?only_active=true'),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Un combo no tiene receta propia: se descuenta el stock de sus componentes.
  // Se resuelve antes de las variantes — un combo no se vende por variante.
  if (product.isCombo) {
    const costo = await serverFetchJson<ExpandedCostResponse>(
      `/products/${id}/expanded-cost`,
    ).catch(() => null);
    const componentes = await Promise.all(
      (costo?.components ?? []).map(async (c) => ({
        ...c,
        directResale: await serverFetchJson<Product>(`/products/${c.productId}`)
          .then((cp) => cp.directResale)
          .catch(() => null),
      })),
    );
    return (
      <>
        <PageHeader
          eyebrow="Catálogo"
          title={`Receta de ${product.name}`}
          description="Un combo se arma con otros productos: el stock se descuenta de cada uno."
          breadcrumbs={[
            { label: 'Productos', href: '/products' },
            { label: product.name, href: `/products/${id}` },
            { label: 'Receta' },
          ]}
        />
        <Container size="6xl" padY="md">
          <ComboRecipeView
            components={componentes}
            totalCost={costo?.totalCost ?? null}
            missingReasons={costo?.missingReasons ?? []}
            comboPrice={product.comboPrice ?? product.basePrice}
          />
        </Container>
      </>
    );
  }

  // Una reventa directa tampoco consume receta: descuenta su propio stock. El
  // servidor ya rechaza guardarle líneas, así que ofrecer el editor sería una
  // acción que siempre termina en error.
  if (product.directResale) {
    return (
      <>
        <PageHeader
          eyebrow="Catálogo"
          title={`Receta de ${product.name}`}
          description="Se compra hecho y se vende igual: al venderlo se descuenta su propio stock."
          breadcrumbs={[
            { label: 'Productos', href: '/products' },
            { label: product.name, href: `/products/${id}` },
            { label: 'Receta' },
          ]}
        />
        <Container size="6xl" padY="md">
          <SinRecetaNotice productName={product.name} />
        </Container>
      </>
    );
  }

  // Si el producto tiene variantes, cargamos la receta de cada una para las pestañas.
  const sizes: ProductSize[] = (product.sizes ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const variants = await Promise.all(
    sizes.map(async (size) => ({
      size,
      recipe: await serverFetchJson<RecipeResponse>(
        `/products/${id}/sizes/${size.id}/recipe`,
      ),
    })),
  );

  // El costo de cada variante, para el aviso de arriba: la pestaña «Receta
  // base» muestra el costo de un plato que nadie puede comprar. Un costo que
  // no se pudo calcular queda en null — nunca en cero.
  const costoDe = async (path: string): Promise<number | null> => {
    try {
      return (await serverFetchJson<ExpandedCostResponse>(path)).totalCost;
    } catch {
      return null;
    }
  };
  const [baseCost, variantCosts] = await Promise.all([
    sizes.length > 0 ? costoDe(`/products/${id}/expanded-cost`) : Promise.resolve(null),
    Promise.all(
      sizes.map(async (size) => ({
        name: size.name,
        price: product.basePrice + size.priceModifier,
        cost: await costoDe(`/products/${id}/sizes/${size.id}/expanded-cost`),
      })),
    ),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title={`Receta de ${product.name}`}
        description="Define los componentes de la receta. El sistema calcula el costo desde el último precio registrado de cada insumo."
        breadcrumbs={[
          { label: 'Productos', href: '/products' },
          { label: product.name, href: `/products/${id}` },
          { label: 'Receta' },
        ]}
      />
      <Container size="6xl" padY="md">
        {variants.length > 0 ? (
          <div className="space-y-5">
            <VariantCostSummary
              baseCost={baseCost}
              basePrice={product.basePrice}
              variants={variantCosts}
            />
            <ProductRecipeTabs
              productId={id}
              productName={product.name}
              ingredients={ingredients}
              subproducts={subproducts}
              baseRecipe={recipe}
              variants={variants}
            />
          </div>
        ) : (
          <RecipeEditor
            parentType="product"
            parentId={id}
            parentName={product.name}
            initialRecipe={recipe}
            ingredients={ingredients}
            subproducts={subproducts}
            showExpandedCost
          />
        )}
      </Container>
    </>
  );
}
