import { PromotionTypeEnum } from '@pos-tercos/types';
import { Section, Field, inputClass, labelFor, descriptionFor, type FormState } from './PromotionFormHelpers';

interface PromotionDiscountSectionProps {
  state: FormState;
  onUpdate: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

export function PromotionGeneralSection({ state, onUpdate }: PromotionDiscountSectionProps) {
  return (
    <Section title="Información general">
      <Field label="Nombre" required>
        <input
          type="text"
          required
          value={state.name}
          maxLength={120}
          onChange={(e) => onUpdate('name', e.target.value)}
          placeholder="Ej. 20% off Hamburguesa Nashville lunes a jueves"
          className={inputClass}
        />
      </Field>

      <Field label="Tipo" required>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PromotionTypeEnum.options.map((t) => (
            <label
              key={t}
              className={`cursor-pointer rounded-md border px-3 py-2 text-center text-sm ${
                state.type === t
                  ? 'border-primary bg-destructive/10 text-primary font-semibold'
                  : 'border-border bg-card text-foreground hover:bg-muted/40'
              }`}
            >
              <input
                type="radio"
                name="type"
                className="sr-only"
                value={t}
                checked={state.type === t}
                onChange={() => onUpdate('type', t)}
              />
              {labelFor(t)}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{descriptionFor(state.type)}</p>
      </Field>
    </Section>
  );
}

export function PromotionDiscountSection({ state, onUpdate }: PromotionDiscountSectionProps) {
  return (
    <Section title="Descuento">
      {state.type === 'PERCENT_OFF' && (
        <Field label="Porcentaje (1-99)" required>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={99}
              step={1}
              required
              value={state.discountPctPercent}
              onChange={(e) => onUpdate('discountPctPercent', e.target.value)}
              className={`${inputClass} max-w-[120px]`}
              placeholder="20"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </Field>
      )}

      {state.type === 'FIXED_OFF' && (
        <Field label="Monto en COP" required>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number"
              min={1}
              step={1}
              required
              value={state.discountFixed}
              onChange={(e) => onUpdate('discountFixed', e.target.value)}
              className={`${inputClass} max-w-[200px]`}
              placeholder="2000"
            />
          </div>
        </Field>
      )}

      {state.type === 'BOGO' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Compra (paid)" required>
            <input
              type="number"
              min={1}
              step={1}
              required
              value={state.bogoBuyQty}
              onChange={(e) => onUpdate('bogoBuyQty', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Lleva gratis" required>
            <input
              type="number"
              min={1}
              step={1}
              required
              value={state.bogoGetQty}
              onChange={(e) => onUpdate('bogoGetQty', e.target.value)}
              className={inputClass}
            />
          </Field>
          <p className="col-span-2 text-xs text-muted-foreground">
            Cada vez que el cliente compre {state.bogoBuyQty || '?'} unidades, se le
            regalan {state.bogoGetQty || '?'}. Solo aplica si la línea tiene al menos{' '}
            {Number(state.bogoBuyQty || 0) + Number(state.bogoGetQty || 0)} unidades.
          </p>
        </div>
      )}

      {state.type === 'COMBO_OFF' && (
        <>
          <Field label="Tipo de descuento" required>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={state.comboMode === 'pct'}
                  onChange={() => onUpdate('comboMode', 'pct')}
                />
                Porcentaje
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={state.comboMode === 'fixed'}
                  onChange={() => onUpdate('comboMode', 'fixed')}
                />
                Monto fijo
              </label>
            </div>
          </Field>
          {state.comboMode === 'pct' ? (
            <Field label="Porcentaje (1-99)" required>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={99}
                  step={1}
                  required
                  value={state.discountPctPercent}
                  onChange={(e) => onUpdate('discountPctPercent', e.target.value)}
                  className={`${inputClass} max-w-[120px]`}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </Field>
          ) : (
            <Field label="Monto en COP" required>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={state.discountFixed}
                  onChange={(e) => onUpdate('discountFixed', e.target.value)}
                  className={`${inputClass} max-w-[200px]`}
                />
              </div>
            </Field>
          )}
          <p className="text-xs text-muted-foreground">
            COMBO_OFF solo aplica cuando el producto vendido es un combo (Product.isCombo).
          </p>
        </>
      )}
    </Section>
  );
}
