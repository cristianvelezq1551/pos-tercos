// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'recipe_book_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_RecipeComponentModel _$RecipeComponentModelFromJson(
  Map<String, dynamic> json,
) => _RecipeComponentModel(
  type: $enumDecode(_$RecipeComponentTypeEnumMap, json['type']),
  id: json['id'] as String,
  name: json['name'] as String,
  quantity: (json['quantity'] as num).toDouble(),
  unit: json['unit'] as String,
  mermaPct: (json['mermaPct'] as num).toDouble(),
);

Map<String, dynamic> _$RecipeComponentModelToJson(
  _RecipeComponentModel instance,
) => <String, dynamic>{
  'type': _$RecipeComponentTypeEnumMap[instance.type]!,
  'id': instance.id,
  'name': instance.name,
  'quantity': instance.quantity,
  'unit': instance.unit,
  'mermaPct': instance.mermaPct,
};

const _$RecipeComponentTypeEnumMap = {
  RecipeComponentType.ingredient: 'ingredient',
  RecipeComponentType.subproduct: 'subproduct',
};

_ComboItemModel _$ComboItemModelFromJson(Map<String, dynamic> json) =>
    _ComboItemModel(
      productId: json['productId'] as String,
      name: json['name'] as String,
      quantity: (json['quantity'] as num).toDouble(),
    );

Map<String, dynamic> _$ComboItemModelToJson(_ComboItemModel instance) =>
    <String, dynamic>{
      'productId': instance.productId,
      'name': instance.name,
      'quantity': instance.quantity,
    };

_RecipeBookEntryModel _$RecipeBookEntryModelFromJson(
  Map<String, dynamic> json,
) => _RecipeBookEntryModel(
  kind: $enumDecode(_$RecipeEntryKindEnumMap, json['kind']),
  id: json['id'] as String,
  name: json['name'] as String,
  category: json['category'] as String?,
  imageUrl: json['imageUrl'] as String?,
  description: json['description'] as String?,
  isCombo: json['isCombo'] as bool,
  yield: (json['yield'] as num?)?.toDouble(),
  unit: json['unit'] as String?,
  components:
      (json['components'] as List<dynamic>?)
          ?.map((e) => RecipeComponentModel.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  comboItems:
      (json['comboItems'] as List<dynamic>?)
          ?.map((e) => ComboItemModel.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  preparationSteps:
      (json['preparationSteps'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList() ??
      const [],
);

Map<String, dynamic> _$RecipeBookEntryModelToJson(
  _RecipeBookEntryModel instance,
) => <String, dynamic>{
  'kind': _$RecipeEntryKindEnumMap[instance.kind]!,
  'id': instance.id,
  'name': instance.name,
  'category': instance.category,
  'imageUrl': instance.imageUrl,
  'description': instance.description,
  'isCombo': instance.isCombo,
  'yield': instance.yield,
  'unit': instance.unit,
  'components': instance.components,
  'comboItems': instance.comboItems,
  'preparationSteps': instance.preparationSteps,
};

const _$RecipeEntryKindEnumMap = {
  RecipeEntryKind.product: 'product',
  RecipeEntryKind.subproduct: 'subproduct',
};

_RecipeBookModel _$RecipeBookModelFromJson(
  Map<String, dynamic> json,
) => _RecipeBookModel(
  products:
      (json['products'] as List<dynamic>?)
          ?.map((e) => RecipeBookEntryModel.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  subproducts:
      (json['subproducts'] as List<dynamic>?)
          ?.map((e) => RecipeBookEntryModel.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
);

Map<String, dynamic> _$RecipeBookModelToJson(_RecipeBookModel instance) =>
    <String, dynamic>{
      'products': instance.products,
      'subproducts': instance.subproducts,
    };
