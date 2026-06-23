'use client';

import { FormField, Textarea } from '@pos-tercos/ui';
import { useState } from 'react';

/**
 * Editor de "paso a paso" de preparación: un paso por línea. Mantiene el texto
 * crudo localmente (permite líneas en blanco mientras se escribe) y publica al
 * padre la lista ya limpia (sin vacíos). Se muestra numerado en la biblia del KDS.
 */
export function PreparationStepsField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (steps: string[]) => void;
}) {
  const [text, setText] = useState(() => value.join('\n'));

  return (
    <FormField
      label="Pasos de preparación"
      hint="Un paso por línea. Se muestran numerados en la biblia del KDS (el cocinero los consulta en la tablet)."
    >
      <Textarea
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(
            e.target.value
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
          );
        }}
        placeholder={'Dorar la carne 80g en plancha caliente, 90s por lado\nTostar el pan brioche con mantequilla\nArmar: pan, salsa, carne, cheddar, tocineta\nServir de inmediato'}
      />
    </FormField>
  );
}
