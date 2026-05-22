'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@pos-tercos/ui';
import type { Product } from '@pos-tercos/types';
import { listProducts } from '../../products';
import { createPromotion } from '../api';
import { type FormState, validate, buildPayload } from './PromotionFormHelpers';
import { PromotionGeneralSection, PromotionDiscountSection } from './PromotionDiscountSection';
import { PromotionWhenSection } from './PromotionWhenSection';
import { PromotionProductsSection } from './PromotionProductsSection';

const INITIAL_STATE: FormState = {
  name: '',
  type: 'PERCENT_OFF',
  discountPctPercent: '',
  discountFixed: '',
  bogoBuyQty: '1',
  bogoGetQty: '1',
  comboMode: 'pct',
  daysMask: 127,
  timeStart: '00:00',
  timeEnd: '23:59',
  activeFrom: '',
  activeTo: '',
  productIds: new Set(),
};

export function PromotionForm() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [state, setState] = useState<FormState>(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProducts()
      .then((p) => setProducts(p.filter((x) => x.isActive)))
      .catch((e) => setProductsError((e as Error).message));
  }, []);

  const validation = useMemo(() => validate(state), [state]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function toggleDay(mask: number) {
    update('daysMask', state.daysMask ^ mask);
  }

  function toggleProduct(id: string) {
    const next = new Set(state.productIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update('productIds', next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validation.error) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildPayload(state);
      await createPromotion(payload);
      router.push('/promotions');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      <PromotionGeneralSection state={state} onUpdate={update} />

      <PromotionDiscountSection state={state} onUpdate={update} />

      <PromotionWhenSection state={state} onUpdate={update} onToggleDay={toggleDay} />

      <PromotionProductsSection
        products={products}
        productsError={productsError}
        productIds={state.productIds}
        onToggleProduct={toggleProduct}
      />

      {validation.error && state.name.length > 0 && (
        <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-sm text-warning">
          {validation.error}
        </p>
      )}
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting || validation.error !== null}>
          {submitting ? 'Creando…' : 'Crear promoción'}
        </Button>
      </div>
    </form>
  );
}
