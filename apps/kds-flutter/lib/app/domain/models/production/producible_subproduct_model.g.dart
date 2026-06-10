// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'producible_subproduct_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ProducibleSubproductModel _$ProducibleSubproductModelFromJson(
  Map<String, dynamic> json,
) => _ProducibleSubproductModel(
  id: json['id'] as String,
  name: json['name'] as String,
  unit: json['unit'] as String,
  yield: (json['yield'] as num).toDouble(),
  thresholdMin: (json['thresholdMin'] as num).toDouble(),
  currentStock: (json['currentStock'] as num).toDouble(),
  isActive: json['isActive'] as bool,
);

Map<String, dynamic> _$ProducibleSubproductModelToJson(
  _ProducibleSubproductModel instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'unit': instance.unit,
  'yield': instance.yield,
  'thresholdMin': instance.thresholdMin,
  'currentStock': instance.currentStock,
  'isActive': instance.isActive,
};
