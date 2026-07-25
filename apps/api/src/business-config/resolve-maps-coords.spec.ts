/**
 * El dueño pega un link de Google Maps y el server sale a la red a seguirlo.
 * Ese "salir a la red con una URL que vino de un input" es el patrón clásico
 * de SSRF: sin allowlist, el server hace requests a donde le digan (metadata
 * de la nube, servicios internos). Estos tests fijan el allowlist en su lugar,
 * en los DOS saltos: el link que se pega y el destino final del redirect.
 */

import { resolveMapsCoords } from './resolve-maps-coords';

describe('resolveMapsCoords', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  /** fetch de mentira que responde con una URL final dada. */
  const mockFetchResolvingTo = (finalUrl: string): jest.Mock => {
    const spy = jest.fn().mockResolvedValue({ url: finalUrl });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  };

  it('saca las coordenadas del link largo sin salir a la red', async () => {
    const spy = mockFetchResolvingTo('irrelevante');
    const coords = await resolveMapsCoords(
      'https://www.google.com/maps/place/Tercos/@6.2447,-75.5748,17z',
    );
    expect(coords).toBe('6.2447,-75.5748');
    expect(spy).not.toHaveBeenCalled();
  });

  it('prefiere el pin real (!3d/!4d) sobre el centro del mapa (@)', async () => {
    const coords = await resolveMapsCoords(
      'https://www.google.com/maps/place/X/@6.1,-75.1,17z/data=!3d6.2447!4d-75.5748',
    );
    expect(coords).toBe('6.2447,-75.5748');
  });

  it('sigue el link corto de Maps y toma las coordenadas del destino', async () => {
    mockFetchResolvingTo('https://www.google.com/maps/place/Tercos/@6.2447,-75.5748,17z');
    expect(await resolveMapsCoords('https://maps.app.goo.gl/abc123')).toBe('6.2447,-75.5748');
  });

  describe('SSRF', () => {
    it.each([
      ['un host cualquiera', 'https://evil.example.com/@1.0,2.0'],
      ['metadata de la nube', 'http://169.254.169.254/latest/meta-data/@1.0,2.0'],
      ['localhost', 'http://localhost:3001/admin/@1.0,2.0'],
      ['red interna', 'http://10.0.0.5/@1.0,2.0'],
      ['un subdominio que "contiene" google', 'https://google.com.evil.io/@1.0,2.0'],
      ['file://', 'file:///etc/passwd'],
    ])('no sale a la red contra %s', async (_caso, url) => {
      const spy = mockFetchResolvingTo('irrelevante');
      expect(await resolveMapsCoords(url)).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    });

    it('descarta el resultado si el REDIRECT termina fuera de Google', async () => {
      // El primer salto es legítimo, pero el acortador redirige a otro host:
      // sin revalidar el destino, tomaríamos por buenas esas coordenadas.
      mockFetchResolvingTo('https://evil.example.com/@6.2447,-75.5748,17z');
      expect(await resolveMapsCoords('https://maps.app.goo.gl/abc123')).toBeNull();
    });

    it('descarta un redirect a una IP interna', async () => {
      mockFetchResolvingTo('http://169.254.169.254/@6.2447,-75.5748,17z');
      expect(await resolveMapsCoords('https://maps.app.goo.gl/abc123')).toBeNull();
    });
  });

  describe('entradas rotas', () => {
    it.each([
      ['vacía', ''],
      ['solo espacios', '   '],
      ['no es una URL', 'esto no es un link'],
    ])('devuelve null con %s', async (_caso, url) => {
      expect(await resolveMapsCoords(url)).toBeNull();
    });

    it('devuelve null (no lanza) si la red falla — el dueño carga a mano', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ETIMEDOUT')) as unknown as typeof fetch;
      expect(await resolveMapsCoords('https://maps.app.goo.gl/abc123')).toBeNull();
    });

    it('devuelve null si el destino no trae coordenadas', async () => {
      mockFetchResolvingTo('https://www.google.com/maps/search/pizza');
      expect(await resolveMapsCoords('https://maps.app.goo.gl/abc123')).toBeNull();
    });
  });
});
