import { GitHubIssueAlertAdapter, redactSecrets } from './github-issue.adapter';
import type { SystemAlert } from '@pos-tercos/domain';

const ALERTA: SystemAlert = {
  signature: 'POST /sales/:id/confirm-payment :: boom',
  title: 'Error del sistema',
  body: 'Se rompió el cobro.',
};

describe('GitHubIssueAlertAdapter', () => {
  const fetchMock = jest.fn();
  let adapter: GitHubIssueAlertAdapter;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    adapter = new GitHubIssueAlertAdapter('duenio/repo', 'token-de-prueba');
  });

  const ok = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

  it('abre un Issue nuevo cuando no hay ninguno con esa firma', async () => {
    fetchMock
      .mockResolvedValueOnce(ok([])) // ninguno con la etiqueta
      .mockResolvedValueOnce(ok([])) // ninguno abierto con ese título
      .mockResolvedValueOnce(ok({ number: 42, labels: [{ name: 'alerta-produccion' }] }));

    const res = await adapter.send(ALERTA);

    expect(res).toMatchObject({ ok: true, delivered: true, ref: '#42' });
    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toContain('/repos/duenio/repo/issues');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body)).title).toBe(`[prod] ${ALERTA.signature}`);
  });

  /** El mismo error repetido NO puede inundar el repo: se agrupa en un hilo. */
  it('comenta el Issue abierto cuando el título ya existe', async () => {
    fetchMock
      .mockResolvedValueOnce(ok([{ number: 7, title: `[prod] ${ALERTA.signature}` }]))
      .mockResolvedValueOnce(ok({ id: 1 }));

    const res = await adapter.send(ALERTA);

    expect(res).toMatchObject({ ok: true, ref: '#7' });
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/issues/7/comments');
  });

  /** Un aviso que falla no puede tumbar la request que lo originó. */
  it('no lanza si GitHub responde mal: reporta delivered false', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) });

    const res = await adapter.send(ALERTA);

    expect(res.ok).toBe(false);
    expect(res.delivered).toBe(false);
  });

  /**
   * GitHub descarta las etiquetas en silencio si al token le falta permiso. Si
   * el deduplicado dependiera solo de la etiqueta, cada error abriría un Issue
   * nuevo y el repo quedaría inservible.
   */
  it('encuentra el hilo previo aunque la etiqueta se haya caído', async () => {
    fetchMock
      .mockResolvedValueOnce(ok([])) // nada con la etiqueta
      .mockResolvedValueOnce(ok([{ number: 9, title: `[prod] ${ALERTA.signature}` }])) // sí entre todos
      .mockResolvedValueOnce(ok({ id: 1 }));

    const res = await adapter.send(ALERTA);

    expect(res).toMatchObject({ ok: true, ref: '#9' });
    expect(fetchMock.mock.calls[2]?.[0]).toContain('/issues/9/comments');
  });

  it('el motivo real de GitHub llega al log, no solo el código', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'Resource not accessible by personal access token' }),
    });

    const res = await adapter.send(ALERTA);

    expect(res.error).toContain('Resource not accessible');
  });

  /**
   * Regresión de un fallo VISTO contra la API real: dos envíos seguidos abrían
   * dos Issues, porque la lista de GitHub todavía no reflejaba el primero.
   */
  it('dos avisos seguidos van al MISMO Issue aunque GitHub aún no lo liste', async () => {
    fetchMock
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok({ number: 55, labels: [{ name: 'alerta-produccion' }] }))
      .mockResolvedValueOnce(ok({ id: 1 })); // el comentario del segundo

    const primero = await adapter.send(ALERTA);
    const segundo = await adapter.send(ALERTA);

    expect(primero.ref).toBe('#55');
    expect(segundo.ref).toBe('#55');
    // 3 llamadas del primero + 1 comentario: el segundo NO vuelve a listar.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3]?.[0]).toContain('/issues/55/comments');
  });

  it('exige repo y token: una config a medias no arranca en modo mudo', () => {
    expect(() => new GitHubIssueAlertAdapter('duenio/repo', '')).toThrow(/ALERT_GITHUB/);
  });
});

describe('redactSecrets', () => {
  /** El aviso queda escrito en el repositorio: un DSN no puede viajar entero. */
  it('tapa las credenciales de una URL de conexión', () => {
    expect(redactSecrets("Can't reach postgresql://pos:s3cr3t@host:5432/db")).toBe(
      "Can't reach postgresql://***:***@host:5432/db",
    );
  });

  it('deja intacto un texto sin credenciales', () => {
    expect(redactSecrets('Cannot read properties of undefined')).toBe(
      'Cannot read properties of undefined',
    );
  });
});
