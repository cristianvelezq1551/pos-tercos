import { UNIT_LABEL_ERROR, isValidUnitLabel, type CreateProduct, type UpdateProduct } from '@pos-tercos/types';
import type { FormState } from './ProductFormTypes';

type DrFields = {
  unitPurchase: string;
  unitStock: string;
  conversionFactor: number;
  thresholdMin: number;
};

type ParsedSize = { id?: string; name: string; priceModifier: number };
type ParsedExtra = {
  name: string;
  priceDelta: number;
  recipeDelta?: Array<{ childType: 'ingredient' | 'subproduct'; childId: string; quantity: number }>;
};
type ParsedComponent = { productId: string; quantity: number };

export type ParsedFormResult =
  | { ok: false; error: string }
  | {
      ok: true;
      basePrice: number;
      comboPriceParsed: number | null;
      drFields: DrFields | null;
      sizes: ParsedSize[];
      modifiers: ParsedExtra[];
      comboComponents: ParsedComponent[];
    };

export function parseFormValues(form: FormState): ParsedFormResult {
  const basePrice = Number(form.basePrice);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    return { ok: false, error: 'El precio base debe ser un número ≥ 0.' };
  }

  // ---- Variantes (proteína / tamaño) ----
  const sizes: ParsedSize[] = [];
  if (form.kind === 'variants') {
    if (form.sizes.length === 0) {
      return { ok: false, error: 'Un producto con variantes necesita al menos una variante.' };
    }
    for (const s of form.sizes) {
      if (!s.name.trim()) return { ok: false, error: 'Cada variante necesita un nombre.' };
      const abs = Number(s.price);
      if (!Number.isFinite(abs) || abs < 0) {
        return { ok: false, error: `Precio inválido en la variante "${s.name}".` };
      }
      // priceModifier = precio absoluto de la variante − precio base.
      sizes.push({
        ...(s.id ? { id: s.id } : {}),
        name: s.name.trim(),
        priceModifier: abs - basePrice,
      });
    }
  }

  // ---- Extras (modificadores) — simple o con variantes ----
  const modifiers: ParsedExtra[] = [];
  if (form.kind === 'simple' || form.kind === 'variants') {
    for (const m of form.modifiers) {
      if (!m.name.trim()) continue; // filas vacías se ignoran
      const pd = Number(m.priceDelta || 0);
      if (!Number.isFinite(pd)) {
        return { ok: false, error: `Precio inválido en el extra "${m.name}".` };
      }
      const extra: ParsedExtra = { name: m.name.trim(), priceDelta: pd };
      if (m.consumeChildType && m.consumeChildId) {
        const qty = Number(m.consumeQty);
        if (!Number.isFinite(qty) || qty <= 0) {
          return {
            ok: false,
            error: `Cantidad de consumo inválida en el extra "${m.name}" (debe ser > 0).`,
          };
        }
        extra.recipeDelta = [
          { childType: m.consumeChildType, childId: m.consumeChildId, quantity: qty },
        ];
      } else if (m.consumeChildType && !m.consumeChildId) {
        return {
          ok: false,
          error: `Elige qué consume el extra "${m.name}" (o deja el consumo en "No descuenta").`,
        };
      }
      modifiers.push(extra);
    }
  }

  // ---- Combo ----
  let comboPriceParsed: number | null = null;
  const comboComponents: ParsedComponent[] = [];
  if (form.kind === 'combo') {
    const v = Number(form.comboPrice);
    if (!Number.isFinite(v) || v < 0) {
      return { ok: false, error: 'El precio del combo debe ser un número ≥ 0.' };
    }
    comboPriceParsed = v;
    const rows = form.comboComponents.filter((c) => c.productId);
    if (rows.length === 0) {
      return { ok: false, error: 'Un combo necesita al menos un producto componente.' };
    }
    for (const c of rows) {
      const q = Number(c.quantity || 1);
      if (!Number.isInteger(q) || q < 1) {
        return { ok: false, error: 'La cantidad de cada componente debe ser un entero ≥ 1.' };
      }
      comboComponents.push({ productId: c.productId, quantity: q });
    }
  }

  // ---- Bebida / reventa directa ----
  let drFields: DrFields | null = null;
  if (form.kind === 'drink') {
    const factor = Number(form.conversionFactor);
    const threshold = Number(form.thresholdMin);
    if (!form.unitPurchase.trim()) {
      return { ok: false, error: 'En reventa, "Unidad de compra" es requerido.' };
    }
    if (!form.unitStock.trim()) {
      return { ok: false, error: 'En reventa, "Unidad de stock" es requerido.' };
    }
    if (!isValidUnitLabel(form.unitPurchase) || !isValidUnitLabel(form.unitStock)) {
      return { ok: false, error: UNIT_LABEL_ERROR };
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

  return { ok: true, basePrice, comboPriceParsed, drFields, sizes, modifiers, comboComponents };
}

export function buildCreatePayload(
  form: FormState,
  parsed: Extract<ParsedFormResult, { ok: true }>,
): CreateProduct {
  const isCombo = form.kind === 'combo';
  return {
    name: form.name,
    description: form.description || null,
    preparationSteps: form.preparationSteps,
    basePrice: parsed.basePrice,
    // Obligatoria al crear (el selector la exige): sin categoría el
    // producto solo aparecería bajo "Todo" en la caja y en la web.
    category: form.category,
    imageUrl: form.imageUrl || null,
    prepImages: form.prepImages,
    emoji: form.emoji || null,
    modifiersEnabled: parsed.modifiers.length > 0,
    isCombo,
    comboPrice: isCombo ? parsed.comboPriceParsed : null,
    ...(parsed.sizes.length > 0
      ? { sizes: parsed.sizes.map((s) => ({ name: s.name, priceModifier: s.priceModifier })) }
      : {}),
    ...(parsed.modifiers.length > 0 ? { modifiers: parsed.modifiers } : {}),
    ...(isCombo ? { comboComponents: parsed.comboComponents } : {}),
    ...(parsed.drFields
      ? {
          directResale: true,
          unitPurchase: parsed.drFields.unitPurchase,
          unitStock: parsed.drFields.unitStock,
          conversionFactor: parsed.drFields.conversionFactor,
          thresholdMin: parsed.drFields.thresholdMin,
        }
      : {}),
  };
}

/** Solo escalares — variantes/extras/combo se editan vía PUT options/combo. */
export function buildUpdatePayload(
  form: FormState,
  parsed: Extract<ParsedFormResult, { ok: true }>,
  directResaleLocked: boolean,
): UpdateProduct {
  const isCombo = form.kind === 'combo';
  return {
    name: form.name,
    description: form.description || null,
    preparationSteps: form.preparationSteps,
    basePrice: parsed.basePrice,
    category: form.category || null,
    imageUrl: form.imageUrl || null,
    prepImages: form.prepImages,
    emoji: form.emoji || null,
    modifiersEnabled: parsed.modifiers.length > 0,
    isCombo,
    comboPrice: isCombo ? parsed.comboPriceParsed : null,
    isActive: form.isActive,
    ...(directResaleLocked
      ? { thresholdMin: parsed.drFields?.thresholdMin ?? 0 }
      : parsed.drFields
        ? {
            directResale: true,
            unitPurchase: parsed.drFields.unitPurchase,
            unitStock: parsed.drFields.unitStock,
            conversionFactor: parsed.drFields.conversionFactor,
            thresholdMin: parsed.drFields.thresholdMin,
          }
        : { directResale: false }),
  };
}
