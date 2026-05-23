'use client';

import { Info, MapPin, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

const LINKS = [
  {
    href: '/nosotros',
    label: 'Nosotros',
    description: 'Conocé nuestra historia',
    icon: Info,
  },
  {
    href: '/ubicaciones',
    label: 'Ubicaciones',
    description: 'Encuéntranos en Envigado',
    icon: MapPin,
  },
] as const;

export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm motion-safe:animate-[fadeIn_120ms_ease-out] md:hidden"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Más opciones"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col gap-3 rounded-t-3xl border-t border-border bg-card p-5 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl motion-safe:animate-[slideUp_200ms_ease-out]"
      >
        <header className="flex items-center justify-between pb-1">
          <span className="h-1 w-12 rounded-full bg-border" aria-hidden />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-ink-700"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </header>

        <ul className="flex flex-col gap-2">
          {LINKS.map(({ href, label, description, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={onClose}
                className="flex items-center gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:bg-muted"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-bold text-foreground">{label}</span>
                  <span className="text-xs text-muted-foreground">{description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </div>
  );
}
