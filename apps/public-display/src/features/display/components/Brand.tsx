/**
 * Branding TERCOS arriba-izquierda. Sizes responsive con `clamp` para que
 * en TV 1080p luzca como el `.pen` (52/13 px) y en pantallas chicas escale
 * proporcional sin desbordar.
 */
export function Brand() {
  return (
    <div
      className="absolute z-30 flex flex-col"
      style={{ left: '2.5vw', top: '3.7vh', gap: 8 }}
    >
      <div
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 'clamp(28px, 4.8vh, 52px)',
          fontWeight: 900,
          letterSpacing: '0.27em',
          color: '#FFFFFF',
          lineHeight: 1,
        }}
      >
        TERCOS
      </div>
      <div
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 'clamp(10px, 1.2vh, 13px)',
          fontWeight: 500,
          letterSpacing: '0.38em',
          color: '#999999',
        }}
      >
        HAMBRE CON CARÁCTER
      </div>
      <div
        style={{
          width: 44,
          height: 3,
          background: '#FF3B30',
          borderRadius: 2,
        }}
      />
    </div>
  );
}
