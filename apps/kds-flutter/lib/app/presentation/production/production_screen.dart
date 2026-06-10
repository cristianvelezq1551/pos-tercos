import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:kds/app/core/theme/app_theme.dart';
import 'package:kds/app/domain/models/production/producible_subproduct_model.dart';
import 'package:kds/app/presentation/production/production_controller.dart';

/// Pantalla de producción de subproductos. Lista los activos con su stock
/// actual; tap a uno abre el diálogo para registrar una tanda.
class ProductionScreen extends ConsumerWidget {
  const ProductionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(productionControllerProvider);

    ref.listen<ProductionState>(productionControllerProvider, (_, next) {
      if (next is ProductionSessionExpired) context.go('/login');
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tercos · Producción'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Volver a Cocina',
          onPressed: () => context.go('/board'),
        ),
        actions: [
          IconButton(
            tooltip: 'Refrescar',
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(productionControllerProvider.notifier).refresh(),
          ),
        ],
      ),
      body: _body(state, ref),
    );
  }

  Widget _body(ProductionState state, WidgetRef ref) {
    return switch (state) {
      ProductionLoading() => const Center(
          child: CircularProgressIndicator(color: AppTheme.primary),
        ),
      ProductionFatal(:final failure) => _ErrorView(
          message: failure.message,
          onRetry: () =>
              ref.read(productionControllerProvider.notifier).refresh(),
        ),
      ProductionSessionExpired() => const SizedBox.shrink(),
      ProductionData(:final subproducts, :final stale) => _List(
          subproducts: subproducts,
          stale: stale,
        ),
    };
  }
}

class _List extends ConsumerWidget {
  const _List({required this.subproducts, required this.stale});

  final List<ProducibleSubproductModel> subproducts;
  final bool stale;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (subproducts.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'No hay subproductos activos para producir.\n'
            'Pedile al dueño que active alguno en el admin.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 16),
          ),
        ),
      );
    }
    return RefreshIndicator(
      color: AppTheme.primary,
      onRefresh: () =>
          ref.read(productionControllerProvider.notifier).refresh(),
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: subproducts.length + (stale ? 1 : 0),
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, i) {
          if (stale && i == 0) return const _StaleBanner();
          final sub = subproducts[i - (stale ? 1 : 0)];
          return _SubproductCard(sub: sub);
        },
      ),
    );
  }
}

