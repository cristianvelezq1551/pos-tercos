import { cn } from '@pos-tercos/ui';
import { LineArtIllustration } from './line-art-illustration';

export interface ProductThumbItem {
  imageUrl: string | null;
  productName: string;
  quantity?: number;
}

export type ProductThumbSize = 'sm' | 'md' | 'lg';
export type ProductThumbLayout = 'grid' | 'row';

export interface ProductThumbStackProps {
  items: ProductThumbItem[];
  size?: ProductThumbSize;
  /** Máximo de slots renderables (default 4). Si hay más, el último muestra "+N". */
  max?: number;
  layout?: ProductThumbLayout;
  /** Cuando es `true`, las imágenes se decodean rápido (zona "current"). */
  eager?: boolean;
  className?: string;
}

const SIZE_CLASS: Record<ProductThumbSize, string> = {
  sm: 'h-20 w-20 rounded-xl',
  md: 'h-32 w-32 rounded-2xl',
  lg: 'h-48 w-48 rounded-3xl',
};

const LAYOUT_CLASS: Record<ProductThumbLayout, string> = {
  grid: 'grid grid-cols-2 gap-3',
  row: 'flex flex-row gap-3',
};

/**
 * Collage de hasta N imágenes de productos. Si `imageUrl` es null, cae a
 * line-art `burger`. Si hay más items que `max`, el último slot muestra "+N".
 *
 * Pensado para visibilidad pública — NO incluye precios ni modificadores.
 */
export function ProductThumbStack({
  items,
  size = 'md',
  max = 4,
  layout = 'grid',
  eager = false,
  className,
}: ProductThumbStackProps) {
  if (items.length === 0) return null;

  const visible = items.slice(0, max);
  const overflow = items.length - max;

  return (
    <div className={cn(LAYOUT_CLASS[layout], className)}>
      {visible.map((item, idx) => {
        const isLast = idx === visible.length - 1;
        const showOverflow = overflow > 0 && isLast;
        return (
          <Thumb
            key={`${item.productName}-${idx}`}
            item={item}
            size={size}
            eager={eager}
            overflowCount={showOverflow ? overflow + 1 : 0}
          />
        );
      })}
    </div>
  );
}

function Thumb({
  item,
  size,
  eager,
  overflowCount,
}: {
  item: ProductThumbItem;
  size: ProductThumbSize;
  eager: boolean;
  overflowCount: number;
}) {
  const baseClass = cn(
    'relative overflow-hidden border border-border bg-muted shadow-md',
    SIZE_CLASS[size],
  );

  if (overflowCount > 0) {
    return (
      <div
        className={cn(baseClass, 'flex items-center justify-center bg-card')}
      >
        <span className="font-display text-3xl font-extrabold text-foreground">
          +{overflowCount}
        </span>
      </div>
    );
  }

  return (
    <div className={baseClass}>
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.productName}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          className="h-full w-full select-none object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-ink-300">
          <LineArtIllustration name="burger" className="h-2/3 w-auto" />
        </div>
      )}
      {item.quantity && item.quantity > 1 ? (
        <span className="absolute right-2 top-2 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-foreground px-2 text-sm font-bold tabular text-background shadow-md">
          ×{item.quantity}
        </span>
      ) : null}
    </div>
  );
}
