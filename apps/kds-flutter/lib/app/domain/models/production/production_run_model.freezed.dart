// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'production_run_model.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ConsumedItemModel {

 ConsumedEntityType get entityType; String get entityId; String get name; double get quantityConsumed; String get unit;
/// Create a copy of ConsumedItemModel
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ConsumedItemModelCopyWith<ConsumedItemModel> get copyWith => _$ConsumedItemModelCopyWithImpl<ConsumedItemModel>(this as ConsumedItemModel, _$identity);

  /// Serializes this ConsumedItemModel to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ConsumedItemModel&&(identical(other.entityType, entityType) || other.entityType == entityType)&&(identical(other.entityId, entityId) || other.entityId == entityId)&&(identical(other.name, name) || other.name == name)&&(identical(other.quantityConsumed, quantityConsumed) || other.quantityConsumed == quantityConsumed)&&(identical(other.unit, unit) || other.unit == unit));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,entityType,entityId,name,quantityConsumed,unit);

@override
String toString() {
  return 'ConsumedItemModel(entityType: $entityType, entityId: $entityId, name: $name, quantityConsumed: $quantityConsumed, unit: $unit)';
}


}

/// @nodoc
abstract mixin class $ConsumedItemModelCopyWith<$Res>  {
  factory $ConsumedItemModelCopyWith(ConsumedItemModel value, $Res Function(ConsumedItemModel) _then) = _$ConsumedItemModelCopyWithImpl;
@useResult
$Res call({
 ConsumedEntityType entityType, String entityId, String name, double quantityConsumed, String unit
});




}
/// @nodoc
class _$ConsumedItemModelCopyWithImpl<$Res>
    implements $ConsumedItemModelCopyWith<$Res> {
  _$ConsumedItemModelCopyWithImpl(this._self, this._then);

  final ConsumedItemModel _self;
  final $Res Function(ConsumedItemModel) _then;

/// Create a copy of ConsumedItemModel
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? entityType = null,Object? entityId = null,Object? name = null,Object? quantityConsumed = null,Object? unit = null,}) {
  return _then(_self.copyWith(
entityType: null == entityType ? _self.entityType : entityType // ignore: cast_nullable_to_non_nullable
as ConsumedEntityType,entityId: null == entityId ? _self.entityId : entityId // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,quantityConsumed: null == quantityConsumed ? _self.quantityConsumed : quantityConsumed // ignore: cast_nullable_to_non_nullable
as double,unit: null == unit ? _self.unit : unit // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [ConsumedItemModel].
extension ConsumedItemModelPatterns on ConsumedItemModel {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ConsumedItemModel value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ConsumedItemModel() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ConsumedItemModel value)  $default,){
final _that = this;
switch (_that) {
case _ConsumedItemModel():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ConsumedItemModel value)?  $default,){
final _that = this;
switch (_that) {
case _ConsumedItemModel() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( ConsumedEntityType entityType,  String entityId,  String name,  double quantityConsumed,  String unit)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ConsumedItemModel() when $default != null:
return $default(_that.entityType,_that.entityId,_that.name,_that.quantityConsumed,_that.unit);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( ConsumedEntityType entityType,  String entityId,  String name,  double quantityConsumed,  String unit)  $default,) {final _that = this;
switch (_that) {
case _ConsumedItemModel():
return $default(_that.entityType,_that.entityId,_that.name,_that.quantityConsumed,_that.unit);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( ConsumedEntityType entityType,  String entityId,  String name,  double quantityConsumed,  String unit)?  $default,) {final _that = this;
switch (_that) {
case _ConsumedItemModel() when $default != null:
return $default(_that.entityType,_that.entityId,_that.name,_that.quantityConsumed,_that.unit);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ConsumedItemModel implements ConsumedItemModel {
  const _ConsumedItemModel({required this.entityType, required this.entityId, required this.name, required this.quantityConsumed, required this.unit});
  factory _ConsumedItemModel.fromJson(Map<String, dynamic> json) => _$ConsumedItemModelFromJson(json);

@override final  ConsumedEntityType entityType;
@override final  String entityId;
@override final  String name;
@override final  double quantityConsumed;
@override final  String unit;

/// Create a copy of ConsumedItemModel
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ConsumedItemModelCopyWith<_ConsumedItemModel> get copyWith => __$ConsumedItemModelCopyWithImpl<_ConsumedItemModel>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ConsumedItemModelToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ConsumedItemModel&&(identical(other.entityType, entityType) || other.entityType == entityType)&&(identical(other.entityId, entityId) || other.entityId == entityId)&&(identical(other.name, name) || other.name == name)&&(identical(other.quantityConsumed, quantityConsumed) || other.quantityConsumed == quantityConsumed)&&(identical(other.unit, unit) || other.unit == unit));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,entityType,entityId,name,quantityConsumed,unit);

@override
String toString() {
  return 'ConsumedItemModel(entityType: $entityType, entityId: $entityId, name: $name, quantityConsumed: $quantityConsumed, unit: $unit)';
}


}

/// @nodoc
abstract mixin class _$ConsumedItemModelCopyWith<$Res> implements $ConsumedItemModelCopyWith<$Res> {
  factory _$ConsumedItemModelCopyWith(_ConsumedItemModel value, $Res Function(_ConsumedItemModel) _then) = __$ConsumedItemModelCopyWithImpl;
@override @useResult
$Res call({
 ConsumedEntityType entityType, String entityId, String name, double quantityConsumed, String unit
});




}
/// @nodoc
class __$ConsumedItemModelCopyWithImpl<$Res>
    implements _$ConsumedItemModelCopyWith<$Res> {
  __$ConsumedItemModelCopyWithImpl(this._self, this._then);

  final _ConsumedItemModel _self;
  final $Res Function(_ConsumedItemModel) _then;

/// Create a copy of ConsumedItemModel
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? entityType = null,Object? entityId = null,Object? name = null,Object? quantityConsumed = null,Object? unit = null,}) {
  return _then(_ConsumedItemModel(
entityType: null == entityType ? _self.entityType : entityType // ignore: cast_nullable_to_non_nullable
as ConsumedEntityType,entityId: null == entityId ? _self.entityId : entityId // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,quantityConsumed: null == quantityConsumed ? _self.quantityConsumed : quantityConsumed // ignore: cast_nullable_to_non_nullable
as double,unit: null == unit ? _self.unit : unit // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$ProductionRunModel {

 String get runId; String get subproductId; String get subproductName; double get quantityProduced; String get unit; List<ConsumedItemModel> get consumed; DateTime get createdAt;
/// Create a copy of ProductionRunModel
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ProductionRunModelCopyWith<ProductionRunModel> get copyWith => _$ProductionRunModelCopyWithImpl<ProductionRunModel>(this as ProductionRunModel, _$identity);

  /// Serializes this ProductionRunModel to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ProductionRunModel&&(identical(other.runId, runId) || other.runId == runId)&&(identical(other.subproductId, subproductId) || other.subproductId == subproductId)&&(identical(other.subproductName, subproductName) || other.subproductName == subproductName)&&(identical(other.quantityProduced, quantityProduced) || other.quantityProduced == quantityProduced)&&(identical(other.unit, unit) || other.unit == unit)&&const DeepCollectionEquality().equals(other.consumed, consumed)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,runId,subproductId,subproductName,quantityProduced,unit,const DeepCollectionEquality().hash(consumed),createdAt);

@override
String toString() {
  return 'ProductionRunModel(runId: $runId, subproductId: $subproductId, subproductName: $subproductName, quantityProduced: $quantityProduced, unit: $unit, consumed: $consumed, createdAt: $createdAt)';
}


}

/// @nodoc
abstract mixin class $ProductionRunModelCopyWith<$Res>  {
  factory $ProductionRunModelCopyWith(ProductionRunModel value, $Res Function(ProductionRunModel) _then) = _$ProductionRunModelCopyWithImpl;
@useResult
$Res call({
 String runId, String subproductId, String subproductName, double quantityProduced, String unit, List<ConsumedItemModel> consumed, DateTime createdAt
});




}
/// @nodoc
class _$ProductionRunModelCopyWithImpl<$Res>
    implements $ProductionRunModelCopyWith<$Res> {
  _$ProductionRunModelCopyWithImpl(this._self, this._then);

  final ProductionRunModel _self;
  final $Res Function(ProductionRunModel) _then;

/// Create a copy of ProductionRunModel
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? runId = null,Object? subproductId = null,Object? subproductName = null,Object? quantityProduced = null,Object? unit = null,Object? consumed = null,Object? createdAt = null,}) {
  return _then(_self.copyWith(
runId: null == runId ? _self.runId : runId // ignore: cast_nullable_to_non_nullable
as String,subproductId: null == subproductId ? _self.subproductId : subproductId // ignore: cast_nullable_to_non_nullable
as String,subproductName: null == subproductName ? _self.subproductName : subproductName // ignore: cast_nullable_to_non_nullable
as String,quantityProduced: null == quantityProduced ? _self.quantityProduced : quantityProduced // ignore: cast_nullable_to_non_nullable
as double,unit: null == unit ? _self.unit : unit // ignore: cast_nullable_to_non_nullable
as String,consumed: null == consumed ? _self.consumed : consumed // ignore: cast_nullable_to_non_nullable
as List<ConsumedItemModel>,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}

}


/// Adds pattern-matching-related methods to [ProductionRunModel].
extension ProductionRunModelPatterns on ProductionRunModel {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ProductionRunModel value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ProductionRunModel() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ProductionRunModel value)  $default,){
final _that = this;
switch (_that) {
case _ProductionRunModel():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ProductionRunModel value)?  $default,){
final _that = this;
switch (_that) {
case _ProductionRunModel() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String runId,  String subproductId,  String subproductName,  double quantityProduced,  String unit,  List<ConsumedItemModel> consumed,  DateTime createdAt)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ProductionRunModel() when $default != null:
return $default(_that.runId,_that.subproductId,_that.subproductName,_that.quantityProduced,_that.unit,_that.consumed,_that.createdAt);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String runId,  String subproductId,  String subproductName,  double quantityProduced,  String unit,  List<ConsumedItemModel> consumed,  DateTime createdAt)  $default,) {final _that = this;
switch (_that) {
case _ProductionRunModel():
return $default(_that.runId,_that.subproductId,_that.subproductName,_that.quantityProduced,_that.unit,_that.consumed,_that.createdAt);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String runId,  String subproductId,  String subproductName,  double quantityProduced,  String unit,  List<ConsumedItemModel> consumed,  DateTime createdAt)?  $default,) {final _that = this;
switch (_that) {
case _ProductionRunModel() when $default != null:
return $default(_that.runId,_that.subproductId,_that.subproductName,_that.quantityProduced,_that.unit,_that.consumed,_that.createdAt);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ProductionRunModel implements ProductionRunModel {
  const _ProductionRunModel({required this.runId, required this.subproductId, required this.subproductName, required this.quantityProduced, required this.unit, final  List<ConsumedItemModel> consumed = const [], required this.createdAt}): _consumed = consumed;
  factory _ProductionRunModel.fromJson(Map<String, dynamic> json) => _$ProductionRunModelFromJson(json);

@override final  String runId;
@override final  String subproductId;
@override final  String subproductName;
@override final  double quantityProduced;
@override final  String unit;
 final  List<ConsumedItemModel> _consumed;
@override@JsonKey() List<ConsumedItemModel> get consumed {
  if (_consumed is EqualUnmodifiableListView) return _consumed;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_consumed);
}

@override final  DateTime createdAt;

/// Create a copy of ProductionRunModel
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ProductionRunModelCopyWith<_ProductionRunModel> get copyWith => __$ProductionRunModelCopyWithImpl<_ProductionRunModel>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ProductionRunModelToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ProductionRunModel&&(identical(other.runId, runId) || other.runId == runId)&&(identical(other.subproductId, subproductId) || other.subproductId == subproductId)&&(identical(other.subproductName, subproductName) || other.subproductName == subproductName)&&(identical(other.quantityProduced, quantityProduced) || other.quantityProduced == quantityProduced)&&(identical(other.unit, unit) || other.unit == unit)&&const DeepCollectionEquality().equals(other._consumed, _consumed)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,runId,subproductId,subproductName,quantityProduced,unit,const DeepCollectionEquality().hash(_consumed),createdAt);

@override
String toString() {
  return 'ProductionRunModel(runId: $runId, subproductId: $subproductId, subproductName: $subproductName, quantityProduced: $quantityProduced, unit: $unit, consumed: $consumed, createdAt: $createdAt)';
}


}

/// @nodoc
abstract mixin class _$ProductionRunModelCopyWith<$Res> implements $ProductionRunModelCopyWith<$Res> {
  factory _$ProductionRunModelCopyWith(_ProductionRunModel value, $Res Function(_ProductionRunModel) _then) = __$ProductionRunModelCopyWithImpl;
@override @useResult
$Res call({
 String runId, String subproductId, String subproductName, double quantityProduced, String unit, List<ConsumedItemModel> consumed, DateTime createdAt
});




}
/// @nodoc
class __$ProductionRunModelCopyWithImpl<$Res>
    implements _$ProductionRunModelCopyWith<$Res> {
  __$ProductionRunModelCopyWithImpl(this._self, this._then);

  final _ProductionRunModel _self;
  final $Res Function(_ProductionRunModel) _then;

/// Create a copy of ProductionRunModel
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? runId = null,Object? subproductId = null,Object? subproductName = null,Object? quantityProduced = null,Object? unit = null,Object? consumed = null,Object? createdAt = null,}) {
  return _then(_ProductionRunModel(
runId: null == runId ? _self.runId : runId // ignore: cast_nullable_to_non_nullable
as String,subproductId: null == subproductId ? _self.subproductId : subproductId // ignore: cast_nullable_to_non_nullable
as String,subproductName: null == subproductName ? _self.subproductName : subproductName // ignore: cast_nullable_to_non_nullable
as String,quantityProduced: null == quantityProduced ? _self.quantityProduced : quantityProduced // ignore: cast_nullable_to_non_nullable
as double,unit: null == unit ? _self.unit : unit // ignore: cast_nullable_to_non_nullable
as String,consumed: null == consumed ? _self._consumed : consumed // ignore: cast_nullable_to_non_nullable
as List<ConsumedItemModel>,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}


}

// dart format on
