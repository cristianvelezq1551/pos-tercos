// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'kitchen_order_item_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_AppliedModifierModel _$AppliedModifierModelFromJson(
  Map<String, dynamic> json,
) => _AppliedModifierModel(
  modifierId: json['modifierId'] as String,
  name: json['name'] as String,
  priceDelta: (json['priceDelta'] as num).toDouble(),
);

Map<String, dynamic> _$AppliedModifierModelToJson(
  _AppliedModifierModel instance,
) => <String, dynamic>{
  'modifierId': instance.modifierId,
  'name': instance.name,
  'priceDelta': instance.priceDelta,
};

_KitchenOrderItemModel _$KitchenOrderItemModelFromJson(
  Map<String, dynamic> json,
) => _KitchenOrderItemModel(
  id: json['id'] as String,
  productId: json['productId'] as String,
  productName: json['productName'] as String,
  sizeName: json['sizeName'] as String?,
  quantity: (json['quantity'] as num).toInt(),
  modifiers:
      (json['modifiers'] as List<dynamic>?)
          ?.map((e) => AppliedModifierModel.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  notes: json['notes'] as String?,
);

Map<String, dynamic> _$KitchenOrderItemModelToJson(
  _KitchenOrderItemModel instance,
) => <String, dynamic>{
  'id': instance.id,
  'productId': instance.productId,
  'productName': instance.productName,
  'sizeName': instance.sizeName,
  'quantity': instance.quantity,
  'modifiers': instance.modifiers,
  'notes': instance.notes,
};
