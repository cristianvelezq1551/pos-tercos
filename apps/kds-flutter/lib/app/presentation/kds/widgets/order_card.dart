import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/core/theme/app_theme.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_item_model.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_model.dart';
import 'package:kds/app/presentation/kds/board_controller.dart';

/// Severidad por tiempo transcurrido (afecta color del container + cronómetro).
enum _Tone { ok, warn, late }

_Tone _toneFor(KitchenStatus status, Duration elapsed) {
  final m = elapsed.inMinutes;
  // PAGADO sin iniciar > 3 min = urgente (rojo), aunque lleve poco tiempo total.
  if (status == KitchenStatus.pagado && m >= 3) return _Tone.late;
  if (m >= 10) return _Tone.late;
  if (m >= 7) return _Tone.warn;
  return _Tone.ok;
}

Color _toneColor(_Tone t) => switch (t) {
      _Tone.ok => AppTheme.success,
      _Tone.warn => AppTheme.warning,
      _Tone.late => AppTheme.error,
    };

class OrderCard extends ConsumerStatefulWidget {
  const OrderCard({
    super.key,
    required this.order,
    required this.onStart,
    required this.onReady,
  });

  final KitchenOrderModel order;
  final Future<Failure?> Function() onStart;
  final Future<Failure?> Function() onReady;

  @override
  ConsumerState<OrderCard> createState() => _OrderCardState();
}

class _OrderCardState extends ConsumerState<OrderCard>
    with SingleTickerProviderStateMixin {
  bool _busy = false;
  late final AnimationController _pulse;
  final ScrollController _itemsScroll = ScrollController();
  bool _autoScrolling = false;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 750),
    );
  }

  @override
  void dispose() {
    _pulse.dispose();
    _itemsScroll.dispose();
    super.dispose();
  }

  Future<void> _run(Future<Failure?> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    final failure = await action();
    if (!mounted) return;
    setState(() => _busy = false);
    if (failure != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(mapFailureToView(failure).message),
          backgroundColor: AppTheme.error,
        ),
      );
    }
  }

  String _formatElapsed(Duration d) {
    final m = d.inMinutes.toString().padLeft(2, '0');
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  /// Auto-scroll en loop si los ítems no caben (pedido grande) — el cocinero
  /// ve todo sin tocar la tablet.
  void _maybeAutoScroll() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _autoScrolling || !_itemsScroll.hasClients) return;
      if (_itemsScroll.position.maxScrollExtent <= 0) return;
      _autoScrolling = true;
      unawaited(_autoScrollLoop());
    });
  }

  Future<void> _autoScrollLoop() async {
    while (mounted &&
        _itemsScroll.hasClients &&
        _itemsScroll.position.maxScrollExtent > 0) {
      final max = _itemsScroll.position.maxScrollExtent;
      final ms = (max * 30).clamp(2500, 9000).toInt();
      await _itemsScroll.animateTo(max,
          duration: Duration(milliseconds: ms), curve: Curves.linear);
      if (!mounted) break;
      await Future.delayed(const Duration(milliseconds: 1800));
      if (!mounted || !_itemsScroll.hasClients) break;
      await _itemsScroll.animateTo(0,
          duration: const Duration(milliseconds: 1200), curve: Curves.easeInOut);
      if (!mounted) break;
      await Future.delayed(const Duration(milliseconds: 1800));
    }
    _autoScrolling = false;
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final now = ref.watch(nowProvider);
    final since = order.paidAt ?? order.createdAt;
    final elapsed = now.difference(since);
    final tone = _toneFor(order.status, elapsed);
    final toneColor = _toneColor(tone);
    final isPagado = order.status == KitchenStatus.pagado;
    final isEnPrep = order.status == KitchenStatus.enPreparacion;
    // Número de TURNO (lo que se le canta al cliente); fallback al recibo.
    final turno = order.turnNumber ?? order.receiptNumber;
    // Etiqueta de urgencia cuando el pedido está atrasado.
    final lateLabel = tone != _Tone.late
        ? null
        : isPagado
            ? 'SIN INICIAR'
            : isEnPrep
                ? 'DEMORADO'
                : null;

    // Pulso solo cuando hay alerta (warn/late). En verde, estático.
    if (tone == _Tone.ok) {
      if (_pulse.isAnimating) _pulse.stop();
    } else if (!_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    }

    _maybeAutoScroll();

    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) {
        final glow = tone == _Tone.ok ? 0.0 : 0.25 + 0.55 * _pulse.value;
        return Container(
          decoration: BoxDecoration(
            color: AppTheme.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: tone == _Tone.ok ? AppTheme.border : toneColor,
              width: tone == _Tone.ok ? 1 : 3,
            ),
            boxShadow: tone == _Tone.ok
                ? null
                : [
                    BoxShadow(
                      color: toneColor.withValues(alpha: glow),
                      blurRadius: 14,
                      spreadRadius: 1,
                    ),
                  ],
          ),
          child: child,
        );
      },
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'TURNO',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.5,
                        color: (tone == _Tone.ok
                                ? AppTheme.textMuted
                                : toneColor)
                            .withValues(alpha: 0.9),
                      ),
                    ),
                    Text(
                      '$turno',
                      style: TextStyle(
                        fontSize: 44,
                        fontWeight: FontWeight.w800,
                        color: tone == _Tone.ok ? AppTheme.textPrimary : toneColor,
                        height: 1,
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _TypeBadge(type: order.type),
                      if (lateLabel != null) ...[
                        const SizedBox(height: 4),
                        _UrgencyBadge(label: lateLabel, color: toneColor),
                      ],
                      if (order.customerName != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          order.customerName!,
                          style: const TextStyle(
                            color: AppTheme.textSecondary,
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
                ),
                _ElapsedBadge(label: _formatElapsed(elapsed), color: toneColor),
              ],
            ),
            const SizedBox(height: 10),
            Divider(color: AppTheme.border.withValues(alpha: 0.6), height: 1),
            const SizedBox(height: 10),

            if (order.notes != null && order.notes!.trim().isNotEmpty) ...[
              _OrderNote(text: order.notes!.trim()),
              const SizedBox(height: 10),
            ],

            // Ítems — scroll interno + auto-scroll si son muchos.
            Expanded(
              child: ListView(
                controller: _itemsScroll,
                padding: EdgeInsets.zero,
                children: [
                  for (final item in order.items) _ItemRow(item: item),
                ],
              ),
            ),

            const SizedBox(height: 12),

            if (isPagado)
              _ActionButton(
                label: 'Iniciar',
                color: AppTheme.primary,
                busy: _busy,
                onTap: () => _run(widget.onStart),
              )
            else if (isEnPrep)
              _ActionButton(
                label: 'Marcar listo',
                color: AppTheme.success,
                busy: _busy,
                onTap: () => _run(widget.onReady),
              ),
          ],
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.color,
    required this.busy,
    required this.onTap,
  });

  final String label;
  final Color color;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: busy ? null : onTap,
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(60),
        textStyle: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
      ),
      child: busy
          ? const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                valueColor: AlwaysStoppedAnimation(Colors.white),
              ),
            )
          : Text(label),
    );
  }
}

