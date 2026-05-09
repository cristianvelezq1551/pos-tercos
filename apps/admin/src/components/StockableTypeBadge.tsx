import { BrandIcon } from '@pos-tercos/brand';
import { Badge, cn } from '@pos-tercos/ui';

export type StockableType = 'INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT';

interface StockableTypeBadgeProps {
  type: StockableType;
  /** Tamaño visual. Default `md`. */
  size?: 'sm' | 'md';
  /** Si true, renderiza solo el ícono (mobile-friendly). */
  iconOnly?: boolean;
  className?: string;
}

const CONFIG: Record<
  StockableType,
  { label: string; icon: 'flame' | 'burger' | 'knife'; tone: 'success' | 'primary' | 'neutral' }
> = {
  INGREDIENT: { label: 'Insumo', icon: 'flame', tone: 'success' },
  PRODUCT: { label: 'Producto', icon: 'burger', tone: 'primary' },
  SUBPRODUCT: { label: 'Subproducto', icon: 'knife', tone: 'neutral' },
};

/**
 * Badge polimórfico para tipo de stockable. Reemplaza emojis 🌾📦 con
 * íconos custom de marca alineados al style guide.
 */
export function StockableTypeBadge({
  type,
  size = 'md',
  iconOnly = false,
  className,
}: StockableTypeBadgeProps) {
  const cfg = CONFIG[type];
  return (
    <Badge tone={cfg.tone} size={size} className={cn('gap-1.5', className)}>
      <BrandIcon name={cfg.icon} className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {!iconOnly ? cfg.label : null}
    </Badge>
  );
}
