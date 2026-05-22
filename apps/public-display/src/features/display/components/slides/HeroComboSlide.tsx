/**
 * Vista 1 — Hero Combo. Layout fluid: bg full-bleed + promoPill centrado +
 * bottom bar con 4 cards. Sizes con `clamp` para que escalen del viewport.
 */

interface PromoCard {
  name: string;
  price: string;
  image: string;
  highlight?: boolean;
}

const PROMO_CARDS: PromoCard[] = [
  {
    name: 'Combo Terco',
    price: '$32.900',
    image: '/broll/hamburguesaTercos.png',
  },
  {
    name: 'Mega Burger',
    price: '$36.900',
    image: '/broll/hamburguesaClasica.png',
  },
  {
    name: '2x1 Alitas',
    price: '$22.900',
    image: '/broll/polloColeslaw.png',
    highlight: true,
  },
  {
    name: 'Nachos Locos',
    price: '$18.500',
    image: '/broll/burritoCarne.png',
  },
];

export function HeroComboSlide() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-bg-dark">
      <img
        src="/broll/hamburguesaTercos.png"
        alt="Combo Terco Especial"
        loading="eager"
        decoding="async"
        draggable={false}
        className="absolute inset-0 h-full w-full select-none object-cover"
      />

      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.33) 30%, rgba(10,10,10,0.13) 45%, rgba(10,10,10,0.13) 55%, rgba(10,10,10,0.33) 70%, rgba(10,10,10,0.92) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Promo pill centrado */}
      <div
        className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
        style={{
          top: '34%',
          padding: 'clamp(20px, 2.6vh, 28px) clamp(32px, 4vw, 56px)',
          gap: 10,
          background: 'rgba(10, 10, 10, 0.5)',
          borderRadius: 40,
          boxShadow: '0 0 80px rgba(255, 59, 48, 0.25)',
          maxWidth: '70vw',
        }}
      >
        <div
          style={{
            color: '#FF3B30',
            fontFamily: 'Inter, sans-serif',
            fontSize: 'clamp(13px, 1.5vh, 16px)',
            fontWeight: 700,
            letterSpacing: 4,
          }}
        >
          ¡NUEVO!
        </div>
        <div
          style={{
            color: '#FFFFFF',
            fontFamily: 'Inter, sans-serif',
            fontSize: 'clamp(28px, 4.8vh, 52px)',
            fontWeight: 800,
            letterSpacing: 3,
            lineHeight: 1,
            textAlign: 'center',
          }}
        >
          COMBO TERCO ESPECIAL
        </div>
        <div
          style={{
            color: '#999999',
            fontFamily: 'Inter, sans-serif',
            fontSize: 'clamp(14px, 1.7vh, 18px)',
            fontWeight: 400,
            textAlign: 'center',
          }}
        >
          La hamburguesa que no pide perdón
        </div>
      </div>

      {/* Bottom bar 4 cards */}
      <div
        className="absolute left-0 right-0 flex items-center justify-around"
        style={{
          bottom: 0,
          height: 'clamp(110px, 13vh, 140px)',
          padding: 'clamp(12px, 1.5vh, 16px) clamp(16px, 3vw, 32px)',
          gap: 'clamp(12px, 1.5vw, 20px)',
          background: 'rgba(10, 10, 10, 0.85)',
          borderTop: '1px solid rgba(255, 59, 48, 0.19)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        {PROMO_CARDS.map((card) => (
          <div
            key={card.name}
            className="flex flex-1 items-center"
            style={{ gap: 'clamp(8px, 1vw, 12px)', minWidth: 0 }}
          >
            <div
              style={{
                width: 'clamp(70px, 9vh, 100px)',
                height: 'clamp(70px, 9vh, 100px)',
                borderRadius: 12,
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <img
                src={card.image}
                alt={card.name}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="h-full w-full select-none object-cover"
              />
            </div>
            <div
              className="flex flex-col"
              style={{ gap: 6, minWidth: 0 }}
            >
              <span
                className="truncate"
                style={{
                  color: '#FFFFFF',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 'clamp(13px, 1.5vh, 15px)',
                  fontWeight: 600,
                }}
              >
                {card.name}
              </span>
              <span
                className="self-start tabular"
                style={{
                  background: card.highlight ? '#FFB800' : '#FF3B30',
                  color: '#FFFFFF',
                  padding: '4px 14px',
                  borderRadius: 20,
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 'clamp(11px, 1.3vh, 13px)',
                  fontWeight: 800,
                }}
              >
                {card.price}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
