'use client';

import type { PublicMenuProduct } from '@pos-tercos/types';
import { COP } from '../../../lib/format';

export function ProductCard({
  product,
  onClick,
}: {
  product: PublicMenuProduct;
  onClick: () => void;
}) {
  const hasVariants =
    product.sizes.length > 0 || (product.modifiersEnabled && product.modifiers.length > 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start rounded-lg border border-gray-200 bg-white p-4 text-left transition hover:border-blue-400 hover:shadow-md"
    >
      <span className="line-clamp-2 text-base font-semibold text-gray-900">
        {product.name}
      </span>
      {product.description ? (
        <span className="mt-1 line-clamp-2 text-xs text-gray-500">{product.description}</span>
      ) : null}
      {product.category ? (
        <span className="mt-2 text-[10px] uppercase tracking-wide text-gray-400">
          {product.category}
        </span>
      ) : null}
      <span className="mt-3 text-lg font-bold tabular-nums text-blue-700">
        {COP.format(product.basePrice)}
      </span>
      {hasVariants ? (
        <span className="mt-1 text-xs text-gray-400">+ opciones</span>
      ) : null}
    </button>
  );
}
