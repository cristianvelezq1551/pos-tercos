'use client';

import { MapPin, MessageCircle, Phone } from 'lucide-react';
import Link from 'next/link';
import { mapsUrl, telUrl, useBusiness, whatsappUrl } from '../features/business';

/**
 * Pie con contacto y redes. Todo sale de la config del dueño (`/web-hero/config`):
 * si un dato no está cargado, su link simplemente no se muestra — nunca se manda
 * al cliente a una página genérica ni a un `tel:` vacío.
 */
export function WebFooter() {
  const business = useBusiness((s) => s.business);
  const { contact, social } = business;

  const links = [
    { label: 'WhatsApp', href: whatsappUrl(contact), icon: MessageCircle, external: true },
    { label: contact.phoneDisplay || contact.phone, href: telUrl(contact), icon: Phone, external: false },
    { label: 'Cómo llegar', href: mapsUrl(contact), icon: MapPin, external: true },
  ].filter((l): l is { label: string; href: string; icon: typeof Phone; external: boolean } =>
    Boolean(l.href && l.label),
  );

  const socials = [
    { label: 'Instagram', url: social.instagram },
    { label: 'TikTok', url: social.tiktok },
  ].filter((s): s is { label: string; url: string } => Boolean(s.url));

  return (
    // pb extra en móvil: la barra de navegación flota fija sobre el contenido
    // (62px + safe-area) y tapaba la última línea del pie. En `md` la barra no
    // existe y el padding vuelve a lo normal.
    <footer className="flex flex-col gap-4 border-t border-border bg-[#111111] px-6 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-sm text-muted-foreground sm:px-12 md:pb-5 lg:px-20">
      {links.length > 0 ? (
        <nav className="flex flex-wrap items-center gap-x-6">
          {links.map(({ label, href, icon: Icon, external }) => (
            <a
              key={label}
              href={href}
              {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
              // 44 px de alto: son los enlaces que alguien toca DESDE el
              // teléfono (llamar, escribir, abrir el mapa) y medían 20.
              className="inline-flex min-h-11 items-center gap-2 font-medium transition-colors hover:text-foreground"
            >
              <span className="text-primary">
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
              {label}
            </a>
          ))}
        </nav>
      ) : null}

      <div
        className={
          links.length > 0
            ? 'flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4'
            : 'flex flex-wrap items-center justify-between gap-3'
        }
      >
        <p>© {new Date().getFullYear()} TERCOS · Envigado</p>
        {socials.length > 0 ? (
          <nav className="flex items-center gap-6">
            {socials.map((s) => (
              <Link
                key={s.label}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center font-medium transition-colors hover:text-foreground"
              >
                {s.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </footer>
  );
}
