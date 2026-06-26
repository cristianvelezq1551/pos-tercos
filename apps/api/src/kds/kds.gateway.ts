import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  KDS_NAMESPACE,
  KDS_QUEUE_ROOM,
  type KdsEvent,
  type KdsEventName,
  type KitchenOrder,
} from '@pos-tercos/types';
import type { Server, Socket } from 'socket.io';
import { TokenVersionService } from '../auth/token-version/token-version.service';
import { wsCorsOrigin } from '../common/ws-cors';

// CAJERO incluido: necesita el estado de cocina en tiempo real (mismo board
// que el KDS) para gestionar los pedidos cuando el cocinero está ocupado.
const ALLOWED_ROLES = new Set(['COCINERO', 'CAJERO', 'ADMIN_OPERATIVO', 'DUENO']);
const ACCESS_COOKIE = 'pos_access';

@WebSocketGateway({
  namespace: KDS_NAMESPACE,
  cors: { origin: wsCorsOrigin(), credentials: true },
})
export class KdsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(KdsGateway.name);

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
      });
    } catch {
      this.deny(client, 'invalid token');
      return;
    }
    if (!payload.role || !ALLOWED_ROLES.has(payload.role)) {
      this.deny(client, `role ${payload.role ?? 'unknown'} not allowed`);
      return;
    }
    // Revocación de sesión (igual que el JwtAuthGuard HTTP): si el usuario se
    // desactivó / cambió de rol / reseteó password, su `tv` subió y el token —
    // aunque no haya expirado (24h) — queda muerto. Sin esto, un socket abierto
    // sobrevivía hasta la expiración del access.
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
    await client.join(KDS_QUEUE_ROOM);
    this.logger.log(`KDS conn: ${payload.sub} (${payload.role})`);
  }

  handleDisconnect(client: Socket): void {
    if (client.data.userId) {
      this.logger.log(`KDS disconn: ${client.data.userId}`);
    }
  }

  /**
   * Emitir un evento a todos los KDS conectados. Llamado desde KdsService
   * (transitions) y SalesService (al confirmPayment cuando entra al queue).
   */
  emit(event: KdsEventName, sale: KitchenOrder): void {
    // El emit corre DESPUÉS del commit de la transición. Nunca debe tumbar la
    // request: si el server aún no está listo (arranque) o socket.io falla, la
    // venta ya quedó persistida — solo logueamos.
    if (!this.server) return;
    try {
      const payload: KdsEvent = {
        event,
        sale,
        emittedAt: new Date().toISOString(),
      };
      this.server.to(KDS_QUEUE_ROOM).emit(event, payload);
    } catch (err) {
      this.logger.warn(`KDS emit '${event}' falló: ${(err as Error).message}`);
    }
  }

  private extractToken(client: Socket): string | null {
    // 1) authorization header explícito (apps/* en SSR/test)
    const authHeader = client.handshake.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    // 2) auth payload del cliente (socket.io-client opt: { auth: { token } })
    const authToken = client.handshake.auth?.['token'];
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }
    // 3) cookie httpOnly (apps Next.js)
    const cookieHeader = client.handshake.headers['cookie'];
    if (typeof cookieHeader === 'string') {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ACCESS_COOKIE}=([^;]+)`));
      if (match) return decodeURIComponent(match[1]!);
    }
    return null;
  }

  private deny(client: Socket, reason: string): void {
    this.logger.warn(`KDS deny: ${reason}`);
    client.emit('auth.error', { reason });
    client.disconnect(true);
  }
}
