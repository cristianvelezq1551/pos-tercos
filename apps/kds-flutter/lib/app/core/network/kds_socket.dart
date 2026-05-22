import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:kds/app/core/config/app_config.dart';
import 'package:kds/app/core/constants/endpoints.dart';

/// Cliente socket.io del namespace `/ws/kds`. En cada evento del backend
/// (`order.created` / `order.status.changed`) invoca [onChange] para que el
/// board recargue la cola. socket.io maneja la reconexión automática.
///
/// Auth por handshake `{ token }` (la cookie httpOnly no viaja cross-origin
/// desde la tablet, igual que en el KDS web).
///
/// Cuando el access token vence, el gateway responde `auth.error` y corta.
/// Ahí pedimos un token fresco vía [onAuthError] (refresh) y reconectamos con
/// él; si el refresh falla (refresh token vencido/rotado), avisamos por
/// [onSessionExpired] para que la UI mande a /login.
class KdsSocket {
  io.Socket? _socket;
  bool _handlingAuthError = false;

  void connect({
    required String token,
    required void Function() onChange,
    required Future<String?> Function() onAuthError,
    required void Function() onSessionExpired,
  }) {
    disconnect();
    final socket = io.io(
      '${AppConfig.wsUrl}${Endpoints.kdsWsNamespace}',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          // Reconexión agresiva e infinita: el socket es la base del KDS y no
          // puede quedarse caído.
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(5000)
          .build(),
    );
    // Resincroniza al (re)conectar — incl. tras refrescar el token.
    socket.on('connect', (_) => onChange());
    socket.on('order.created', (_) => onChange());
    socket.on('order.status.changed', (_) => onChange());
    socket.onDisconnect((reason) {
      // socket.io NO reintenta solo cuando el server inicia el corte (ej.
      // redeploy del API → 'io server disconnect'). El caso auth.error ya lo
      // maneja su handler (con _handlingAuthError); el resto lo forzamos.
      if (_handlingAuthError) return;
      if (reason == 'io server disconnect') {
        Future.delayed(const Duration(seconds: 2), () {
          if (_socket == socket) socket.connect();
        });
      }
    });
    socket.on('auth.error', (_) async {
      // Evita tormenta de refrescos si el auto-reconnect dispara varios
      // auth.error seguidos con el token viejo.
      if (_handlingAuthError) return;
      _handlingAuthError = true;
      try {
        final fresh = await onAuthError();
        if (_socket == null) return; // se hizo disconnect mientras tanto
        if (fresh != null) {
          socket.auth = {'token': fresh};
          socket.connect();
        } else {
          disconnect();
          onSessionExpired();
        }
      } finally {
        _handlingAuthError = false;
      }
    });
    _socket = socket;
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
