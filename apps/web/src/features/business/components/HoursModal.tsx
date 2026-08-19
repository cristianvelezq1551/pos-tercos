'use client';

import { cn } from '@pos-tercos/ui';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useBusiness } from '../store/business-store';
import {
  WEEKDAY_LABELS,
  WEEK_ORDER,
  formatDayRanges,
  formatNextOpen,
  todayKey,
} from '../lib/hours-text';

/** Los horarios de la semana, con hoy resaltado. */
export function HoursModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const business = useBusiness((s) => s.business);
  const { hours, isOpenNow, nextOpenAt } = business.schedule;

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

  const today = todayKey();
  const next = formatNextOpen(nextOpenAt);

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm motion-safe:animate-[fadeIn_120ms_ease-out] sm:items-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hours-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl border-t border-border bg-card p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-2xl sm:rounded-2xl sm:border sm:pb-5"
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="hours-title" className="text-lg font-bold text-foreground">
              Horarios
            </h2>
            <p
              className={cn(
                'mt-0.5 text-sm font-semibold',
                isOpenNow ? 'text-emerald-500' : 'text-muted-foreground',
              )}
            >
              {isOpenNow ? 'Abierto ahora' : next ? `Cerrado · abre ${next}` : 'Cerrado'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-ink-700"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </header>

        <ul className="divide-y divide-border rounded-xl border border-border">
          {WEEK_ORDER.map((day) => {
            const ranges = hours.weekly[day];
            const isToday = day === today;
            return (
              <li
                key={day}
                className={cn(
                  'flex items-center justify-between gap-3 px-3 py-2.5',
                  isToday && 'bg-muted/50',
                )}
              >
                <span
                  className={cn(
                    'text-sm',
                    isToday ? 'font-bold text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {WEEKDAY_LABELS[day]}
                  {isToday ? ' · hoy' : ''}
                </span>
                <span
                  className={cn(
                    'text-sm tabular-nums',
                    ranges.length === 0
                      ? 'text-muted-foreground'
                      : isToday
                        ? 'font-semibold text-foreground'
                        : 'text-foreground',
                  )}
                >
                  {formatDayRanges(ranges)}
                </span>
              </li>
            );
          })}
        </ul>

        <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
      </div>
    </div>
  );
}
