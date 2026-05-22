import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kds/app/core/theme/app_theme.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_item_model.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_model.dart';

class OrderCard extends StatefulWidget {
  const OrderCard({
    super.key,
    required this.order,
    required this.onStart,
    required this.onReady,
  });

  final KitchenOrderModel order;
  final VoidCallback onStart;
  final VoidCallback onReady;

  @override
  State<OrderCard> createState() => _OrderCardState();
}

class _OrderCardState extends State<OrderCard> {
  late Timer _ticker;
  late Duration _elapsed;

  static const _lateThreshold = Duration(minutes: 10);

  @override
  void initState() {
    super.initState();
    _elapsed = _computeElapsed();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _elapsed = _computeElapsed());
    });
  }

  @override
  void dispose() {
    _ticker.cancel();
    super.dispose();
  }

  Duration _computeElapsed() {
    final ref = widget.order.paidAt ?? widget.order.createdAt;
    return DateTime.now().difference(ref);
  }

  bool get _isLate => _elapsed >= _lateThreshold;

  String _formatElapsed() {
    final m = _elapsed.inMinutes;
    final s = _elapsed.inSeconds % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final isPagado = order.status == KitchenStatus.pagado;
    final isEnPrep = order.status == KitchenStatus.enPreparacion;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: _isLate ? AppTheme.error : AppTheme.border,
          width: _isLate ? 2 : 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header: receipt + timer + type badge
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Receipt number — grande
                Text(
                  '#${order.receiptNumber}',
                  style: TextStyle(
                    fontSize: 36,
                    fontWeight: FontWeight.w800,
                    color:
                        _isLate ? AppTheme.error : AppTheme.textPrimary,
                    height: 1,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Type badge
                      _TypeBadge(type: order.type),
                      const SizedBox(height: 4),
                      // Customer name
                      if (order.customerName != null)
                        Text(
                          order.customerName!,
                          style: const TextStyle(
                            color: AppTheme.textSecondary,
                            fontSize: 13,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                    ],
                  ),
                ),
                // Timer
                _ElapsedBadge(label: _formatElapsed(), isLate: _isLate),
              ],
            ),
            const SizedBox(height: 12),
            const Divider(color: AppTheme.border, height: 1),
            const SizedBox(height: 12),

            // Items list
            ...order.items.map((item) => _ItemRow(item: item)),

            const SizedBox(height: 16),

            // Action button
            if (isPagado)
              ElevatedButton(
                onPressed: widget.onStart,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(56),
                ),
                child: const Text('Iniciar'),
              )
            else if (isEnPrep)
              ElevatedButton(
                onPressed: widget.onReady,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.success,
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(56),
                ),
                child: const Text('Marcar listo'),
              ),
          ],
        ),
      ),
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
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
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
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: isWeb ? AppTheme.warning : AppTheme.textSecondary,
        ),
      ),
    );
  }
}

class _ElapsedBadge extends StatelessWidget {
  const _ElapsedBadge({required this.label, required this.isLate});
  final String label;
  final bool isLate;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: (isLate ? AppTheme.error : AppTheme.surfaceVariant)
            .withValues(alpha: isLate ? 0.2 : 1.0),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isLate ? AppTheme.error : AppTheme.border,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (isLate) ...[
            const Icon(Icons.warning_amber_rounded,
                size: 14, color: AppTheme.error),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: isLate ? AppTheme.error : AppTheme.textSecondary,
              fontFeatures: const [FontFeature.tabularFigures()],
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
    final modNames =
        item.modifiers.map((m) => m.name).join(', ');

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Quantity bubble
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppTheme.surfaceVariant,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              '×${item.quantity}',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
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
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                ),
                if (modNames.isNotEmpty)
                  Text(
                    modNames,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                if (item.notes != null && item.notes!.isNotEmpty)
                  Text(
                    'Nota: ${item.notes}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.warning,
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
