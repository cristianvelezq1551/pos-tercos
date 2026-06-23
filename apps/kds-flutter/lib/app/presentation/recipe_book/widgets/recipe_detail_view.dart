import 'package:flutter/material.dart';
import 'package:kds/app/core/config/app_config.dart';
import 'package:kds/app/core/theme/app_theme.dart';
import 'package:kds/app/domain/models/recipe_book/recipe_book_models.dart';

/// Panel derecho de la biblia: receta (qué lleva + cantidades) + paso a paso.
class RecipeDetailView extends StatelessWidget {
  const RecipeDetailView({super.key, required this.entry});

  final RecipeBookEntryModel entry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 40),
      children: [
        _Header(entry: entry),
        const SizedBox(height: 24),
        if (entry.isCombo)
          _Section(
            title: 'Incluye',
            icon: Icons.fastfood_rounded,
            child: _ComboList(items: entry.comboItems),
          )
        else
          _Section(
            title: 'Lleva',
            icon: Icons.format_list_bulleted_rounded,
            child: _ComponentsList(components: entry.components),
          ),
        const SizedBox(height: 24),
        _Section(
          title: 'Preparación',
          icon: Icons.menu_book_rounded,
          child: _Steps(steps: entry.preparationSteps),
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.entry});
  final RecipeBookEntryModel entry;

  String? get _fullImageUrl {
    final url = entry.imageUrl;
    if (url == null || url.isEmpty) return null;
    if (url.startsWith('http')) return url;
    return '${AppConfig.baseUrl}$url';
  }

  @override
  Widget build(BuildContext context) {
    final img = _fullImageUrl;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: SizedBox(
            height: 168,
            width: double.infinity,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (img != null)
                  Image.network(
                    img,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => const _ImageFallback(),
                  )
                else
                  const _ImageFallback(),
                // Degradado para que el nombre se lea sobre la foto.
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Color(0xCC0A0E16)],
                    ),
                  ),
                ),
                Positioned(
                  left: 18,
                  right: 18,
                  bottom: 14,
                  child: Text(
                    entry.name,
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 30,
                      fontWeight: FontWeight.w800,
                      height: 1.05,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (entry.isCombo) const _Chip(label: 'COMBO', color: AppTheme.warning),
            if (entry.category != null && entry.category!.isNotEmpty)
              _Chip(label: entry.category!, color: AppTheme.primary),
            if (entry.kind == RecipeEntryKind.subproduct)
              _Chip(
                label: 'Rinde ${_fmtQty(entry.yield ?? 0)} ${entry.unit ?? ''}'.trim(),
                color: AppTheme.success,
              ),
          ],
        ),
        if (entry.description != null && entry.description!.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(
            entry.description!,
            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 15, height: 1.4),
          ),
        ],
      ],
    );
  }
}

class _ImageFallback extends StatelessWidget {
  const _ImageFallback();
  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppTheme.surfaceVariant,
      alignment: Alignment.center,
      child: const Icon(Icons.restaurant_rounded, size: 56, color: AppTheme.textMuted),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.icon, required this.child});
  final String title;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 20, color: AppTheme.textMuted),
            const SizedBox(width: 8),
            Text(
              title.toUpperCase(),
              style: const TextStyle(
                color: AppTheme.textMuted,
                fontSize: 14,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.2,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          decoration: BoxDecoration(
            color: AppTheme.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppTheme.border),
          ),
          padding: const EdgeInsets.all(8),
          child: child,
        ),
      ],
    );
  }
}

class _ComponentsList extends StatelessWidget {
  const _ComponentsList({required this.components});
  final List<RecipeComponentModel> components;

  @override
  Widget build(BuildContext context) {
    if (components.isEmpty) {
      return const _EmptyHint('Sin receta cargada (producto de reventa directa).');
    }
    return Column(
      children: [
        for (final c in components)
          ListTile(
            dense: false,
            leading: Icon(
              c.type == RecipeComponentType.subproduct
                  ? Icons.inventory_2_rounded
                  : Icons.eco_rounded,
              color: c.type == RecipeComponentType.subproduct
                  ? AppTheme.warning
                  : AppTheme.success,
            ),
            title: Text(
              c.name,
              style: const TextStyle(
                color: AppTheme.textPrimary,
                fontSize: 17,
                fontWeight: FontWeight.w600,
              ),
            ),
            subtitle: c.mermaPct > 0
                ? Text('merma ${(c.mermaPct * 100).round()}%',
                    style: const TextStyle(color: AppTheme.textMuted, fontSize: 13))
                : null,
            trailing: Text(
              '${_fmtQty(c.quantity)} ${c.unit}'.trim(),
              style: const TextStyle(
                color: AppTheme.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w800,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
          ),
      ],
    );
  }
}

class _ComboList extends StatelessWidget {
  const _ComboList({required this.items});
  final List<ComboItemModel> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const _EmptyHint('Combo sin productos definidos.');
    return Column(
      children: [
        for (final c in items)
          ListTile(
            leading: const Icon(Icons.lunch_dining_rounded, color: AppTheme.primary),
            title: Text(c.name,
                style: const TextStyle(
                    color: AppTheme.textPrimary, fontSize: 17, fontWeight: FontWeight.w600)),
            trailing: Text('×${_fmtQty(c.quantity)}',
                style: const TextStyle(
                    color: AppTheme.textPrimary, fontSize: 18, fontWeight: FontWeight.w800)),
          ),
      ],
    );
  }
}

class _Steps extends StatelessWidget {
  const _Steps({required this.steps});
  final List<String> steps;

  @override
  Widget build(BuildContext context) {
    if (steps.isEmpty) {
      return const _EmptyHint(
        'Sin paso a paso cargado todavía. Agregalo desde el admin (Producto → Pasos de preparación).',
      );
    }
    return Column(
      children: [
        for (var i = 0; i < steps.length; i++)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 34,
                  height: 34,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: AppTheme.primary,
                    shape: BoxShape.circle,
                  ),
                  child: Text('${i + 1}',
                      style: const TextStyle(
                          color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800)),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      steps[i],
                      style: const TextStyle(
                          color: AppTheme.textPrimary, fontSize: 18, height: 1.35),
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _EmptyHint extends StatelessWidget {
  const _EmptyHint(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Text(text,
          style: const TextStyle(color: AppTheme.textMuted, fontSize: 15, height: 1.4)),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.color});
  final String label;
  final Color color;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(label,
          style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w700)),
    );
  }
}

/// Formatea cantidades quitando ceros sobrantes (160.0 → 160, 0.75 → 0.75).
String _fmtQty(double v) {
  if (v == v.roundToDouble()) return v.toInt().toString();
  return v.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
}
