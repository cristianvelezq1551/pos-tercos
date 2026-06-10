'use client';

import { cn } from '@pos-tercos/ui';
import type { StockableType } from '@pos-tercos/types';

interface StockableTypeSelectorProps {
  value: StockableType;
  onChange: (type: StockableType) => void;
  disabled?: boolean;
}

export function StockableTypeSelector({ value, onChange, disabled }: StockableTypeSelectorProps) {
  return (
    <div className="flex gap-3 text-sm">
      <label className={cn('flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-2.5 transition-colors', value === 'INGREDIENT' ? 'border-success-border bg-success-bg/30' : 'border-border bg-card hover:bg-muted/40')}>
        <input type="radio" name="stk-type" checked={value === 'INGREDIENT'} onChange={() => onChange('INGREDIENT')} disabled={disabled} className="mt-0.5 h-4 w-4 text-success" />
        <span>
          <span className="block font-medium text-foreground">Insumo</span>
          <span className="text-xs text-muted-foreground">Entra en recetas (pollo, harina, sal)</span>
        </span>
      </label>
      <label className={cn('flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-2.5 transition-colors', value === 'PRODUCT' ? 'border-primary bg-destructive/10' : 'border-border bg-card hover:bg-muted/40')}>
        <input type="radio" name="stk-type" checked={value === 'PRODUCT'} onChange={() => onChange('PRODUCT')} disabled={disabled} className="mt-0.5 h-4 w-4 text-primary" />
        <span>
          <span className="block font-medium text-foreground">Producto de reventa directa</span>
          <span className="text-xs text-muted-foreground">Comprado y vendido tal cual (Coca-Cola)</span>
        </span>
      </label>
    </div>
  );
}
