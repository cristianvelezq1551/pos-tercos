import type { CreateProduct, UpdateProduct } from '@pos-tercos/types';
import type { FormState } from './ProductFormTypes';

type DrFields = {
  unitPurchase: string;
  unitStock: string;
  conversionFactor: number;
  thresholdMin: number;
};

/** Result of validating and parsing the form before an API call. */
export type ParsedFormResult =
  | { ok: false; error: string }
  | { ok: true; basePrice: number; comboPriceParsed: number | null; drFields: DrFields | null };

/** Validates form values and parses them into typed values.
 *  Returns an error string if invalid, or the parsed fields if valid. */
export function parseFormValues(form: FormState): ParsedFormResult {
  const basePrice = Number(form.basePrice);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    return { ok: false, error: 'El precio base debe ser un número ≥ 0.' };
  }

  if (form.directResale && form.isCombo) {
    return { ok: false, error: 'Un producto no puede ser direct-resale Y combo a la vez.' };
  }

  let comboPriceParsed: number | null = null;
  if (form.isCombo) {
    const v = Number(form.comboPrice);
    if (!Number.isFinite(v) || v < 0) {
      return { ok: false, error: 'Cuando es combo, el precio del combo debe ser un número ≥ 0.' };
    }
    comboPriceParsed = v;
  }

  let drFields: DrFields | null = null;
  if (form.directResale) {
    const factor = Number(form.conversionFactor);
    const threshold = Number(form.thresholdMin);
    if (!form.unitPurchase.trim()) {
      return { ok: false, error: 'Cuando es reventa directa, "Unidad de compra" es requerido.' };
    }
    if (!form.unitStock.trim()) {
      return { ok: false, error: 'Cuando es reventa directa, "Unidad de stock" es requerido.' };
    }
    if (!Number.isFinite(factor) || factor <= 0) {
      return { ok: false, error: 'Factor de conversión debe ser un número > 0.' };
    }
    if (!Number.isFinite(threshold) || threshold < 0) {
      return { ok: false, error: 'Umbral mínimo debe ser un número ≥ 0.' };
    }
    drFields = {
      unitPurchase: form.unitPurchase.trim(),
      unitStock: form.unitStock.trim(),
      conversionFactor: factor,
      thresholdMin: threshold,
    };
  }

  return { ok: true, basePrice, comboPriceParsed, drFields };
}

/** Builds the UpdateProduct payload from validated form values. */
export function buildUpdatePayload(
  form: FormState,
  basePrice: number,
  comboPriceParsed: number | null,
  drFields: DrFields | null,
  directResaleLocked: boolean,
): UpdateProduct {
  return {
    name: form.name,
    description: form.description || null,
    basePrice,
    category: form.category || null,
    imageUrl: form.imageUrl || null,
    modifiersEnabled: form.modifiersEnabled,
    isCombo: form.isCombo,
    comboPrice: comboPriceParsed,
    isActive: form.isActive,
    ...(directResaleLocked
      ? { thresholdMin: drFields?.thresholdMin ?? 0 }
      : drFields
        ? {
            directResale: true,
            unitPurchase: drFields.unitPurchase,
            unitStock: drFields.unitStock,
            conversionFactor: drFields.conversionFactor,
            thresholdMin: drFields.thresholdMin,
          }
        : { directResale: false }),
  };
}

/** Builds the CreateProduct payload from validated form values. */
export function buildCreatePayload(
  form: FormState,
  basePrice: number,
  comboPriceParsed: number | null,
  drFields: DrFields | null,
): CreateProduct {
  return {
    name: form.name,
    description: form.description || null,
    basePrice,
    category: form.category || null,
    imageUrl: form.imageUrl || null,
    modifiersEnabled: form.modifiersEnabled,
    isCombo: form.isCombo,
    comboPrice: comboPriceParsed,
    ...(drFields
      ? {
          directResale: true,
          unitPurchase: drFields.unitPurchase,
          unitStock: drFields.unitStock,
          conversionFactor: drFields.conversionFactor,
          thresholdMin: drFields.thresholdMin,
        }
      : {}),
  };
}
