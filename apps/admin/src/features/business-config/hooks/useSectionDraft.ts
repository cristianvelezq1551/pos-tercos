'use client';

import type { BusinessConfig, UpdateBusinessConfig } from '@pos-tercos/types';
import { useEffect, useRef, useState } from 'react';
import { logError } from '../../../lib/client-log';
import type { SaveState } from '../components/SectionCard';
import { getErrorMessage } from '../../../lib/errors';

/**
 * Borrador local de una sección + guardado. Cada sección maneja SUS campos y
 * hace un PATCH parcial, así dos secciones no se pisan y el dueño confirma solo
 * lo que tocó.
 */
export function useSectionDraft<T>({
  initial,
  toPatch,
  onSaved,
}: {
  initial: T;
  toPatch: (draft: T) => UpdateBusinessConfig;
  onSaved: (config: BusinessConfig) => void;
}) {
  const [draft, setDraft] = useState<T>(initial);
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const baseline = useRef(JSON.stringify(initial));

  // El server puede normalizar lo enviado (coords deducidas del link de Maps,
  // recortes de Zod) → al recargar la config, el borrador se realinea.
  useEffect(() => {
    const next = JSON.stringify(initial);
    if (next === baseline.current) return;
    baseline.current = next;
    setDraft(initial);
  }, [initial]);

  const dirty = JSON.stringify(draft) !== baseline.current;

  /**
   * Editar limpia el error del intento anterior: dejarlo puesto mientras el
   * dueño corrige el campo se lee como que el error sigue vivo.
   */
  const edit = (next: T) => {
    setDraft(next);
    if (error) {
      setError(null);
      setState('idle');
    }
  };

  const save = async (update: (body: UpdateBusinessConfig) => Promise<BusinessConfig>) => {
    setState('saving');
    setError(null);
    try {
      const config = await update(toPatch(draft));
      baseline.current = JSON.stringify(draft);
      setState('saved');
      onSaved(config);
    } catch (e) {
      logError('web-config.save', e);
      setError(getErrorMessage(e, 'No se pudo guardar.'));
      setState('error');
    }
  };

  return { draft, setDraft: edit, dirty, state, error, save };
}
