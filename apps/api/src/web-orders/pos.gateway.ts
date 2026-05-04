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

const ALLOWED_ROLES = new Set(['CAJERO', 'ADMIN_OPERATIVO', 'DUENO']);
const ACCESS_COOKIE = 'pos_access';

@WebSocketGateway({
  namespace: POS_NAMESPACE,
  cors: {
    origin: (_origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) =>
      cb(null, true),
    credentials: true,
  },
})
export class PosGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(PosGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.deny(client, 'no token');
      return;
    }
    let payload: { role?: string; sub?: string };
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
    const payload: WebOrderEvent = {
      event,
      order,
      emittedAt: new Date().toISOString(),
    };
    this.server.to(POS_WEB_ORDERS_ROOM).emit(event, payload);
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
    const cookieHeader = client.handshake.headers['cookie'];
    if (typeof cookieHeader === 'string') {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ACCESS_COOKIE}=([^;]+)`));
      if (match) return decodeURIComponent(match[1]!);
    }
    return null;
  }

  private deny(client: Socket, reason: string): void {
    this.logger.warn(`POS deny: ${reason}`);
    client.emit('auth.error', { reason });
    client.disconnect(true);
  }
}