class _StaleBanner extends StatelessWidget {
  const _StaleBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.warning.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppTheme.warning.withValues(alpha: 0.5)),
      ),
      child: const Row(
        children: [
          Icon(Icons.wifi_off, color: AppTheme.warning, size: 18),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'Datos viejos — no se pudo refrescar. Tirá hacia abajo para reintentar.',
              style: TextStyle(color: AppTheme.textPrimary, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

class _SubproductCard extends ConsumerWidget {
  const _SubproductCard({required this.sub});

  final ProducibleSubproductModel sub;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final low = sub.isLowStock;
    return Card(
      child: InkWell(
        onTap: () => _openDialog(context, ref),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            sub.name,
                            style: const TextStyle(
                              color: AppTheme.textPrimary,
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (low) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: AppTheme.warning,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text(
                              'BAJO',
                              style: TextStyle(
                                color: Colors.black,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        const Text('Stock: ',
                            style:
                                TextStyle(color: AppTheme.textSecondary, fontSize: 14)),
                        Text(
                          _fmt(sub.currentStock),
                          style: TextStyle(
                            color: low ? AppTheme.warning : AppTheme.success,
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                        Text(' ${sub.unit}',
                            style: const TextStyle(
                                color: AppTheme.textSecondary, fontSize: 14)),
                        if (sub.thresholdMin > 0) ...[
                          const SizedBox(width: 12),
                          Text(
                            '· umbral ${_fmt(sub.thresholdMin)}',
                            style: const TextStyle(
                                color: AppTheme.textMuted, fontSize: 12),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: AppTheme.primary,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.add, color: Colors.white, size: 20),
                    SizedBox(width: 6),
                    Text(
                      'PRODUCIR',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openDialog(BuildContext context, WidgetRef ref) async {
    await showDialog<void>(
      context: context,
      builder: (_) => _ProduceDialog(sub: sub),
    );
  }
}

class _ProduceDialog extends ConsumerStatefulWidget {
  const _ProduceDialog({required this.sub});

  final ProducibleSubproductModel sub;

  @override
  ConsumerState<_ProduceDialog> createState() => _ProduceDialogState();
}

class _ProduceDialogState extends ConsumerState<_ProduceDialog> {
  final _qtyCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  bool _submitting = false;
  String? _error;
  late final String _idempotencyKey;

  @override
  void initState() {
    super.initState();
    // Idempotency-key local: si el cocinero da doble-tap o se reintenta por
    // red, el backend devuelve la misma tanda en vez de crearla 2 veces.
    _idempotencyKey =
        'prod-${DateTime.now().millisecondsSinceEpoch}-${widget.sub.id.substring(0, 8)}';
  }

  @override
  void dispose() {
    _qtyCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final qty = double.tryParse(_qtyCtrl.text.replaceAll(',', '.'));
    if (qty == null || qty <= 0) {
      setState(() => _error = 'Ingresá una cantidad mayor a 0.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final result =
        await ref.read(productionControllerProvider.notifier).produce(
              subproductId: widget.sub.id,
              quantityProduced: qty,
              notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
              idempotencyKey: _idempotencyKey,
            );
    if (!mounted) return;
    if (result.failure != null) {
      setState(() {
        _submitting = false;
        _error = result.failure!.toString().contains('ApiFailure')
            ? (result.failure! as dynamic).message as String
            : 'No se pudo registrar la producción. Reintentá.';
      });
      // Mejor: usar mapFailureToView, pero el message ya viene desde el backend
      // (con el detalle del stock faltante en caso de 409).
      return;
    }
    if (result.run != null) {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.success,
          content: Text(
            'Registrado: ${result.run!.subproductName} × ${_fmt(result.run!.quantityProduced)}',
            style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w600),
          ),
          duration: const Duration(seconds: 3),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.sub;
    final qtyNum = double.tryParse(_qtyCtrl.text.replaceAll(',', '.')) ?? 0.0;
    final double preparations =
        qtyNum > 0 && s.yield > 0 ? qtyNum / s.yield : 0.0;

    return AlertDialog(
      backgroundColor: AppTheme.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      title: Text('Producir ${s.name}',
          style:
              const TextStyle(color: AppTheme.textPrimary, fontSize: 18)),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Stock actual: ${_fmt(s.currentStock)} ${s.unit}'
              '${s.yield != 1 ? '  ·  receta rinde ${_fmt(s.yield)} ${s.unit}' : ''}',
              style:
                  const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _qtyCtrl,
              autofocus: true,
              enabled: !_submitting,
              keyboardType: const TextInputType.numberWithOptions(
                  decimal: true, signed: false),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
              ],
              decoration: InputDecoration(
                labelText: 'Cantidad producida (${s.unit})',
                hintText: '50',
              ),
              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 18),
              onChanged: (_) => setState(() {}),
            ),
            if (preparations > 0) ...[
              const SizedBox(height: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'Equivale a ${_fmt(preparations)} '
                  '${preparations == 1 ? 'preparación' : 'preparaciones'} de la receta.',
                  style: const TextStyle(
                      color: AppTheme.textPrimary, fontSize: 13),
                ),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _notesCtrl,
              enabled: !_submitting,
              maxLength: 200,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Notas (opcional)',
                hintText: 'Ej. tanda de la mañana',
              ),
              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: AppTheme.error.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                  border:
                      Border.all(color: AppTheme.error.withValues(alpha: 0.5)),
                ),
                child: Text(
                  _error!,
                  style:
                      const TextStyle(color: AppTheme.error, fontSize: 13),
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancelar',
              style: TextStyle(color: AppTheme.textSecondary)),
        ),
        ElevatedButton(
          onPressed: _submitting ? null : _submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primary,
            minimumSize: const Size(140, 44),
          ),
          child: Text(_submitting ? 'Registrando…' : 'Confirmar'),
        ),
      ],
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
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: AppTheme.error, size: 48),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 15),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: onRetry,
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
    );
  }
}

String _fmt(double n) {
  // Hasta 2 decimales, sin ceros sobrantes.
  if (n == n.roundToDouble()) return n.toStringAsFixed(0);
  return n.toStringAsFixed(2).replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '');
}
