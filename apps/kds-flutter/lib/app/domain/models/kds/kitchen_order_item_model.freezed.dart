// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'kitchen_order_item_model.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$AppliedModifierModel {

 String get modifierId; String get name; double get priceDelta;
/// Create a copy of AppliedModifierModel
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$AppliedModifierModelCopyWith<AppliedModifierModel> get copyWith => _$AppliedModifierModelCopyWithImpl<AppliedModifierModel>(this as AppliedModifierModel, _$identity);

  /// Serializes this AppliedModifierModel to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is AppliedModifierModel&&(identical(other.modifierId, modifierId) || other.modifierId == modifierId)&&(identical(other.name, name) || other.name == name)&&(identical(other.priceDelta, priceDelta) || other.priceDelta == priceDelta));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,modifierId,name,priceDelta);

@override
String toString() {
  return 'AppliedModifierModel(modifierId: $modifierId, name: $name, priceDelta: $priceDelta)';
}


}

/// @nodoc
abstract mixin class $AppliedModifierModelCopyWith<$Res>  {
  factory $AppliedModifierModelCopyWith(AppliedModifierModel value, $Res Function(AppliedModifierModel) _then) = _$AppliedModifierModelCopyWithImpl;
@useResult
$Res call({
 String modifierId, String name, double priceDelta
});




}
/// @nodoc
class _$AppliedModifierModelCopyWithImpl<$Res>
    implements $AppliedModifierModelCopyWith<$Res> {
  _$AppliedModifierModelCopyWithImpl(this._self, this._then);

  final AppliedModifierModel _self;
  final $Res Function(AppliedModifierModel) _then;

/// Create a copy of AppliedModifierModel
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? modifierId = null,Object? name = null,Object? priceDelta = null,}) {
  return _then(_self.copyWith(
modifierId: null == modifierId ? _self.modifierId : modifierId // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,priceDelta: null == priceDelta ? _self.priceDelta : priceDelta // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [AppliedModifierModel].
extension AppliedModifierModelPatterns on AppliedModifierModel {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _AppliedModifierModel value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _AppliedModifierModel() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _AppliedModifierModel value)  $default,){
final _that = this;
switch (_that) {
case _AppliedModifierModel():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _AppliedModifierModel value)?  $default,){
final _that = this;
switch (_that) {
case _AppliedModifierModel() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String modifierId,  String name,  double priceDelta)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _AppliedModifierModel() when $default != null:
return $default(_that.modifierId,_that.name,_that.priceDelta);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String modifierId,  String name,  double priceDelta)  $default,) {final _that = this;
switch (_that) {
case _AppliedModifierModel():
return $default(_that.modifierId,_that.name,_that.priceDelta);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String modifierId,  String name,  double priceDelta)?  $default,) {final _that = this;
switch (_that) {
case _AppliedModifierModel() when $default != null:
return $default(_that.modifierId,_that.name,_that.priceDelta);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _AppliedModifierModel implements AppliedModifierModel {
  const _AppliedModifierModel({required this.modifierId, required this.name, required this.priceDelta});
  factory _AppliedModifierModel.fromJson(Map<String, dynamic> json) => _$AppliedModifierModelFromJson(json);

@override final  String modifierId;
@override final  String name;
@override final  double priceDelta;

/// Create a copy of AppliedModifierModel
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$AppliedModifierModelCopyWith<_AppliedModifierModel> get copyWith => __$AppliedModifierModelCopyWithImpl<_AppliedModifierModel>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$AppliedModifierModelToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _AppliedModifierModel&&(identical(other.modifierId, modifierId) || other.modifierId == modifierId)&&(identical(other.name, name) || other.name == name)&&(identical(other.priceDelta, priceDelta) || other.priceDelta == priceDelta));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,modifierId,name,priceDelta);

@override
String toString() {
  return 'AppliedModifierModel(modifierId: $modifierId, name: $name, priceDelta: $priceDelta)';
}


}

/// @nodoc
abstract mixin class _$AppliedModifierModelCopyWith<$Res> implements $AppliedModifierModelCopyWith<$Res> {
  factory _$AppliedModifierModelCopyWith(_AppliedModifierModel value, $Res Function(_AppliedModifierModel) _then) = __$AppliedModifierModelCopyWithImpl;
@override @useResult
$Res call({
 String modifierId, String name, double priceDelta
});




}
/// @nodoc
class __$AppliedModifierModelCopyWithImpl<$Res>
    implements _$AppliedModifierModelCopyWith<$Res> {
  __$AppliedModifierModelCopyWithImpl(this._self, this._then);

  final _AppliedModifierModel _self;
  final $Res Function(_AppliedModifierModel) _then;

/// Create a copy of AppliedModifierModel
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? modifierId = null,Object? name = null,Object? priceDelta = null,}) {
  return _then(_AppliedModifierModel(
modifierId: null == modifierId ? _self.modifierId : modifierId // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,priceDelta: null == priceDelta ? _self.priceDelta : priceDelta // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$KitchenOrderItemModel {

 String get id; String get productId; String get productName; String? get sizeName; int get quantity; List<AppliedModifierModel> get modifiers; String? get notes;
/// Create a copy of KitchenOrderItemModel
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$KitchenOrderItemModelCopyWith<KitchenOrderItemModel> get copyWith => _$KitchenOrderItemModelCopyWithImpl<KitchenOrderItemModel>(this as KitchenOrderItemModel, _$identity);

  /// Serializes this KitchenOrderItemModel to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is KitchenOrderItemModel&&(identical(other.id, id) || other.id == id)&&(identical(other.productId, productId) || other.productId == productId)&&(identical(other.productName, productName) || other.productName == productName)&&(identical(other.sizeName, sizeName) || other.sizeName == sizeName)&&(identical(other.quantity, quantity) || other.quantity == quantity)&&const DeepCollectionEquality().equals(other.modifiers, modifiers)&&(identical(other.notes, notes) || other.notes == notes));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,productId,productName,sizeName,quantity,const DeepCollectionEquality().hash(modifiers),notes);

@override
String toString() {
  return 'KitchenOrderItemModel(id: $id, productId: $productId, productName: $productName, sizeName: $sizeName, quantity: $quantity, modifiers: $modifiers, notes: $notes)';
}


}

/// @nodoc
abstract mixin class $KitchenOrderItemModelCopyWith<$Res>  {
  factory $KitchenOrderItemModelCopyWith(KitchenOrderItemModel value, $Res Function(KitchenOrderItemModel) _then) = _$KitchenOrderItemModelCopyWithImpl;
@useResult
$Res call({
 String id, String productId, String productName, String? sizeName, int quantity, List<AppliedModifierModel> modifiers, String? notes
});




}
/// @nodoc
class _$KitchenOrderItemModelCopyWithImpl<$Res>
    implements $KitchenOrderItemModelCopyWith<$Res> {
  _$KitchenOrderItemModelCopyWithImpl(this._self, this._then);

  final KitchenOrderItemModel _self;
  final $Res Function(KitchenOrderItemModel) _then;

/// Create a copy of KitchenOrderItemModel
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? productId = null,Object? productName = null,Object? sizeName = freezed,Object? quantity = null,Object? modifiers = null,Object? notes = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,productId: null == productId ? _self.productId : productId // ignore: cast_nullable_to_non_nullable
as String,productName: null == productName ? _self.productName : productName // ignore: cast_nullable_to_non_nullable
as String,sizeName: freezed == sizeName ? _self.sizeName : sizeName // ignore: cast_nullable_to_non_nullable
as String?,quantity: null == quantity ? _self.quantity : quantity // ignore: cast_nullable_to_non_nullable
as int,modifiers: null == modifiers ? _self.modifiers : modifiers // ignore: cast_nullable_to_non_nullable
as List<AppliedModifierModel>,notes: freezed == notes ? _self.notes : notes // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [KitchenOrderItemModel].
extension KitchenOrderItemModelPatterns on KitchenOrderItemModel {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _KitchenOrderItemModel value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _KitchenOrderItemModel() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _KitchenOrderItemModel value)  $default,){
final _that = this;
switch (_that) {
case _KitchenOrderItemModel():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _KitchenOrderItemModel value)?  $default,){
final _that = this;
switch (_that) {
case _KitchenOrderItemModel() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String productId,  String productName,  String? sizeName,  int quantity,  List<AppliedModifierModel> modifiers,  String? notes)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _KitchenOrderItemModel() when $default != null:
return $default(_that.id,_that.productId,_that.productName,_that.sizeName,_that.quantity,_that.modifiers,_that.notes);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String productId,  String productName,  String? sizeName,  int quantity,  List<AppliedModifierModel> modifiers,  String? notes)  $default,) {final _that = this;
switch (_that) {
case _KitchenOrderItemModel():
return $default(_that.id,_that.productId,_that.productName,_that.sizeName,_that.quantity,_that.modifiers,_that.notes);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String productId,  String productName,  String? sizeName,  int quantity,  List<AppliedModifierModel> modifiers,  String? notes)?  $default,) {final _that = this;
switch (_that) {
case _KitchenOrderItemModel() when $default != null:
return $default(_that.id,_that.productId,_that.productName,_that.sizeName,_that.quantity,_that.modifiers,_that.notes);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _KitchenOrderItemModel implements KitchenOrderItemModel {
  const _KitchenOrderItemModel({required this.id, required this.productId, required this.productName, this.sizeName, required this.quantity, final  List<AppliedModifierModel> modifiers = const [], this.notes}): _modifiers = modifiers;
  factory _KitchenOrderItemModel.fromJson(Map<String, dynamic> json) => _$KitchenOrderItemModelFromJson(json);

@override final  String id;
@override final  String productId;
@override final  String productName;
@override final  String? sizeName;
@override final  int quantity;
 final  List<AppliedModifierModel> _modifiers;
@override@JsonKey() List<AppliedModifierModel> get modifiers {
  if (_modifiers is EqualUnmodifiableListView) return _modifiers;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_modifiers);
}

@override final  String? notes;

/// Create a copy of KitchenOrderItemModel
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$KitchenOrderItemModelCopyWith<_KitchenOrderItemModel> get copyWith => __$KitchenOrderItemModelCopyWithImpl<_KitchenOrderItemModel>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$KitchenOrderItemModelToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _KitchenOrderItemModel&&(identical(other.id, id) || other.id == id)&&(identical(other.productId, productId) || other.productId == productId)&&(identical(other.productName, productName) || other.productName == productName)&&(identical(other.sizeName, sizeName) || other.sizeName == sizeName)&&(identical(other.quantity, quantity) || other.quantity == quantity)&&const DeepCollectionEquality().equals(other._modifiers, _modifiers)&&(identical(other.notes, notes) || other.notes == notes));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,productId,productName,sizeName,quantity,const DeepCollectionEquality().hash(_modifiers),notes);

@override
String toString() {
  return 'KitchenOrderItemModel(id: $id, productId: $productId, productName: $productName, sizeName: $sizeName, quantity: $quantity, modifiers: $modifiers, notes: $notes)';
}


}

