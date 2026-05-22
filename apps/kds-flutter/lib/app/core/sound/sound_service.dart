import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_tts/flutter_tts.dart';

/// Sonidos del KDS: campana fuerte (pedido nuevo / recordatorio) + voz (TTS)
/// para el recordatorio de pedidos sin iniciar. Best-effort: cualquier fallo
/// de audio no rompe la app.
class SoundService {
  final AudioPlayer _player = AudioPlayer();
  final FlutterTts _tts = FlutterTts();
  bool _ttsReady = false;

  Future<void> _ensureTts() async {
    if (_ttsReady) return;
    await _tts.setLanguage('es-ES');
    await _tts.setVolume(1.0);
    await _tts.setSpeechRate(0.5);
    await _tts.setPitch(1.0);
    _ttsReady = true;
  }

  /// Campana a volumen máximo (pedido nuevo o recordatorio).
  Future<void> playBell() async {
    try {
      await _player.stop();
      await _player.play(AssetSource('sounds/bell.wav'), volume: 1.0);
    } catch (_) {
      // ignore — sin audio no se rompe el board
    }
  }

  /// Voz: "Pedido número X no ha sido iniciado".
  Future<void> speak(String text) async {
    try {
      await _ensureTts();
      await _tts.stop();
      await _tts.speak(text);
    } catch (_) {
      // ignore
    }
  }

  void dispose() {
    _player.dispose();
    _tts.stop();
  }
}
