// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'producible_subproduct_model.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ProducibleSubproductModel {

 String get id; String get name;/// Unidad del subproducto (piezas, gramos, etc).
 String get unit;/// Cuántas unidades produce una corrida de la receta.
 double get yield;/// Umbral mínimo de stock; 0 = sin umbral.
 double get thresholdMin;/// Stock actual en la misma unidad que `unit`.
 double get currentStock; bool get isActive;
/// Create a copy of ProducibleSubproductModel
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ProducibleSubproductModelCopyWith<ProducibleSubproductModel> get copyWith => _$ProducibleSubproductModelCopyWithImpl<ProducibleSubproductModel>(this as ProducibleSubproductModel, _$identity);

  /// Serializes this ProducibleSubproductModel to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ProducibleSubproductModel&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.unit, unit) || other.unit == unit)&&(identical(other.yield, yield) || other.yield == yield)&&(identical(other.thresholdMin, thresholdMin) || other.thresholdMin == thresholdMin)&&(identical(other.currentStock, currentStock) || other.currentStock == currentStock)&&(identical(other.isActive, isActive) || other.isActive == isActive));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,unit,yield,thresholdMin,currentStock,isActive);

@override
String toString() {
  return 'ProducibleSubproductModel(id: $id, name: $name, unit: $unit, yield: $yield, thresholdMin: $thresholdMin, currentStock: $currentStock, isActive: $isActive)';
}


}

/// @nodoc
abstract mixin class $ProducibleSubproductModelCopyWith<$Res>  {
  factory $ProducibleSubproductModelCopyWith(ProducibleSubproductModel value, $Res Function(ProducibleSubproductModel) _then) = _$ProducibleSubproductModelCopyWithImpl;
@useResult
$Res call({
 String id, String name, String unit, double yield, double thresholdMin, double currentStock, bool isActive
});




}
/// @nodoc
class _$ProducibleSubproductModelCopyWithImpl<$Res>
    implements $ProducibleSubproductModelCopyWith<$Res> {
  _$ProducibleSubproductModelCopyWithImpl(this._self, this._then);

  final ProducibleSubproductModel _self;
  final $Res Function(ProducibleSubproductModel) _then;

/// Create a copy of ProducibleSubproductModel
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? unit = null,Object? yield = null,Object? thresholdMin = null,Object? currentStock = null,Object? isActive = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,unit: null == unit ? _self.unit : unit // ignore: cast_nullable_to_non_nullable
as String,yield: null == yield ? _self.yield : yield // ignore: cast_nullable_to_non_nullable
as double,thresholdMin: null == thresholdMin ? _self.thresholdMin : thresholdMin // ignore: cast_nullable_to_non_nullable
as double,currentStock: null == currentStock ? _self.currentStock : currentStock // ignore: cast_nullable_to_non_nullable
as double,isActive: null == isActive ? _self.isActive : isActive // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}

}


/// Adds pattern-matching-related methods to [ProducibleSubproductModel].
extension ProducibleSubproductModelPatterns on ProducibleSubproductModel {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ProducibleSubproductModel value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ProducibleSubproductModel() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ProducibleSubproductModel value)  $default,){
final _that = this;
switch (_that) {
case _ProducibleSubproductModel():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ProducibleSubproductModel value)?  $default,){
final _that = this;
switch (_that) {
case _ProducibleSubproductModel() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String unit,  double yield,  double thresholdMin,  double currentStock,  bool isActive)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ProducibleSubproductModel() when $default != null:
return $default(_that.id,_that.name,_that.unit,_that.yield,_that.thresholdMin,_that.currentStock,_that.isActive);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String unit,  double yield,  double thresholdMin,  double currentStock,  bool isActive)  $default,) {final _that = this;
switch (_that) {
case _ProducibleSubproductModel():
return $default(_that.id,_that.name,_that.unit,_that.yield,_that.thresholdMin,_that.currentStock,_that.isActive);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String unit,  double yield,  double thresholdMin,  double currentStock,  bool isActive)?  $default,) {final _that = this;
switch (_that) {
case _ProducibleSubproductModel() when $default != null:
return $default(_that.id,_that.name,_that.unit,_that.yield,_that.thresholdMin,_that.currentStock,_that.isActive);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ProducibleSubproductModel implements ProducibleSubproductModel {
  const _ProducibleSubproductModel({required this.id, required this.name, required this.unit, required this.yield, required this.thresholdMin, required this.currentStock, required this.isActive});
  factory _ProducibleSubproductModel.fromJson(Map<String, dynamic> json) => _$ProducibleSubproductModelFromJson(json);

@override final  String id;
@override final  String name;
/// Unidad del subproducto (piezas, gramos, etc).
@override final  String unit;
/// Cuántas unidades produce una corrida de la receta.
@override final  double yield;
/// Umbral mínimo de stock; 0 = sin umbral.
@override final  double thresholdMin;
/// Stock actual en la misma unidad que `unit`.
@override final  double currentStock;
@override final  bool isActive;

/// Create a copy of ProducibleSubproductModel
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ProducibleSubproductModelCopyWith<_ProducibleSubproductModel> get copyWith => __$ProducibleSubproductModelCopyWithImpl<_ProducibleSubproductModel>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ProducibleSubproductModelToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ProducibleSubproductModel&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.unit, unit) || other.unit == unit)&&(identical(other.yield, yield) || other.yield == yield)&&(identical(other.thresholdMin, thresholdMin) || other.thresholdMin == thresholdMin)&&(identical(other.currentStock, currentStock) || other.currentStock == currentStock)&&(identical(other.isActive, isActive) || other.isActive == isActive));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,unit,yield,thresholdMin,currentStock,isActive);

@override
String toString() {
  return 'ProducibleSubproductModel(id: $id, name: $name, unit: $unit, yield: $yield, thresholdMin: $thresholdMin, currentStock: $currentStock, isActive: $isActive)';
}


}

/// @nodoc
abstract mixin class _$ProducibleSubproductModelCopyWith<$Res> implements $ProducibleSubproductModelCopyWith<$Res> {
  factory _$ProducibleSubproductModelCopyWith(_ProducibleSubproductModel value, $Res Function(_ProducibleSubproductModel) _then) = __$ProducibleSubproductModelCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String unit, double yield, double thresholdMin, double currentStock, bool isActive
});




}
/// @nodoc
class __$ProducibleSubproductModelCopyWithImpl<$Res>
    implements _$ProducibleSubproductModelCopyWith<$Res> {
  __$ProducibleSubproductModelCopyWithImpl(this._self, this._then);

  final _ProducibleSubproductModel _self;
  final $Res Function(_ProducibleSubproductModel) _then;

/// Create a copy of ProducibleSubproductModel
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? unit = null,Object? yield = null,Object? thresholdMin = null,Object? currentStock = null,Object? isActive = null,}) {
  return _then(_ProducibleSubproductModel(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,unit: null == unit ? _self.unit : unit // ignore: cast_nullable_to_non_nullable
as String,yield: null == yield ? _self.yield : yield // ignore: cast_nullable_to_non_nullable
as double,thresholdMin: null == thresholdMin ? _self.thresholdMin : thresholdMin // ignore: cast_nullable_to_non_nullable
as double,currentStock: null == currentStock ? _self.currentStock : currentStock // ignore: cast_nullable_to_non_nullable
as double,isActive: null == isActive ? _self.isActive : isActive // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}


}

// dart format on
