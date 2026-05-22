'use client';

import { Clock3 } from 'lucide-react';
import { useEffect, useState } from 'react';

const FORMATTER = new Intl.DateTimeFormat('es-CO', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function format(now: Date): string {
  const parts = FORMATTER.formatToParts(now);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
  const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';
  const ampm = /a/i.test(dayPeriod) ? 'AM' : 'PM';
  return `${hour}:${minute} ${ampm}`;
}

/**
 * Clock arriba-derecha. Spec del .pen webTurno (frame `zbUds`):
 *  - position x=1720, y=24 dentro del lienzo 1920×1080
 *  - cornerRadius 20, padding 10/20, gap 8
 *  - fill #0A0A0A90, background-blur 12
 *  - icon clock-3 lucide #FF3B30, height 22
 *  - texto "2:45 PM" white fontSize 24 weight 700
 */
export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="absolute z-30 flex items-center"
      style={{
        right: '2vw',
        top: '2.4vh',
        gap: 8,
        padding: '10px 20px',
        borderRadius: 20,
        background: 'rgba(10, 10, 10, 0.56)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <Clock3
        size={22}
        strokeWidth={2.5}
        color="#FF3B30"
        style={{
          width: 'clamp(16px, 2.2vh, 22px)',
          height: 'clamp(16px, 2.2vh, 22px)',
        }}
      />
      <span
        className="tabular"
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 'clamp(16px, 2.4vh, 24px)',
          fontWeight: 700,
          color: '#FFFFFF',
          lineHeight: 1,
        }}
      >
        {now ? format(now) : '--:--'}
      </span>
    </div>
  );
}
