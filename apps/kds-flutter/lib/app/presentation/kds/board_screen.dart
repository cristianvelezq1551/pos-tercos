import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:kds/app/core/di/providers.dart';
import 'package:kds/app/core/theme/app_theme.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_model.dart';
import 'package:kds/app/presentation/kds/board_controller.dart';
import 'package:kds/app/presentation/kds/widgets/order_card.dart';

const _pageSize = 8; // 2 filas × 4 columnas, sin scroll vertical.

class BoardScreen extends ConsumerWidget {
  const BoardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(boardControllerProvider);
    final controller = ref.read(boardControllerProvider.notifier);

    ref.listen<BoardState>(boardControllerProvider, (_, next) {
      if (next is BoardSessionExpired) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (context.mounted) context.go('/login');
        });
      }
    });

    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        titleSpacing: 16,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.badgeCounter,
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text(
                'KDS',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.5,
                ),
              ),
            ),
            const SizedBox(width: 12),
            const Text(
              'Tercos · Cocina',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
            ),
          ],
        ),
        actions: [
          if (state is BoardData && state.stale)
            const Padding(
              padding: EdgeInsets.only(right: 12),
              child: Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.cloud_off_rounded,
                        size: 18, color: AppTheme.warning),
                    SizedBox(width: 6),
                    Text('Reconectando…',
                        style:
                            TextStyle(color: AppTheme.warning, fontSize: 14)),
                  ],
                ),
              ),
            ),
          if (state is BoardData) _OrderCounter(count: state.orders.length),
          const SizedBox(width: 4),
          IconButton(
            icon: const Icon(Icons.menu_book_rounded, color: AppTheme.primary),
            tooltip: 'Biblia de recetas',
            onPressed: () => context.go('/recipe-book'),
          ),
          IconButton(
            icon: const Icon(Icons.precision_manufacturing,
                color: AppTheme.primary),
            tooltip: 'Producir subproductos',
            onPressed: () => context.go('/production'),
          ),
          IconButton(
            icon: const Icon(Icons.power_settings_new, color: AppTheme.error),
            tooltip: 'Cerrar sesión',
            onPressed: () => _confirmLogout(context, ref),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: switch (state) {
        BoardLoading() || BoardSessionExpired() => const Center(
            child: CircularProgressIndicator(),
          ),
        BoardError(:final failure) => _ErrorView(
            message: failure.message,
            onRetry: () => ref.invalidate(boardControllerProvider),
          ),
        BoardData(:final orders) => orders.isEmpty
            ? const _EmptyView()
            : _PaginatedBoard(orders: orders, controller: controller),
      },
    );
  }
}

Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppTheme.surface,
      title: const Text('Cerrar sesión'),
      content: const Text('¿Seguro que querés cerrar la sesión del KDS?'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancelar'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(ctx, true),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.error,
            foregroundColor: Colors.white,
          ),
          child: const Text('Cerrar sesión'),
        ),
      ],
    ),
  );
  if (ok != true) return;
  await ref.read(dioHttpProvider).clearSession();
  ref.read(kdsSocketProvider).disconnect();
  ref.invalidate(boardControllerProvider); // detiene timers + socket del board
  if (context.mounted) context.go('/login');
}

class _OrderCounter extends StatelessWidget {
  const _OrderCounter({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: AppTheme.surfaceVariant,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          '$count ${count == 1 ? 'orden' : 'órdenes'}',
          style: const TextStyle(
            color: AppTheme.textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

class _PaginatedBoard extends StatefulWidget {
  const _PaginatedBoard({required this.orders, required this.controller});

  final List<KitchenOrderModel> orders;
  final BoardController controller;

  @override
  State<_PaginatedBoard> createState() => _PaginatedBoardState();
}

class _PaginatedBoardState extends State<_PaginatedBoard> {
  int _page = 0;

  @override
  Widget build(BuildContext context) {
    final pageCount = math.max(1, (widget.orders.length / _pageSize).ceil());
    final page = _page.clamp(0, pageCount - 1);
    final start = page * _pageSize;
    final end = math.min(start + _pageSize, widget.orders.length);
    final pageOrders = widget.orders.sublist(start, end);

    return Column(
      children: [
        Expanded(child: _grid(pageOrders)),
        if (pageCount > 1) _pagination(page, pageCount),
      ],
    );
  }

  Widget _grid(List<KitchenOrderModel> pageOrders) {
    final top = pageOrders.take(4).toList();
    final bottom =
        pageOrders.length > 4 ? pageOrders.sublist(4) : <KitchenOrderModel>[];
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          Expanded(child: _row(top)),
          const SizedBox(height: 12),
          Expanded(child: _row(bottom)),
        ],
      ),
    );
  }

  Widget _row(List<KitchenOrderModel> items) {
    return Row(
      children: List.generate(4, (i) {
        final order = i < items.length ? items[i] : null;
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(right: i < 3 ? 12 : 0),
            child: order == null
                ? const SizedBox.shrink()
                : OrderCard(
                    key: ValueKey(order.id),
                    order: order,
                    onStart: () => widget.controller.startOrder(order.id),
                    onReady: () => widget.controller.readyOrder(order.id),
                  ),
          ),
        );
      }),
    );
  }

  Widget _pagination(int page, int pageCount) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppTheme.border)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _pageBtn(
            icon: Icons.keyboard_arrow_up,
            label: 'Anteriores',
            enabled: page > 0,
            onTap: () => setState(() => _page = page - 1),
          ),
          Text(
            'Página ${page + 1} de $pageCount',
            style: const TextStyle(
              color: AppTheme.textSecondary,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          _pageBtn(
            icon: Icons.keyboard_arrow_down,
            label: 'Más pedidos',
            enabled: page < pageCount - 1,
            onTap: () => setState(() => _page = page + 1),
          ),
        ],
      ),
    );
  }

  Widget _pageBtn({
    required IconData icon,
    required String label,
    required bool enabled,
    required VoidCallback onTap,
  }) {
    return ElevatedButton.icon(
      onPressed: enabled ? onTap : null,
      icon: Icon(icon),
      label: Text(label),
      style: ElevatedButton.styleFrom(
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
        disabledBackgroundColor: AppTheme.surfaceVariant,
        disabledForegroundColor: AppTheme.textMuted,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_circle_outline, size: 72, color: AppTheme.textMuted),
          SizedBox(height: 16),
          Text(
            'Sin órdenes pendientes',
            style: TextStyle(
              color: AppTheme.textSecondary,
              fontSize: 22,
              fontWeight: FontWeight.w600,
            ),
          ),
          SizedBox(height: 6),
          Text(
            'Las nuevas órdenes aparecerán aquí automáticamente.',
            style: TextStyle(color: AppTheme.textMuted, fontSize: 15),
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off_rounded, size: 56, color: AppTheme.error),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppTheme.textSecondary,
                fontSize: 16,
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Reintentar'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
