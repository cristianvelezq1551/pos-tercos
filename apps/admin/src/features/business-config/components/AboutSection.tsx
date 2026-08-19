'use client';

import type { BusinessConfig, BusinessValue } from '@pos-tercos/types';
import { Button, FormField, IconButton, Input, Textarea } from '@pos-tercos/ui';
import { Flame, Plus, Trash2 } from 'lucide-react';
import { updateBusinessConfig } from '../api/client';
import { useSectionDraft } from '../hooks/useSectionDraft';
import { AboutImagePicker } from './AboutImagePicker';
import { SectionCard } from './SectionCard';

const MAX_VALUES = 6;

/** Textos e imagen de la página "Nosotros". */
export function AboutSection({
  config,
  onSaved,
}: {
  config: BusinessConfig;
  onSaved: (c: BusinessConfig) => void;
}) {
  const { draft, setDraft, dirty, state, error, save } = useSectionDraft({
    initial: {
      aboutHeadline: config.aboutHeadline,
      aboutStory: config.aboutStory,
      aboutValues: config.aboutValues,
    },
    toPatch: (d) => d,
    onSaved,
  });

  const setValue = (i: number, patch: Partial<BusinessValue>) =>
    setDraft({
      ...draft,
      aboutValues: draft.aboutValues.map((v, idx) => (idx === i ? { ...v, ...patch } : v)),
    });

  return (
    <SectionCard
      title="Nosotros"
      description="La historia y los valores de la página “Nosotros” de la web."
      icon={<Flame className="h-4 w-4" strokeWidth={2} />}
      onSave={() => void save(updateBusinessConfig)}
      state={state}
      error={error}
      dirty={dirty}
    >
      <AboutImagePicker imageUrl={config.aboutImageUrl} onSaved={onSaved} />

      <FormField label="Titular" hint="El texto grande. Ej: “Nacimos tercos.”">
        <Input
          value={draft.aboutHeadline}
          onChange={(e) => setDraft({ ...draft, aboutHeadline: e.target.value })}
          placeholder="Nacimos tercos."
        />
      </FormField>

      <FormField label="Historia">
        <Textarea
          value={draft.aboutStory}
          onChange={(e) => setDraft({ ...draft, aboutStory: e.target.value })}
          rows={6}
          placeholder="En 2026 nació Tercos con una idea clara…"
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Valores</h3>
            <p className="text-xs text-muted-foreground">
              Las tarjetas de abajo de la historia. El ícono lo pone la web según la posición.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setDraft({
                ...draft,
                aboutValues: [...draft.aboutValues, { title: '', description: '' }],
              })
            }
            disabled={draft.aboutValues.length >= MAX_VALUES}
          >
            <Plus className="h-4 w-4" /> Agregar valor
          </Button>
        </div>

        {draft.aboutValues.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            Sin valores. La web no muestra esa sección.
          </p>
        ) : (
          <ul className="space-y-3">
            {draft.aboutValues.map((v, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    value={v.title}
                    onChange={(e) => setValue(i, { title: e.target.value })}
                    placeholder="Fuego Real"
                    aria-label={`Título del valor ${i + 1}`}
                  />
                  <Textarea
                    value={v.description}
                    onChange={(e) => setValue(i, { description: e.target.value })}
                    rows={2}
                    placeholder="Creamos combinaciones intensas y diferentes…"
                    aria-label={`Descripción del valor ${i + 1}`}
                  />
                </div>
                <IconButton
                  aria-label="Quitar valor"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      aboutValues: draft.aboutValues.filter((_, idx) => idx !== i),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
