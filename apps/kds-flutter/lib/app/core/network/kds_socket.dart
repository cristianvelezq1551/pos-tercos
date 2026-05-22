import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:kds/app/core/config/app_config.dart';
import 'package:kds/app/core/constants/endpoints.dart';

/// Cliente socket.io del namespace `/ws/kds`. En cada evento del backend
/// (`order.created` / `order.status.changed`) invoca [onChange] para que el
/// board recargue la cola. socket.io maneja la reconexión automática.
///
/// Auth por handshake `{ token }` (la cookie httpOnly no viaja cross-origin
/// desde la tablet, igual que en el KDS web).
class KdsSocket {
  io.Socket? _socket;

  void connect({required String token, required void Function() onChange}) {
    disconnect();
    final socket = io.io(
      '${AppConfig.wsUrl}${Endpoints.kdsWsNamespace}',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .build(),
    );
    socket.on('order.created', (_) => onChange());
    socket.on('order.status.changed', (_) => onChange());
    _socket = socket;
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
