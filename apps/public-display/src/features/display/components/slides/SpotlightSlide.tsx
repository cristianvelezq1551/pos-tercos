import { Beef, Flame, Leaf } from 'lucide-react';

const FEATURES = [
  { icon: Flame, label: 'Parrilla con carbón' },
  { icon: Beef, label: 'Carne 100% premium' },
  { icon: Leaf, label: 'Ingredientes frescos' },
] as const;

export function SpotlightSlide() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-bg-dark">
      <img
        src="/broll/hamburguesaTercos.png"
        alt="Doble Smash Burger"
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute inset-0 h-full w-full select-none object-cover"
      />

      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.25) 35%, rgba(10,10,10,0.12) 50%, rgba(10,10,10,0.4) 70%, rgba(10,10,10,0.92) 100%)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: 'min(48%, 820px)',
          background:
            'linear-gradient(90deg, rgba(10,10,10,0.88) 0%, rgba(10,10,10,0.55) 50%, transparent 100%)',
        }}
        aria-hidden="true"
      />

      <div
        className="absolute flex max-w-[700px] flex-col"
        style={{
          left: 'clamp(32px, 4vw, 80px)',
          top: '32%',
          gap: 'clamp(12px, 1.9vh, 20px)',
          width: 'min(40%, 700px)',
        }}
      >
        <div
          className="self-start rounded uppercase text-text-white"
          style={{
            background: '#FF3B30',
            padding: '6px 14px',
            fontSize: 'clamp(10px, 1.1vh, 11px)',
            fontWeight: 800,
            letterSpacing: '0.27em',
          }}
        >
          ★ Producto Estrella
        </div>

        <div
          className="font-black text-text-white"
          style={{
            fontSize: 'clamp(48px, 8vh, 84px)',
            fontWeight: 900,
            lineHeight: 0.95,
            letterSpacing: '0.025em',
          }}
        >
          Doble Smash
          <br />
          Burger
        </div>

        <div
          className="text-text-muted"
          style={{
            fontSize: 'clamp(14px, 1.9vh, 20px)',
            fontWeight: 400,
            lineHeight: 1.6,
          }}
        >
          Dos carnes smash de 120g, queso cheddar fundido, cebolla
          caramelizada, salsa especial TERCOS y pan brioche artesanal tostado a
          la plancha.
        </div>

        <div className="flex items-end" style={{ gap: 16 }}>
          <span
            className="text-text-white tabular"
            style={{
              fontSize: 'clamp(40px, 6vh, 64px)',
              fontWeight: 900,
              lineHeight: 1,
            }}
          >
            $24.900
          </span>
          <span
            className="text-text-dim"
            style={{
              fontSize: 'clamp(14px, 2vh, 22px)',
              fontWeight: 600,
              letterSpacing: '0.18em',
              paddingBottom: 8,
            }}
          >
            COP
          </span>
        </div>
      </div>

      <div
        className="absolute flex items-center"
        style={{
          left: 'clamp(32px, 4vw, 80px)',
          bottom: 'clamp(32px, 5vh, 56px)',
          gap: 'clamp(20px, 3vw, 48px)',
        }}
      >
        {FEATURES.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center" style={{ gap: 12 }}>
            <Icon
              size={22}
              strokeWidth={2}
              className="text-accent"
              style={{
                width: 'clamp(16px, 2vh, 22px)',
                height: 'clamp(16px, 2vh, 22px)',
              }}
            />
            <span
              className="text-text-dim"
              style={{
                fontSize: 'clamp(12px, 1.5vh, 16px)',
                fontWeight: 500,
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 h-1"
        style={{
          background:
            'linear-gradient(90deg, #FF3B30 0%, #FFB800 50%, #FF3B30 100%)',
        }}
      />
    </div>
  );
}
