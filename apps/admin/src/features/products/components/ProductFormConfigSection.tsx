'use client';

import { Input, Label } from '@pos-tercos/ui';
import type { FormState } from './ProductFormTypes';

interface ProductFormConfigSectionProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  pending: boolean;
  isEdit: boolean;
}

export function ProductFormConfigSection({
  form,
  setForm,
  pending,
  isEdit,
}: ProductFormConfigSectionProps) {
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-4">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Configuración
      </legend>

      <div className="flex items-center gap-2">
        <input
          id="modifiersEnabled"
          type="checkbox"
          disabled={pending}
          checked={form.modifiersEnabled}
          onChange={(e) => setForm((f) => ({ ...f, modifiersEnabled: e.target.checked }))}
          className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
        />
        <Label htmlFor="modifiersEnabled">
          Permite modificadores (sin queso, agregar tocino, etc.)
        </Label>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="isCombo"
          type="checkbox"
          disabled={pending || form.directResale}
          checked={form.isCombo}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              isCombo: e.target.checked,
              comboPrice: e.target.checked ? f.comboPrice : '',
            }))
          }
          className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
        />
        <Label htmlFor="isCombo">
          Es un combo (incluye otros productos)
          {form.directResale ? (
            <span className="ml-2 text-xs text-muted-foreground">— deshabilitado: ya es reventa directa</span>
          ) : null}
        </Label>
      </div>

      {form.isCombo && (
        <div className="space-y-2 pl-6">
          <Label htmlFor="comboPrice">Precio del combo (COP)</Label>
          <Input
            id="comboPrice"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            required
            disabled={pending}
            value={form.comboPrice}
            onChange={(e) => setForm((f) => ({ ...f, comboPrice: e.target.value }))}
            placeholder="35000"
          />
          <p className="text-xs text-muted-foreground">
            Precio total del combo (típicamente con descuento sobre la suma de componentes).
          </p>
        </div>
      )}

      {isEdit && (
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <input
            id="isActive"
            type="checkbox"
            disabled={pending}
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
          />
          <Label htmlFor="isActive">Activo</Label>
        </div>
      )}
    </fieldset>
  );
}