/// @nodoc
abstract mixin class _$KitchenOrderItemModelCopyWith<$Res> implements $KitchenOrderItemModelCopyWith<$Res> {
  factory _$KitchenOrderItemModelCopyWith(_KitchenOrderItemModel value, $Res Function(_KitchenOrderItemModel) _then) = __$KitchenOrderItemModelCopyWithImpl;
@override @useResult
$Res call({
 String id, String productId, String productName, String? sizeName, int quantity, List<AppliedModifierModel> modifiers, String? notes
});




}
/// @nodoc
class __$KitchenOrderItemModelCopyWithImpl<$Res>
    implements _$KitchenOrderItemModelCopyWith<$Res> {
  __$KitchenOrderItemModelCopyWithImpl(this._self, this._then);

  final _KitchenOrderItemModel _self;
  final $Res Function(_KitchenOrderItemModel) _then;

/// Create a copy of KitchenOrderItemModel
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? productId = null,Object? productName = null,Object? sizeName = freezed,Object? quantity = null,Object? modifiers = null,Object? notes = freezed,}) {
  return _then(_KitchenOrderItemModel(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,productId: null == productId ? _self.productId : productId // ignore: cast_nullable_to_non_nullable
as String,productName: null == productName ? _self.productName : productName // ignore: cast_nullable_to_non_nullable
as String,sizeName: freezed == sizeName ? _self.sizeName : sizeName // ignore: cast_nullable_to_non_nullable
as String?,quantity: null == quantity ? _self.quantity : quantity // ignore: cast_nullable_to_non_nullable
as int,modifiers: null == modifiers ? _self._modifiers : modifiers // ignore: cast_nullable_to_non_nullable
as List<AppliedModifierModel>,notes: freezed == notes ? _self.notes : notes // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

// dart format on
