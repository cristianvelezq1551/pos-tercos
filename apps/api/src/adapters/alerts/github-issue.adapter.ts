import { Injectable, Logger } from '@nestjs/common';
import type { AlertChannel, AlertDeliveryResult, SystemAlert } from '@pos-tercos/domain';

const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
/** Etiqueta con la que se agrupan estos avisos, igual que `backup-failure`. */
export const ALERT_LABEL = 'alerta-produccion';
/** Un Issue no es un log: el cuerpo se acota para que siga siendo legible. */
const MAX_BODY = 4_000;
const MAX_TITLE = 180;
const REQUEST_TIMEOUT_MS = 10_000;
/**
 * La lista de Issues de GitHub tarda un par de segundos en reflejar uno recién
 * creado (verificado contra la API real: dos envíos en el mismo segundo
 * abrieron dos Issues; espaciados, el segundo comentó en el primero). El filtro
 * espacia 10 min la misma firma, pero su contador vive en memoria y un redeploy
 * lo borra. Recordar acá lo que este proceso ya abrió tapa esa ventana sin
 * pedirle nada más a la API.
 */
const RECENT_TTL_MS = 30 * 60 * 1000;

/**
 * Avisa por un **Issue de GitHub**, el mismo camino que ya usa el backup
 * nocturno para gritar cuando falla. Se eligió sobre un servicio externo
 * porque no cuesta nada, no agrega dependencias ni peso al navegador, y el
 * correo que manda GitHub es uno que el dueño del repo ya reconoce.
 *
 * Deduplica por título: el mismo error repetido comenta el Issue abierto en
 * vez de abrir uno nuevo. Sin eso, un bug en un endpoint caliente inundaría
 * el repo y el aviso dejaría de significar algo.
 */
@Injectable()
export class GitHubIssueAlertAdapter implements AlertChannel {
  readonly name = 'github_issue';
  readonly delivers = true;

  private readonly logger = new Logger(GitHubIssueAlertAdapter.name);
  /** título → Issue abierto por ESTE proceso, para no depender del índice de GitHub. */
  private readonly recent = new Map<string, { number: number; at: number }>();
  private readonly repo: string;
  private readonly token: string;

  constructor(repo = process.env.ALERT_GITHUB_REPO, token = process.env.ALERT_GITHUB_TOKEN) {
    if (!repo || !token) {
      throw new Error('GitHubIssueAlertAdapter requiere ALERT_GITHUB_REPO y ALERT_GITHUB_TOKEN.');
    }
    this.repo = repo.trim();
    this.token = token.trim();
  }

  async send(alert: SystemAlert): Promise<AlertDeliveryResult> {
    const title = truncate(`[prod] ${alert.signature}`, MAX_TITLE);
    const body = truncate(redactSecrets(alert.body), MAX_BODY);
    try {
      const abierto = await this.findOpenIssue(title);
      if (abierto !== null) {
        await this.request(`/repos/${this.repo}/issues/${abierto}/comments`, { body });
        return { ok: true, delivered: true, ref: `#${abierto}` };
      }
      const creado = await this.request<{ number: number; labels?: unknown[] }>(
        `/repos/${this.repo}/issues`,
        { title, body, labels: [ALERT_LABEL] },
      );
      this.remember(title, creado.number);
      if (!creado.labels?.length) {
        // GitHub DESCARTA las etiquetas en silencio si el token no alcanza. No
        // rompe el deduplicado (la búsqueda por título lo cubre), pero el
        // filtro `label:alerta-produccion` que está en la documentación deja de
        // mostrar nada — y eso sí se nota tarde.
        this.logger.warn(
          `El Issue #${creado.number} quedó SIN la etiqueta '${ALERT_LABEL}': ` +
            'al token le falta el permiso Issues → Read and write.',
        );
      }
      return { ok: true, delivered: true, ref: `#${creado.number}` };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      // Un fallo del canal NO puede tumbar nada: el caller es fire-and-forget
      // y el error ya quedó con su stack en el log del servidor.
      this.logger.warn(`No se pudo abrir el aviso en GitHub: ${error}`);
      return { ok: false, delivered: false, error };
    }
  }

  /**
   * @returns el número del Issue abierto con ese título, o null si no hay.
   *
   * Busca primero entre los etiquetados (barato y acotado). Si no aparece,
   * repasa TODOS los abiertos antes de darse por vencido: si las etiquetas se
   * cayeron por permisos, buscar solo por etiqueta nunca encontraría el hilo
   * previo y cada 500 abriría un Issue nuevo — el repo inundado es peor que no
   * tener aviso, porque deja de leerse.
   */
  private async findOpenIssue(title: string): Promise<number | null> {
    const propio = this.recent.get(title);
    if (propio && Date.now() - propio.at < RECENT_TTL_MS) return propio.number;

    const conEtiqueta = await this.request<Array<{ number: number; title: string }>>(
      `/repos/${this.repo}/issues?state=open&labels=${encodeURIComponent(ALERT_LABEL)}&per_page=100`,
    );
    const match = conEtiqueta.find((i) => i.title === title);
    if (match) return match.number;

    const todos = await this.request<Array<{ number: number; title: string }>>(
      `/repos/${this.repo}/issues?state=open&per_page=100&sort=created&direction=desc`,
    );
    return todos.find((i) => i.title === title)?.number ?? null;
  }

  private async request<T>(path: string, payload?: unknown): Promise<T> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': API_VERSION,
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      // El motivo real viene en el cuerpo ("Resource not accessible by personal
      // access token", "Not Found"): sin él, un token sin permisos y un repo mal
      // escrito se ven igual en el log.
      const motivo = await res
        .json()
        .then((b: unknown) =>
          b && typeof b === 'object' && 'message' in b ? String(b.message) : '',
        )
        .catch(() => '');
      throw new Error(
        `GitHub respondió ${res.status} en ${path.split('?')[0]}${motivo ? `: ${motivo}` : ''}`,
      );
    }
    return (await res.json()) as T;
  }

  private remember(title: string, number: number): void {
    const now = Date.now();
    for (const [k, v] of this.recent) {
      if (now - v.at >= RECENT_TTL_MS) this.recent.delete(k); // el Map no crece
    }
    this.recent.set(title, { number, at: now });
  }
}
function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * Tapa credenciales embebidas en URLs antes de publicarlas. Un error de
 * conexión de Prisma puede traer el DSN completo, y el aviso queda escrito en
 * el repositorio: es el único lugar de este camino donde un secreto podría
 * salir del servidor.
 */
export function redactSecrets(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1***:***@');
}
