import 'package:freezed_annotation/freezed_annotation.dart';

part 'recipe_book_models.freezed.dart';
part 'recipe_book_models.g.dart';

enum RecipeComponentType { ingredient, subproduct }

RecipeComponentType _componentTypeFrom(String s) => switch (s) {
      'SUBPRODUCT' => RecipeComponentType.subproduct,
      _ => RecipeComponentType.ingredient,
    };

enum RecipeEntryKind { product, subproduct }

RecipeEntryKind _entryKindFrom(String s) => switch (s) {
      'SUBPRODUCT' => RecipeEntryKind.subproduct,
      _ => RecipeEntryKind.product,
    };

/// Un ingrediente o subproducto que entra a la receta (qué lleva + cuánto).
@freezed
abstract class RecipeComponentModel with _$RecipeComponentModel {
  const factory RecipeComponentModel({
    required RecipeComponentType type,
    required String id,
    required String name,
    required double quantity,
    required String unit,
    required double mermaPct,
  }) = _RecipeComponentModel;

  factory RecipeComponentModel.fromJson(Map<String, dynamic> json) =>
      RecipeComponentModel(
        type: _componentTypeFrom(json['type'] as String? ?? 'INGREDIENT'),
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        quantity: (json['quantity'] as num? ?? 0).toDouble(),
        unit: json['unit'] as String? ?? '',
        mermaPct: (json['mermaPct'] as num? ?? 0).toDouble(),
      );
}

/// Componente de un combo: otro producto que lo integra.
@freezed
abstract class ComboItemModel with _$ComboItemModel {
  const factory ComboItemModel({
    required String productId,
    required String name,
    required double quantity,
  }) = _ComboItemModel;

  factory ComboItemModel.fromJson(Map<String, dynamic> json) => ComboItemModel(
        productId: json['productId'] as String,
        name: json['name'] as String? ?? '',
        quantity: (json['quantity'] as num? ?? 0).toDouble(),
      );
}

/// Una entrada de la biblia: producto o subproducto con receta + paso a paso.
@freezed
abstract class RecipeBookEntryModel with _$RecipeBookEntryModel {
  const factory RecipeBookEntryModel({
    required RecipeEntryKind kind,
    required String id,
    required String name,
    String? category,
    String? imageUrl,
    String? description,
    required bool isCombo,
    double? yield,
    String? unit,
    @Default([]) List<RecipeComponentModel> components,
    @Default([]) List<ComboItemModel> comboItems,
    @Default([]) List<String> preparationSteps,
  }) = _RecipeBookEntryModel;

  factory RecipeBookEntryModel.fromJson(Map<String, dynamic> json) =>
      RecipeBookEntryModel(
        kind: _entryKindFrom(json['kind'] as String? ?? 'PRODUCT'),
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        category: json['category'] as String?,
        imageUrl: json['imageUrl'] as String?,
        description: json['description'] as String?,
        isCombo: json['isCombo'] as bool? ?? false,
        yield: (json['yield'] as num?)?.toDouble(),
        unit: json['unit'] as String?,
        components: (json['components'] as List<dynamic>?)
                ?.map((e) =>
                    RecipeComponentModel.fromJson(e as Map<String, dynamic>))
                .toList() ??
            const [],
        comboItems: (json['comboItems'] as List<dynamic>?)
                ?.map((e) => ComboItemModel.fromJson(e as Map<String, dynamic>))
                .toList() ??
            const [],
        preparationSteps: (json['preparationSteps'] as List<dynamic>?)
                ?.map((e) => e as String)
                .toList() ??
            const [],
      );
}

extension RecipeBookEntryX on RecipeBookEntryModel {
  bool get hasSteps => preparationSteps.isNotEmpty;
  int get itemCount => components.length + comboItems.length;
}

/// Respuesta de `GET /recipe-book`: productos + subproductos.
@freezed
abstract class RecipeBookModel with _$RecipeBookModel {
  const factory RecipeBookModel({
    @Default([]) List<RecipeBookEntryModel> products,
    @Default([]) List<RecipeBookEntryModel> subproducts,
  }) = _RecipeBookModel;

  factory RecipeBookModel.fromJson(Map<String, dynamic> json) => RecipeBookModel(
        products: (json['products'] as List<dynamic>?)
                ?.map((e) =>
                    RecipeBookEntryModel.fromJson(e as Map<String, dynamic>))
                .toList() ??
            const [],
        subproducts: (json['subproducts'] as List<dynamic>?)
                ?.map((e) =>
                    RecipeBookEntryModel.fromJson(e as Map<String, dynamic>))
                .toList() ??
            const [],
      );
}
