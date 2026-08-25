'use client';

import type { BusinessConfig } from '@pos-tercos/types';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { logError } from '../../../lib/client-log';
import { getBusinessConfig } from '../api/client';
import { AboutSection } from './AboutSection';
import { ContactSection } from './ContactSection';
import { PaymentAccountsSection } from './PaymentAccountsSection';
import { RadiusSection } from './RadiusSection';
import { ScheduleSection } from './ScheduleSection';
import { SocialSection } from './SocialSection';
import { getErrorMessage } from '../../../lib/errors';

/**
 * Config de la web del cliente. Todo lo de acá sale por `GET /web-hero/config`
 * y la web lo toma al instante, sin redeploy.
 */
export function WebConfigManager() {
  const [config, setConfig] = useState<BusinessConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBusinessConfig()
      .then(setConfig)
      .catch((e: unknown) => {
        logError('web-config.load', e);
        setError(getErrorMessage(e, 'No se pudo cargar la configuración.'));
      });
  }, []);

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {error}
      </p>
    );
  }

  if (!config) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <ContactSection config={config} onSaved={setConfig} />
      <ScheduleSection config={config} onSaved={setConfig} />
      <RadiusSection config={config} onSaved={setConfig} />
      <PaymentAccountsSection config={config} onSaved={setConfig} />
      <SocialSection config={config} onSaved={setConfig} />
      <AboutSection config={config} onSaved={setConfig} />
    </div>
  );
}
