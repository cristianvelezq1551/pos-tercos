'use client';

import { cn } from '@pos-tercos/ui';
import { Clock, MapPin, MessageCircle, Phone } from 'lucide-react';
import { useState } from 'react';
import { formatDayRanges, todayKey } from '../lib/hours-text';
import { mapEmbedUrl, mapsUrl, telUrl, whatsappUrl } from '../lib/contact-links';
import { useBusiness } from '../store/business-store';
import { DirectionsMenu } from './DirectionsMenu';
import { HoursModal } from './HoursModal';

/** Ficha del local: datos, mapa y acciones. Todo sale de la config del dueño. */
export function LocationCard() {
  const business = useBusiness((s) => s.business);
  const [hoursOpen, setHoursOpen] = useState(false);
  const { contact, schedule } = business;

  const embed = mapEmbedUrl(contact);
  const maps = mapsUrl(contact);
  const wa = whatsappUrl(contact);
  const tel = telUrl(contact);

  return (
    <article className="reveal-up card-lift overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold tracking-[0.02em] text-foreground sm:text-2xl">
            TERCOS Envigado
          </h2>
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-bold',
              schedule.isOpenNow
                ? 'bg-emerald-500/15 text-emerald-500'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {schedule.isOpenNow ? 'Abierto ahora' : 'Cerrado ahora'}
          </span>
        </div>

        <ul className="flex flex-col gap-2.5">
          {contact.address ? (
            <DetailRow icon={<MapPin className="h-4 w-4" strokeWidth={2} />}>
              {maps ? (
                <a
                  href={maps}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-foreground"
                >
                  {contact.address}
                </a>
              ) : (
                contact.address
              )}
            </DetailRow>
          ) : null}
          {tel ? (
            <DetailRow icon={<Phone className="h-4 w-4" strokeWidth={2} />}>
              <a href={tel} className="transition-colors hover:text-foreground">
                {contact.phoneDisplay || contact.phone}
              </a>
            </DetailRow>
          ) : null}
          <DetailRow icon={<Clock className="h-4 w-4" strokeWidth={2} />}>
            <button
              type="button"
              onClick={() => setHoursOpen(true)}
              className="text-left underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Hoy: {formatDayRanges(schedule.hours.weekly[todayKey()])} · ver toda la semana
            </button>
          </DetailRow>
        </ul>

        {embed ? <MapEmbed src={embed} href={maps} /> : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DirectionsMenu />
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              aria-label="Escribir por WhatsApp"
              className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-6 text-sm font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20 active:bg-emerald-500/25"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={2.25} />
              WhatsApp
            </a>
          ) : null}
          {tel ? (
            <a
              href={tel}
              aria-label="Llamar al local"
              className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-muted px-6 text-sm font-semibold text-foreground transition-colors hover:bg-ink-700"
            >
              <Phone className="h-4 w-4" strokeWidth={2.25} />
              Llamar
            </a>
          ) : null}
        </div>
      </div>

      <HoursModal open={hoursOpen} onClose={() => setHoursOpen(false)} />
    </article>
  );
}

function MapEmbed({ src, href }: { src: string; href: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border">
      <iframe
        title="Mapa del local"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src={src}
        className="h-56 w-full border-0 grayscale-[0.35] contrast-[1.05]"
      />
      {/* Capa encima: tocar el mapa abre Maps en vez de atrapar el scroll del móvil. */}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label="Abrir en Google Maps"
          className="absolute inset-0"
        />
      ) : null}
    </div>
  );
}

function DetailRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-sm text-muted-foreground">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        {icon}
      </span>
      <span className="leading-snug">{children}</span>
    </li>
  );
}
