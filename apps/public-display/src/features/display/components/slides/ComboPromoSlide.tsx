/**
 * Vista 3 — Combo Promo. Layout fluid: contenido a la izquierda + hero
 * image derecha + bottom strip con otros combos.
 */

interface OtherCombo {
  name: string;
  desc: string;
  price: string;
}

const OTHER_COMBOS: OtherCombo[] = [
  {
    name: 'COMBO CLÁSICO',
    desc: 'Hamburguesa + Papas + Gaseosa',
    price: '$28.900',
  },
  {
    name: 'COMBO DOBLE',
    desc: 'Doble Smash + Papas + Bebida',
    price: '$38.500',
  },
  {
    name: 'COMBO FAMILIAR',
    desc: '2 Hamburguesas + 2 Papas + 2 Bebidas',
    price: '$54.900',
  },
];

export function ComboPromoSlide() {
  return (
    <div className="absolute inset-0 flex flex-col bg-bg-dark">
      {/* Top zone: hero + content */}
      <div className="relative flex-1 overflow-hidden">
        {/* Hero image (derecha) */}
        <img
          src="/broll/hamburguesaTercos.png"
          alt="Combo Terco Especial"
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-cover"
        />

        {/* Gradient overlay horizontal para legibilidad del texto */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, #0A0A0A 0%, rgba(10,10,10,0.92) 28%, rgba(10,10,10,0.55) 50%, rgba(10,10,10,0.18) 70%, transparent 100%)',
          }}
          aria-hidden="true"
        />

        {/* Left content */}
        <div
          className="absolute flex flex-col justify-center"
          style={{
            top: 0,
            bottom: 0,
            left: 0,
            width: 'min(40%, 750px)',
            padding: 'clamp(40px, 6vh, 80px)',
            gap: 'clamp(10px, 1.5vh, 16px)',
          }}
        >
          <div
            className="font-bold uppercase"
            style={{
              color: '#FF3B30',
              fontSize: 'clamp(13px, 1.6vh, 16px)',
              fontWeight: 700,
              letterSpacing: '0.4em',
            }}
          >
            Combo del día
          </div>

          <div
            className="font-black uppercase text-text-white"
            style={{
              fontSize: 'clamp(40px, 6.7vh, 76px)',
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: '-0.01em',
            }}
          >
            COMBO TERCO
            <br />
            ESPECIAL
          </div>

          <div
            style={{
              width: 60,
              height: 3,
              background: '#FF3B30',
              borderRadius: 2,
            }}
          />

          <div
            className="text-text-muted"
            style={{
              fontSize: 'clamp(15px, 1.9vh, 20px)',
              fontWeight: 400,
            }}
          >
            Hamburguesa Doble + Papas + Bebida
          </div>

          <div
            className="flex items-end"
            style={{ gap: 'clamp(12px, 1.5vw, 20px)' }}
          >
            <span
              className="text-text-dim line-through tabular"
              style={{
                fontSize: 'clamp(20px, 2.6vh, 28px)',
                fontWeight: 500,
              }}
            >
              $42.000
            </span>
            <span
              className="text-accent-gold tabular"
              style={{
                fontSize: 'clamp(40px, 5.9vh, 64px)',
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              $32.900
            </span>
          </div>

          <div
            className="self-start rounded-3xl bg-accent"
            style={{
              padding: 'clamp(8px, 1.1vh, 12px) clamp(20px, 2.5vw, 32px)',
            }}
          >
            <span
              className="font-extrabold uppercase text-text-white"
              style={{
                fontSize: 'clamp(13px, 1.5vh, 16px)',
                fontWeight: 800,
                letterSpacing: '0.12em',
              }}
            >
              Ahorra $9.100
            </span>
          </div>
        </div>
      </div>

      {/* Accent line */}
      <div className="h-[3px] bg-accent" />

      {/* Bottom strip — otros combos */}
      <div
        className="flex items-center"
        style={{
          height: 'clamp(150px, 18.5vh, 199px)',
          padding: 'clamp(20px, 3.7vh, 40px) clamp(20px, 3vw, 30px)',
          gap: 'clamp(12px, 1.5vw, 20px)',
          background: '#111111',
          flexShrink: 0,
        }}
      >
        <div
          className="shrink-0 uppercase text-text-muted"
          style={{
            fontSize: 'clamp(11px, 1.3vh, 14px)',
            fontWeight: 800,
            letterSpacing: '0.21em',
            lineHeight: 1.3,
            width: 80,
          }}
        >
          Otros
          <br />
          combos
        </div>

        {OTHER_COMBOS.map((combo) => (
          <div
            key={combo.name}
            className="flex h-full flex-1 flex-col justify-center rounded-[10px] bg-bg-card"
            style={{
              padding: 'clamp(12px, 1.6vh, 16px)',
              gap: 6,
              minWidth: 0,
            }}
          >
            <div
              className="font-bold uppercase text-text-white truncate"
              style={{
                fontSize: 'clamp(11px, 1.3vh, 13px)',
                fontWeight: 700,
                letterSpacing: '0.08em',
              }}
            >
              {combo.name}
            </div>
            <div
              className="text-text-muted truncate"
              style={{ fontSize: 'clamp(10px, 1.1vh, 11px)' }}
            >
              {combo.desc}
            </div>
            <div
              className="text-accent-gold tabular"
              style={{
                fontSize: 'clamp(18px, 2.3vh, 22px)',
                fontWeight: 800,
              }}
            >
              {combo.price}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
