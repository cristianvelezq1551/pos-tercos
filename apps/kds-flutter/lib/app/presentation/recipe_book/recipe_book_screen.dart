import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:kds/app/core/theme/app_theme.dart';
import 'package:kds/app/domain/models/recipe_book/recipe_book_models.dart';
import 'package:kds/app/presentation/recipe_book/recipe_book_controller.dart';
import 'package:kds/app/presentation/recipe_book/widgets/recipe_detail_view.dart';

class RecipeBookScreen extends ConsumerStatefulWidget {
  const RecipeBookScreen({super.key});

  @override
  ConsumerState<RecipeBookScreen> createState() => _RecipeBookScreenState();
}

class _RecipeBookScreenState extends ConsumerState<RecipeBookScreen> {
  bool _showSubproducts = false;
  String _query = '';
  String? _selectedId;

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(recipeBookControllerProvider);

    ref.listen<RecipeBookState>(recipeBookControllerProvider, (_, next) {
      if (next is RecipeBookSessionExpired) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (context.mounted) context.go('/login');
        });
      }
    });

    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Volver a cocina',
          onPressed: () => context.go('/board'),
        ),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.primaryDark,
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Icon(Icons.menu_book_rounded, size: 18, color: Colors.white),
            ),
            const SizedBox(width: 12),
            const Text('Biblia de recetas',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Actualizar',
            onPressed: () => ref.read(recipeBookControllerProvider.notifier).refresh(),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: switch (state) {
        RecipeBookLoading() ||
        RecipeBookSessionExpired() =>
          const Center(child: CircularProgressIndicator()),
        RecipeBookFatal(:final failure) => _ErrorView(
            message: failure.message,
            onRetry: () => ref.read(recipeBookControllerProvider.notifier).refresh(),
          ),
        RecipeBookData(:final book) => _Body(
            entries: _showSubproducts ? book.subproducts : book.products,
            showSubproducts: _showSubproducts,
            query: _query,
            selectedId: _selectedId,
            productCount: book.products.length,
            subproductCount: book.subproducts.length,
            onTabChanged: (sub) => setState(() {
              _showSubproducts = sub;
              _selectedId = null;
            }),
            onQuery: (q) => setState(() => _query = q),
            onSelect: (id) => setState(() => _selectedId = id),
          ),
      },
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.entries,
    required this.showSubproducts,
    required this.query,
    required this.selectedId,
    required this.productCount,
    required this.subproductCount,
    required this.onTabChanged,
    required this.onQuery,
    required this.onSelect,
  });

  final List<RecipeBookEntryModel> entries;
  final bool showSubproducts;
  final String query;
  final String? selectedId;
  final int productCount;
  final int subproductCount;
  final ValueChanged<bool> onTabChanged;
  final ValueChanged<String> onQuery;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final q = query.trim().toLowerCase();
    final filtered = q.isEmpty
        ? entries
        : entries.where((e) => e.name.toLowerCase().contains(q)).toList();
    final selected = filtered.where((e) => e.id == selectedId).firstOrNull ??
        (filtered.isNotEmpty ? filtered.first : null);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          width: 360,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: _Tabs(
                  showSubproducts: showSubproducts,
                  productCount: productCount,
                  subproductCount: subproductCount,
                  onChanged: onTabChanged,
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TextField(
                  onChanged: onQuery,
                  decoration: const InputDecoration(
                    hintText: 'Buscar…',
                    prefixIcon: Icon(Icons.search_rounded, color: AppTheme.textMuted),
                    isDense: true,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: filtered.isEmpty
                    ? const Center(
                        child: Text('Nada por acá',
                            style: TextStyle(color: AppTheme.textMuted)))
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
                        itemCount: filtered.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 6),
                        itemBuilder: (_, i) {
                          final e = filtered[i];
                          return _EntryTile(
                            entry: e,
                            selected: selected?.id == e.id,
                            onTap: () => onSelect(e.id),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
        const VerticalDivider(width: 1, color: AppTheme.border),
        Expanded(
          child: selected == null
              ? const Center(
                  child: Text('Elegí una receta de la lista',
                      style: TextStyle(color: AppTheme.textMuted, fontSize: 16)),
                )
              : RecipeDetailView(entry: selected),
        ),
      ],
    );
  }
}

class _Tabs extends StatelessWidget {
  const _Tabs({
    required this.showSubproducts,
    required this.productCount,
    required this.subproductCount,
    required this.onChanged,
  });
  final bool showSubproducts;
  final int productCount;
  final int subproductCount;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surfaceVariant,
        borderRadius: BorderRadius.circular(10),
      ),
      padding: const EdgeInsets.all(4),
      child: Row(
        children: [
          _tab('Productos ($productCount)', !showSubproducts, () => onChanged(false)),
          _tab('Subproductos ($subproductCount)', showSubproducts, () => onChanged(true)),
        ],
      ),
    );
  }

  Widget _tab(String label, bool active, VoidCallback onTap) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? AppTheme.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active ? Colors.white : AppTheme.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}

class _EntryTile extends StatelessWidget {
  const _EntryTile({required this.entry, required this.selected, required this.onTap});
  final RecipeBookEntryModel entry;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppTheme.primary.withValues(alpha: 0.16) : AppTheme.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? AppTheme.primary : AppTheme.border,
              width: selected ? 2 : 1,
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppTheme.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _subtitle(entry),
                      style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              if (entry.hasSteps)
                const Icon(Icons.menu_book_rounded, size: 16, color: AppTheme.success)
              else
                const Icon(Icons.edit_note_rounded, size: 16, color: AppTheme.textMuted),
            ],
          ),
        ),
      ),
    );
  }

  String _subtitle(RecipeBookEntryModel e) {
    final parts = <String>[];
    if (e.isCombo) {
      parts.add('${e.comboItems.length} productos');
    } else if (e.itemCount > 0) {
      parts.add('${e.itemCount} ingredientes');
    }
    parts.add(e.hasSteps ? '${e.preparationSteps.length} pasos' : 'sin pasos');
    return parts.join(' · ');
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline_rounded, size: 48, color: AppTheme.error),
          const SizedBox(height: 12),
          Text(message, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 16)),
          const SizedBox(height: 16),
          SizedBox(
            width: 200,
            child: ElevatedButton(onPressed: onRetry, child: const Text('Reintentar')),
          ),
        ],
      ),
    );
  }
}
