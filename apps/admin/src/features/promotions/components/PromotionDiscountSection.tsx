import { MoneyInput } from '@pos-tercos/ui';
import { PromotionTypeEnum } from '@pos-tercos/types';
import {
  Section,
  Field,
  inputClass,
  labelFor,
  descriptionFor,
  CHANNEL_OPTIONS,
  type FormState,
} from './PromotionFormHelpers';

interface PromotionDiscountSectionProps {
  state: FormState;
  onUpdate: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  /** En edición, el tipo de promo y el descuento son inmutables. */
  locked?: boolean;
}

export function PromotionGeneralSection({ state, onUpdate, locked = false }: PromotionDiscountSectionProps) {
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
          {PromotionTypeEnum.options.map((t) => {
            const active = state.type === t;
            const disabledStyle = locked && !active ? 'opacity-40' : '';
            return (
              <label
                key={t}
                className={`rounded-md border px-3 py-2 text-center text-sm ${
                  locked ? 'cursor-not-allowed' : 'cursor-pointer'
                } ${
                  active
                    ? 'border-primary bg-destructive/10 text-primary font-semibold'
                    : 'border-border bg-card text-foreground hover:bg-muted/40'
                } ${disabledStyle}`}
              >
                <input
                  type="radio"
                  name="type"
                  className="sr-only"
                  value={t}
                  checked={active}
                  disabled={locked}
                  onChange={() => onUpdate('type', t)}
                />
                {labelFor(t)}
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{descriptionFor(state.type)}</p>
        {locked ? (
          <p className="mt-1 text-xs text-muted-foreground italic">
            El tipo no se puede cambiar. Para usar otro tipo, desactiva esta promo y crea una nueva.
          </p>
        ) : null}
      </Field>

      <Field label="Dónde aplica" required>
        <div className="grid grid-cols-3 gap-2">
          {CHANNEL_OPTIONS.map((opt) => {
            const active = state.channel === opt.value;
            return (
              <label
                key={opt.value}
                className={`cursor-pointer rounded-md border px-3 py-2 text-center text-sm ${
                  active
                    ? 'border-primary bg-destructive/10 text-primary font-semibold'
                    : 'border-border bg-card text-foreground hover:bg-muted/40'
                }`}
              >
                <input
                  type="radio"
                  name="channel"
                  className="sr-only"
                  value={opt.value}
                  checked={active}
                  onChange={() => onUpdate('channel', opt.value)}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {CHANNEL_OPTIONS.find((o) => o.value === state.channel)?.description}
        </p>
      </Field>
    </Section>
  );
}

export function PromotionDiscountSection({ state, onUpdate, locked = false }: PromotionDiscountSectionProps) {
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
              disabled={locked}
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
          <MoneyInput
            required
            disabled={locked}
            value={state.discountFixed}
            onChange={(v) => onUpdate('discountFixed', v)}
            className="max-w-[200px]"
            placeholder="2.000"
          />
        </Field>
      )}

      {state.type === 'BOGO' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Compra (paga)" required>
            <input
              type="number"
              min={1}
              step={1}
              required
              disabled={locked}
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
              disabled={locked}
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
                  disabled={locked}
                  onChange={() => onUpdate('comboMode', 'pct')}
                />
                Porcentaje
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={state.comboMode === 'fixed'}
                  disabled={locked}
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
                  disabled={locked}
                  value={state.discountPctPercent}
                  onChange={(e) => onUpdate('discountPctPercent', e.target.value)}
                  className={`${inputClass} max-w-[120px]`}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </Field>
          ) : (
            <Field label="Monto en COP" required>
              <MoneyInput
                required
                disabled={locked}
                value={state.discountFixed}
                onChange={(v) => onUpdate('discountFixed', v)}
                className="max-w-[200px]"
                placeholder="2.000"
              />
            </Field>
          )}
          <p className="text-xs text-muted-foreground">
            El descuento de combo solo aplica cuando el producto vendido es un combo.
          </p>
        </>
      )}
      {locked ? (
        <p className="text-xs text-muted-foreground italic">
          El descuento no se puede cambiar una vez creada la promo. Para modificarlo, desactiva esta
          promo y crea una nueva.
        </p>
      ) : null}
    </Section>
  );
}
