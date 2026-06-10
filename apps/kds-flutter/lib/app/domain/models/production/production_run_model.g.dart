// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_run_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ConsumedItemModel _$ConsumedItemModelFromJson(Map<String, dynamic> json) =>
    _ConsumedItemModel(
      entityType: $enumDecode(_$ConsumedEntityTypeEnumMap, json['entityType']),
      entityId: json['entityId'] as String,
      name: json['name'] as String,
      quantityConsumed: (json['quantityConsumed'] as num).toDouble(),
      unit: json['unit'] as String,
    );

Map<String, dynamic> _$ConsumedItemModelToJson(_ConsumedItemModel instance) =>
    <String, dynamic>{
      'entityType': _$ConsumedEntityTypeEnumMap[instance.entityType]!,
      'entityId': instance.entityId,
      'name': instance.name,
      'quantityConsumed': instance.quantityConsumed,
      'unit': instance.unit,
    };

const _$ConsumedEntityTypeEnumMap = {
  ConsumedEntityType.ingredient: 'ingredient',
  ConsumedEntityType.subproduct: 'subproduct',
};

_ProductionRunModel _$ProductionRunModelFromJson(Map<String, dynamic> json) =>
    _ProductionRunModel(
      runId: json['runId'] as String,
      subproductId: json['subproductId'] as String,
      subproductName: json['subproductName'] as String,
      quantityProduced: (json['quantityProduced'] as num).toDouble(),
      unit: json['unit'] as String,
      consumed:
          (json['consumed'] as List<dynamic>?)
              ?.map(
                (e) => ConsumedItemModel.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          const [],
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$ProductionRunModelToJson(_ProductionRunModel instance) =>
    <String, dynamic>{
      'runId': instance.runId,
      'subproductId': instance.subproductId,
      'subproductName': instance.subproductName,
      'quantityProduced': instance.quantityProduced,
      'unit': instance.unit,
      'consumed': instance.consumed,
      'createdAt': instance.createdAt.toIso8601String(),
    };
