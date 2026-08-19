import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  POS_NAMESPACE,
  POS_WEB_ORDERS_ROOM,
  type PublicWebOrder,
  type WebOrderEvent,
  type WebOrderEventName,
} from '@pos-tercos/types';
import type { Server, Socket } from 'socket.io';
import { TokenVersionService } from '../auth/token-version/token-version.service';
import { wsCorsOrigin } from '../common/ws-cors';

const ALLOWED_ROLES = new Set(['CAJERO', 'ADMIN_OPERATIVO', 'DUENO']);

@WebSocketGateway({
  namespace: POS_NAMESPACE,
  cors: { origin: wsCorsOrigin(), credentials: true },
})
export class PosGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(PosGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly tokenVersions: TokenVersionService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.deny(client, 'no token');
      return;
    }
    let payload: { role?: string; sub?: string; tv?: number };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET,
        algorithms: ['HS256'],
      });
    } catch {
      this.deny(client, 'invalid token');
      return;
    }
    if (!payload.role || !ALLOWED_ROLES.has(payload.role)) {
      this.deny(client, `role ${payload.role ?? 'unknown'} not allowed`);
      return;
    }
    // Revocación de sesión (igual que el JwtAuthGuard HTTP): un socket abierto
    // con token de usuario dado de baja / con rol cambiado debe cortarse, no
    // sobrevivir hasta la expiración del access (24h).
    if (!payload.sub) {
      this.deny(client, 'no sub');
      return;
    }
    const currentVersion = await this.tokenVersions.current(payload.sub);
    if ((payload.tv ?? 0) !== currentVersion) {
      this.deny(client, 'session revoked');
      return;
    }
    client.data.userId = payload.sub;
    client.data.role = payload.role;
    await client.join(POS_WEB_ORDERS_ROOM);
    this.logger.log(`POS conn: ${payload.sub} (${payload.role})`);
  }

  handleDisconnect(client: Socket): void {
    if (client.data.userId) {
      this.logger.log(`POS disconn: ${client.data.userId}`);
    }
  }

  /** Emite evento a todos los POS conectados en la room pos.web-orders. */
  emit(event: WebOrderEventName, order: PublicWebOrder): void {
    // Corre DESPUÉS del commit: nunca debe tumbar la request (el caller es
    // fire-and-forget). Si el server no está listo o socket.io falla, logueamos.
    if (!this.server) return;
    try {
      const payload: WebOrderEvent = {
        event,
        order,
        emittedAt: new Date().toISOString(),
      };
      this.server.to(POS_WEB_ORDERS_ROOM).emit(event, payload);
    } catch (err) {
      this.logger.warn(`POS emit '${event}' falló: ${(err as Error).message}`);
    }
  }

  private extractToken(client: Socket): string | null {
    const authHeader = client.handshake.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    const authToken = client.handshake.auth?.['token'];
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }
    // Sin fallback de cookie: la cookie `pos_access` era del POS standalone
    // (cutover §7.v10+) y el handshake real siempre viaja por auth.token
    // (ws-token de 120s) o Bearer. Una vía de auth que nadie usa es una vía
    // que nadie prueba.
    return null;
  }

  private deny(client: Socket, reason: string): void {
    this.logger.warn(`POS deny: ${reason}`);
    client.emit('auth.error', { reason });
    client.disconnect(true);
  }
}
