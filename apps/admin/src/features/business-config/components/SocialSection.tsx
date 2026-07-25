'use client';

import type { BusinessConfig } from '@pos-tercos/types';
import { FormField, Input } from '@pos-tercos/ui';
import { Share2 } from 'lucide-react';
import { updateBusinessConfig } from '../api/client';
import { useSectionDraft } from '../hooks/useSectionDraft';
import { SectionCard } from './SectionCard';

/** Redes del footer. Vacío = el link no se muestra (nunca manda a la home de la red). */
export function SocialSection({
  config,
  onSaved,
}: {
  config: BusinessConfig;
  onSaved: (c: BusinessConfig) => void;
}) {
  const { draft, setDraft, dirty, state, error, save } = useSectionDraft({
    initial: { instagramUrl: config.instagramUrl, tiktokUrl: config.tiktokUrl },
    toPatch: (d) => d,
    onSaved,
  });

  return (
    <SectionCard
      title="Redes sociales"
      description="Aparecen en el pie de la web. Si dejas una vacía, no se muestra."
      icon={<Share2 className="h-4 w-4" strokeWidth={2} />}
      onSave={() => void save(updateBusinessConfig)}
      state={state}
      error={error}
      dirty={dirty}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Instagram">
          <Input
            value={draft.instagramUrl}
            onChange={(e) => setDraft({ ...draft, instagramUrl: e.target.value.trim() })}
            placeholder="https://instagram.com/tercos"
            inputMode="url"
          />
        </FormField>
        <FormField label="TikTok">
          <Input
            value={draft.tiktokUrl}
            onChange={(e) => setDraft({ ...draft, tiktokUrl: e.target.value.trim() })}
            placeholder="https://tiktok.com/@tercos"
            inputMode="url"
          />
        </FormField>
      </div>
    </SectionCard>
  );
}