class _TypeBadge extends StatelessWidget {
  const _TypeBadge({required this.type});
  final OrderType type;

  @override
  Widget build(BuildContext context) {
    final isWeb = type == OrderType.webPickup;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: (isWeb ? AppTheme.warning : AppTheme.surfaceVariant)
            .withValues(alpha: 0.25),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: (isWeb ? AppTheme.warning : AppTheme.border)
              .withValues(alpha: 0.6),
        ),
      ),
      child: Text(
        type.label,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: isWeb ? AppTheme.warning : AppTheme.textSecondary,
        ),
      ),
    );
  }
}

/// Etiqueta de urgencia ("SIN INICIAR" / "DEMORADO") para pedidos atrasados.
class _UrgencyBadge extends StatelessWidget {
  const _UrgencyBadge({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.warning_amber_rounded, size: 14, color: Colors.white),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w900,
              color: Colors.white,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _ElapsedBadge extends StatelessWidget {
  const _ElapsedBadge({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w800,
          color: color,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

class _OrderNote extends StatelessWidget {
  const _OrderNote({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.warning.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppTheme.warning.withValues(alpha: 0.6)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.sticky_note_2_outlined,
              size: 20, color: AppTheme.warning),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppTheme.warning,
                height: 1.25,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item});
  final KitchenOrderItemModel item;

  @override
  Widget build(BuildContext context) {
    final modNames = item.modifiers.map((m) => m.name).join(', ');

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppTheme.surfaceVariant,
              borderRadius: BorderRadius.circular(7),
            ),
            child: Text(
              '×${item.quantity}',
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.sizeName != null
                      ? '${item.productName} (${item.sizeName})'
                      : item.productName,
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textPrimary,
                    height: 1.2,
                  ),
                ),
                if (modNames.isNotEmpty)
                  Text(
                    modNames,
                    style: const TextStyle(
                      fontSize: 15,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                if (item.notes != null && item.notes!.isNotEmpty)
                  Text(
                    'Nota: ${item.notes}',
                    style: const TextStyle(
                      fontSize: 15,
                      color: AppTheme.warning,
                      fontWeight: FontWeight.w600,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
