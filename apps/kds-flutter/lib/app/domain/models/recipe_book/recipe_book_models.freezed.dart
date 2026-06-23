// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'recipe_book_models.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$RecipeComponentModel {

 RecipeComponentType get type; String get id; String get name; double get quantity; String get unit; double get mermaPct;
/// Create a copy of RecipeComponentModel
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$RecipeComponentModelCopyWith<RecipeComponentModel> get copyWith => _$RecipeComponentModelCopyWithImpl<RecipeComponentModel>(this as RecipeComponentModel, _$identity);

  /// Serializes this RecipeComponentModel to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is RecipeComponentModel&&(identical(other.type, type) || other.type == type)&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.quantity, quantity) || other.quantity == quantity)&&(identical(other.unit, unit) || other.unit == unit)&&(identical(other.mermaPct, mermaPct) || other.mermaPct == mermaPct));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,type,id,name,quantity,unit,mermaPct);

@override
String toString() {
  return 'RecipeComponentModel(type: $type, id: $id, name: $name, quantity: $quantity, unit: $unit, mermaPct: $mermaPct)';
}


}

/// @nodoc
abstract mixin class $RecipeComponentModelCopyWith<$Res>  {
  factory $RecipeComponentModelCopyWith(RecipeComponentModel value, $Res Function(RecipeComponentModel) _then) = _$RecipeComponentModelCopyWithImpl;
@useResult
$Res call({
 RecipeComponentType type, String id, String name, double quantity, String unit, double mermaPct
});




}
/// @nodoc
class _$RecipeComponentModelCopyWithImpl<$Res>
    implements $RecipeComponentModelCopyWith<$Res> {
  _$RecipeComponentModelCopyWithImpl(this._self, this._then);

  final RecipeComponentModel _self;
  final $Res Function(RecipeComponentModel) _then;

/// Create a copy of RecipeComponentModel
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? type = null,Object? id = null,Object? name = null,Object? quantity = null,Object? unit = null,Object? mermaPct = null,}) {
  return _then(_self.copyWith(
type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as RecipeComponentType,id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,quantity: null == quantity ? _self.quantity : quantity // ignore: cast_nullable_to_non_nullable
as double,unit: null == unit ? _self.unit : unit // ignore: cast_nullable_to_non_nullable
as String,mermaPct: null == mermaPct ? _self.mermaPct : mermaPct // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [RecipeComponentModel].
extension RecipeComponentModelPatterns on RecipeComponentModel {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _RecipeComponentModel value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _RecipeComponentModel() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _RecipeComponentModel value)  $default,){
final _that = this;
switch (_that) {
case _RecipeComponentModel():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _RecipeComponentModel value)?  $default,){
final _that = this;
switch (_that) {
case _RecipeComponentModel() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( RecipeComponentType type,  String id,  String name,  double quantity,  String unit,  double mermaPct)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _RecipeComponentModel() when $default != null:
return $default(_that.type,_that.id,_that.name,_that.quantity,_that.unit,_that.mermaPct);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( RecipeComponentType type,  String id,  String name,  double quantity,  String unit,  double mermaPct)  $default,) {final _that = this;
switch (_that) {
case _RecipeComponentModel():
return $default(_that.type,_that.id,_that.name,_that.quantity,_that.unit,_that.mermaPct);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( RecipeComponentType type,  String id,  String name,  double quantity,  String unit,  double mermaPct)?  $default,) {final _that = this;
switch (_that) {
case _RecipeComponentModel() when $default != null:
return $default(_that.type,_that.id,_that.name,_that.quantity,_that.unit,_that.mermaPct);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _RecipeComponentModel implements RecipeComponentModel {
  const _RecipeComponentModel({required this.type, required this.id, required this.name, required this.quantity, required this.unit, required this.mermaPct});
  factory _RecipeComponentModel.fromJson(Map<String, dynamic> json) => _$RecipeComponentModelFromJson(json);

@override final  RecipeComponentType type;
@override final  String id;
@override final  String name;
@override final  double quantity;
@override final  String unit;
@override final  double mermaPct;

/// Create a copy of RecipeComponentModel
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$RecipeComponentModelCopyWith<_RecipeComponentModel> get copyWith => __$RecipeComponentModelCopyWithImpl<_RecipeComponentModel>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$RecipeComponentModelToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _RecipeComponentModel&&(identical(other.type, type) || other.type == type)&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.quantity, quantity) || other.quantity == quantity)&&(identical(other.unit, unit) || other.unit == unit)&&(identical(other.mermaPct, mermaPct) || other.mermaPct == mermaPct));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,type,id,name,quantity,unit,mermaPct);

@override
String toString() {
  return 'RecipeComponentModel(type: $type, id: $id, name: $name, quantity: $quantity, unit: $unit, mermaPct: $mermaPct)';
}


}

/// @nodoc
abstract mixin class _$RecipeComponentModelCopyWith<$Res> implements $RecipeComponentModelCopyWith<$Res> {
  factory _$RecipeComponentModelCopyWith(_RecipeComponentModel value, $Res Function(_RecipeComponentModel) _then) = __$RecipeComponentModelCopyWithImpl;
@override @useResult
$Res call({
 RecipeComponentType type, String id, String name, double quantity, String unit, double mermaPct
});




}
/// @nodoc
class __$RecipeComponentModelCopyWithImpl<$Res>
    implements _$RecipeComponentModelCopyWith<$Res> {
  __$RecipeComponentModelCopyWithImpl(this._self, this._then);

  final _RecipeComponentModel _self;
  final $Res Function(_RecipeComponentModel) _then;

/// Create a copy of RecipeComponentModel
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? type = null,Object? id = null,Object? name = null,Object? quantity = null,Object? unit = null,Object? mermaPct = null,}) {
  return _then(_RecipeComponentModel(
type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as RecipeComponentType,id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,quantity: null == quantity ? _self.quantity : quantity // ignore: cast_nullable_to_non_nullable
as double,unit: null == unit ? _self.unit : unit // ignore: cast_nullable_to_non_nullable
as String,mermaPct: null == mermaPct ? _self.mermaPct : mermaPct // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$ComboItemModel {

 String get productId; String get name; double get quantity;
/// Create a copy of ComboItemModel
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ComboItemModelCopyWith<ComboItemModel> get copyWith => _$ComboItemModelCopyWithImpl<ComboItemModel>(this as ComboItemModel, _$identity);

  /// Serializes this ComboItemModel to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ComboItemModel&&(identical(other.productId, productId) || other.productId == productId)&&(identical(other.name, name) || other.name == name)&&(identical(other.quantity, quantity) || other.quantity == quantity));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,productId,name,quantity);

@override
String toString() {
  return 'ComboItemModel(productId: $productId, name: $name, quantity: $quantity)';
}


}

/// @nodoc
abstract mixin class $ComboItemModelCopyWith<$Res>  {
  factory $ComboItemModelCopyWith(ComboItemModel value, $Res Function(ComboItemModel) _then) = _$ComboItemModelCopyWithImpl;
@useResult
$Res call({
 String productId, String name, double quantity
});




}
/// @nodoc
class _$ComboItemModelCopyWithImpl<$Res>
    implements $ComboItemModelCopyWith<$Res> {
  _$ComboItemModelCopyWithImpl(this._self, this._then);

  final ComboItemModel _self;
  final $Res Function(ComboItemModel) _then;

/// Create a copy of ComboItemModel
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? productId = null,Object? name = null,Object? quantity = null,}) {
  return _then(_self.copyWith(
productId: null == productId ? _self.productId : productId // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,quantity: null == quantity ? _self.quantity : quantity // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [ComboItemModel].
extension ComboItemModelPatterns on ComboItemModel {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ComboItemModel value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ComboItemModel() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ComboItemModel value)  $default,){
final _that = this;
switch (_that) {
case _ComboItemModel():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ComboItemModel value)?  $default,){
final _that = this;
switch (_that) {
case _ComboItemModel() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String productId,  String name,  double quantity)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ComboItemModel() when $default != null:
return $default(_that.productId,_that.name,_that.quantity);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String productId,  String name,  double quantity)  $default,) {final _that = this;
switch (_that) {
case _ComboItemModel():
return $default(_that.productId,_that.name,_that.quantity);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String productId,  String name,  double quantity)?  $default,) {final _that = this;
switch (_that) {
case _ComboItemModel() when $default != null:
return $default(_that.productId,_that.name,_that.quantity);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ComboItemModel implements ComboItemModel {
  const _ComboItemModel({required this.productId, required this.name, required this.quantity});
  factory _ComboItemModel.fromJson(Map<String, dynamic> json) => _$ComboItemModelFromJson(json);

@override final  String productId;
@override final  String name;
@override final  double quantity;

/// Create a copy of ComboItemModel
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ComboItemModelCopyWith<_ComboItemModel> get copyWith => __$ComboItemModelCopyWithImpl<_ComboItemModel>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ComboItemModelToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ComboItemModel&&(identical(other.productId, productId) || other.productId == productId)&&(identical(other.name, name) || other.name == name)&&(identical(other.quantity, quantity) || other.quantity == quantity));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,productId,name,quantity);

@override
String toString() {
  return 'ComboItemModel(productId: $productId, name: $name, quantity: $quantity)';
}


}

/// @nodoc
abstract mixin class _$ComboItemModelCopyWith<$Res> implements $ComboItemModelCopyWith<$Res> {
  factory _$ComboItemModelCopyWith(_ComboItemModel value, $Res Function(_ComboItemModel) _then) = __$ComboItemModelCopyWithImpl;
@override @useResult
$Res call({
 String productId, String name, double quantity
});




}
/// @nodoc
class __$ComboItemModelCopyWithImpl<$Res>
    implements _$ComboItemModelCopyWith<$Res> {
  __$ComboItemModelCopyWithImpl(this._self, this._then);

  final _ComboItemModel _self;
  final $Res Function(_ComboItemModel) _then;

/// Create a copy of ComboItemModel
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? productId = null,Object? name = null,Object? quantity = null,}) {
  return _then(_ComboItemModel(
productId: null == productId ? _self.productId : productId // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,quantity: null == quantity ? _self.quantity : quantity // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$RecipeBookEntryModel {

 RecipeEntryKind get kind; String get id; String get name; String? get category; String? get imageUrl; String? get description; bool get isCombo; double? get yield; String? get unit; List<RecipeComponentModel> get components; List<ComboItemModel> get comboItems; List<String> get preparationSteps;
/// Create a copy of RecipeBookEntryModel
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$RecipeBookEntryModelCopyWith<RecipeBookEntryModel> get copyWith => _$RecipeBookEntryModelCopyWithImpl<RecipeBookEntryModel>(this as RecipeBookEntryModel, _$identity);

  /// Serializes this RecipeBookEntryModel to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is RecipeBookEntryModel&&(identical(other.kind, kind) || other.kind == kind)&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.category, category) || other.category == category)&&(identical(other.imageUrl, imageUrl) || other.imageUrl == imageUrl)&&(identical(other.description, description) || other.description == description)&&(identical(other.isCombo, isCombo) || other.isCombo == isCombo)&&(identical(other.yield, yield) || other.yield == yield)&&(identical(other.unit, unit) || other.unit == unit)&&const DeepCollectionEquality().equals(other.components, components)&&const DeepCollectionEquality().equals(other.comboItems, comboItems)&&const DeepCollectionEquality().equals(other.preparationSteps, preparationSteps));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,kind,id,name,category,imageUrl,description,isCombo,yield,unit,const DeepCollectionEquality().hash(components),const DeepCollectionEquality().hash(comboItems),const DeepCollectionEquality().hash(preparationSteps));

@override
String toString() {
  return 'RecipeBookEntryModel(kind: $kind, id: $id, name: $name, category: $category, imageUrl: $imageUrl, description: $description, isCombo: $isCombo, yield: $yield, unit: $unit, components: $components, comboItems: $comboItems, preparationSteps: $preparationSteps)';
}


}

/// @nodoc
abstract mixin class $RecipeBookEntryModelCopyWith<$Res>  {
  factory $RecipeBookEntryModelCopyWith(RecipeBookEntryModel value, $Res Function(RecipeBookEntryModel) _then) = _$RecipeBookEntryModelCopyWithImpl;
@useResult
$Res call({
 RecipeEntryKind kind, String id, String name, String? category, String? imageUrl, String? description, bool isCombo, double? yield, String? unit, List<RecipeComponentModel> components, List<ComboItemModel> comboItems, List<String> preparationSteps
});




}
/// @nodoc
class _$RecipeBookEntryModelCopyWithImpl<$Res>
    implements $RecipeBookEntryModelCopyWith<$Res> {
  _$RecipeBookEntryModelCopyWithImpl(this._self, this._then);

  final RecipeBookEntryModel _self;
  final $Res Function(RecipeBookEntryModel) _then;

/// Create a copy of RecipeBookEntryModel
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? kind = null,Object? id = null,Object? name = null,Object? category = freezed,Object? imageUrl = freezed,Object? description = freezed,Object? isCombo = null,Object? yield = freezed,Object? unit = freezed,Object? components = null,Object? comboItems = null,Object? preparationSteps = null,}) {
  return _then(_self.copyWith(
kind: null == kind ? _self.kind : kind // ignore: cast_nullable_to_non_nullable
as RecipeEntryKind,id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,category: freezed == category ? _self.category : category // ignore: cast_nullable_to_non_nullable
as String?,imageUrl: freezed == imageUrl ? _self.imageUrl : imageUrl // ignore: cast_nullable_to_non_nullable
as String?,description: freezed == description ? _self.description : description // ignore: cast_nullable_to_non_nullable
as String?,isCombo: null == isCombo ? _self.isCombo : isCombo // ignore: cast_nullable_to_non_nullable
as bool,yield: freezed == yield ? _self.yield : yield // ignore: cast_nullable_to_non_nullable
as double?,unit: freezed == unit ? _self.unit : unit // ignore: cast_nullable_to_non_nullable
as String?,components: null == components ? _self.components : components // ignore: cast_nullable_to_non_nullable
as List<RecipeComponentModel>,comboItems: null == comboItems ? _self.comboItems : comboItems // ignore: cast_nullable_to_non_nullable
as List<ComboItemModel>,preparationSteps: null == preparationSteps ? _self.preparationSteps : preparationSteps // ignore: cast_nullable_to_non_nullable
as List<String>,
  ));
}

}


/// Adds pattern-matching-related methods to [RecipeBookEntryModel].
extension RecipeBookEntryModelPatterns on RecipeBookEntryModel {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _RecipeBookEntryModel value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _RecipeBookEntryModel() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _RecipeBookEntryModel value)  $default,){
final _that = this;
switch (_that) {
case _RecipeBookEntryModel():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _RecipeBookEntryModel value)?  $default,){
final _that = this;
switch (_that) {
case _RecipeBookEntryModel() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( RecipeEntryKind kind,  String id,  String name,  String? category,  String? imageUrl,  String? description,  bool isCombo,  double? yield,  String? unit,  List<RecipeComponentModel> components,  List<ComboItemModel> comboItems,  List<String> preparationSteps)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _RecipeBookEntryModel() when $default != null:
return $default(_that.kind,_that.id,_that.name,_that.category,_that.imageUrl,_that.description,_that.isCombo,_that.yield,_that.unit,_that.components,_that.comboItems,_that.preparationSteps);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( RecipeEntryKind kind,  String id,  String name,  String? category,  String? imageUrl,  String? description,  bool isCombo,  double? yield,  String? unit,  List<RecipeComponentModel> components,  List<ComboItemModel> comboItems,  List<String> preparationSteps)  $default,) {final _that = this;
switch (_that) {
case _RecipeBookEntryModel():
return $default(_that.kind,_that.id,_that.name,_that.category,_that.imageUrl,_that.description,_that.isCombo,_that.yield,_that.unit,_that.components,_that.comboItems,_that.preparationSteps);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( RecipeEntryKind kind,  String id,  String name,  String? category,  String? imageUrl,  String? description,  bool isCombo,  double? yield,  String? unit,  List<RecipeComponentModel> components,  List<ComboItemModel> comboItems,  List<String> preparationSteps)?  $default,) {final _that = this;
switch (_that) {
case _RecipeBookEntryModel() when $default != null:
return $default(_that.kind,_that.id,_that.name,_that.category,_that.imageUrl,_that.description,_that.isCombo,_that.yield,_that.unit,_that.components,_that.comboItems,_that.preparationSteps);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _RecipeBookEntryModel implements RecipeBookEntryModel {
  const _RecipeBookEntryModel({required this.kind, required this.id, required this.name, this.category, this.imageUrl, this.description, required this.isCombo, this.yield, this.unit, final  List<RecipeComponentModel> components = const [], final  List<ComboItemModel> comboItems = const [], final  List<String> preparationSteps = const []}): _components = components,_comboItems = comboItems,_preparationSteps = preparationSteps;
  factory _RecipeBookEntryModel.fromJson(Map<String, dynamic> json) => _$RecipeBookEntryModelFromJson(json);

@override final  RecipeEntryKind kind;
@override final  String id;
@override final  String name;
@override final  String? category;
@override final  String? imageUrl;
@override final  String? description;
@override final  bool isCombo;
@override final  double? yield;
@override final  String? unit;
 final  List<RecipeComponentModel> _components;
@override@JsonKey() List<RecipeComponentModel> get components {
  if (_components is EqualUnmodifiableListView) return _components;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_components);
}

 final  List<ComboItemModel> _comboItems;
@override@JsonKey() List<ComboItemModel> get comboItems {
  if (_comboItems is EqualUnmodifiableListView) return _comboItems;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_comboItems);
}

 final  List<String> _preparationSteps;
@override@JsonKey() List<String> get preparationSteps {
  if (_preparationSteps is EqualUnmodifiableListView) return _preparationSteps;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_preparationSteps);
}


/// Create a copy of RecipeBookEntryModel
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$RecipeBookEntryModelCopyWith<_RecipeBookEntryModel> get copyWith => __$RecipeBookEntryModelCopyWithImpl<_RecipeBookEntryModel>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$RecipeBookEntryModelToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _RecipeBookEntryModel&&(identical(other.kind, kind) || other.kind == kind)&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.category, category) || other.category == category)&&(identical(other.imageUrl, imageUrl) || other.imageUrl == imageUrl)&&(identical(other.description, description) || other.description == description)&&(identical(other.isCombo, isCombo) || other.isCombo == isCombo)&&(identical(other.yield, yield) || other.yield == yield)&&(identical(other.unit, unit) || other.unit == unit)&&const DeepCollectionEquality().equals(other._components, _components)&&const DeepCollectionEquality().equals(other._comboItems, _comboItems)&&const DeepCollectionEquality().equals(other._preparationSteps, _preparationSteps));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,kind,id,name,category,imageUrl,description,isCombo,yield,unit,const DeepCollectionEquality().hash(_components),const DeepCollectionEquality().hash(_comboItems),const DeepCollectionEquality().hash(_preparationSteps));

@override
String toString() {
  return 'RecipeBookEntryModel(kind: $kind, id: $id, name: $name, category: $category, imageUrl: $imageUrl, description: $description, isCombo: $isCombo, yield: $yield, unit: $unit, components: $components, comboItems: $comboItems, preparationSteps: $preparationSteps)';
}


}

/// @nodoc
abstract mixin class _$RecipeBookEntryModelCopyWith<$Res> implements $RecipeBookEntryModelCopyWith<$Res> {
  factory _$RecipeBookEntryModelCopyWith(_RecipeBookEntryModel value, $Res Function(_RecipeBookEntryModel) _then) = __$RecipeBookEntryModelCopyWithImpl;
@override @useResult
$Res call({
 RecipeEntryKind kind, String id, String name, String? category, String? imageUrl, String? description, bool isCombo, double? yield, String? unit, List<RecipeComponentModel> components, List<ComboItemModel> comboItems, List<String> preparationSteps
});




}
/// @nodoc
class __$RecipeBookEntryModelCopyWithImpl<$Res>
    implements _$RecipeBookEntryModelCopyWith<$Res> {
  __$RecipeBookEntryModelCopyWithImpl(this._self, this._then);

  final _RecipeBookEntryModel _self;
  final $Res Function(_RecipeBookEntryModel) _then;

/// Create a copy of RecipeBookEntryModel
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? kind = null,Object? id = null,Object? name = null,Object? category = freezed,Object? imageUrl = freezed,Object? description = freezed,Object? isCombo = null,Object? yield = freezed,Object? unit = freezed,Object? components = null,Object? comboItems = null,Object? preparationSteps = null,}) {
  return _then(_RecipeBookEntryModel(
kind: null == kind ? _self.kind : kind // ignore: cast_nullable_to_non_nullable
as RecipeEntryKind,id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,category: freezed == category ? _self.category : category // ignore: cast_nullable_to_non_nullable
as String?,imageUrl: freezed == imageUrl ? _self.imageUrl : imageUrl // ignore: cast_nullable_to_non_nullable
as String?,description: freezed == description ? _self.description : description // ignore: cast_nullable_to_non_nullable
as String?,isCombo: null == isCombo ? _self.isCombo : isCombo // ignore: cast_nullable_to_non_nullable
as bool,yield: freezed == yield ? _self.yield : yield // ignore: cast_nullable_to_non_nullable
as double?,unit: freezed == unit ? _self.unit : unit // ignore: cast_nullable_to_non_nullable
as String?,components: null == components ? _self._components : components // ignore: cast_nullable_to_non_nullable
as List<RecipeComponentModel>,comboItems: null == comboItems ? _self._comboItems : comboItems // ignore: cast_nullable_to_non_nullable
as List<ComboItemModel>,preparationSteps: null == preparationSteps ? _self._preparationSteps : preparationSteps // ignore: cast_nullable_to_non_nullable
as List<String>,
  ));
}


}


/// @nodoc
mixin _$RecipeBookModel {

 List<RecipeBookEntryModel> get products; List<RecipeBookEntryModel> get subproducts;
/// Create a copy of RecipeBookModel
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$RecipeBookModelCopyWith<RecipeBookModel> get copyWith => _$RecipeBookModelCopyWithImpl<RecipeBookModel>(this as RecipeBookModel, _$identity);

  /// Serializes this RecipeBookModel to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is RecipeBookModel&&const DeepCollectionEquality().equals(other.products, products)&&const DeepCollectionEquality().equals(other.subproducts, subproducts));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(products),const DeepCollectionEquality().hash(subproducts));

@override
String toString() {
  return 'RecipeBookModel(products: $products, subproducts: $subproducts)';
}


}

/// @nodoc
abstract mixin class $RecipeBookModelCopyWith<$Res>  {
  factory $RecipeBookModelCopyWith(RecipeBookModel value, $Res Function(RecipeBookModel) _then) = _$RecipeBookModelCopyWithImpl;
@useResult
$Res call({
 List<RecipeBookEntryModel> products, List<RecipeBookEntryModel> subproducts
});




}
/// @nodoc
class _$RecipeBookModelCopyWithImpl<$Res>
    implements $RecipeBookModelCopyWith<$Res> {
  _$RecipeBookModelCopyWithImpl(this._self, this._then);

  final RecipeBookModel _self;
  final $Res Function(RecipeBookModel) _then;

/// Create a copy of RecipeBookModel
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? products = null,Object? subproducts = null,}) {
  return _then(_self.copyWith(
products: null == products ? _self.products : products // ignore: cast_nullable_to_non_nullable
as List<RecipeBookEntryModel>,subproducts: null == subproducts ? _self.subproducts : subproducts // ignore: cast_nullable_to_non_nullable
as List<RecipeBookEntryModel>,
  ));
}

}


/// Adds pattern-matching-related methods to [RecipeBookModel].
extension RecipeBookModelPatterns on RecipeBookModel {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _RecipeBookModel value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _RecipeBookModel() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _RecipeBookModel value)  $default,){
final _that = this;
switch (_that) {
case _RecipeBookModel():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _RecipeBookModel value)?  $default,){
final _that = this;
switch (_that) {
case _RecipeBookModel() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( List<RecipeBookEntryModel> products,  List<RecipeBookEntryModel> subproducts)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _RecipeBookModel() when $default != null:
return $default(_that.products,_that.subproducts);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( List<RecipeBookEntryModel> products,  List<RecipeBookEntryModel> subproducts)  $default,) {final _that = this;
switch (_that) {
case _RecipeBookModel():
return $default(_that.products,_that.subproducts);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( List<RecipeBookEntryModel> products,  List<RecipeBookEntryModel> subproducts)?  $default,) {final _that = this;
switch (_that) {
case _RecipeBookModel() when $default != null:
return $default(_that.products,_that.subproducts);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _RecipeBookModel implements RecipeBookModel {
  const _RecipeBookModel({final  List<RecipeBookEntryModel> products = const [], final  List<RecipeBookEntryModel> subproducts = const []}): _products = products,_subproducts = subproducts;
  factory _RecipeBookModel.fromJson(Map<String, dynamic> json) => _$RecipeBookModelFromJson(json);

 final  List<RecipeBookEntryModel> _products;
@override@JsonKey() List<RecipeBookEntryModel> get products {
  if (_products is EqualUnmodifiableListView) return _products;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_products);
}

 final  List<RecipeBookEntryModel> _subproducts;
@override@JsonKey() List<RecipeBookEntryModel> get subproducts {
  if (_subproducts is EqualUnmodifiableListView) return _subproducts;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_subproducts);
}


/// Create a copy of RecipeBookModel
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$RecipeBookModelCopyWith<_RecipeBookModel> get copyWith => __$RecipeBookModelCopyWithImpl<_RecipeBookModel>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$RecipeBookModelToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _RecipeBookModel&&const DeepCollectionEquality().equals(other._products, _products)&&const DeepCollectionEquality().equals(other._subproducts, _subproducts));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(_products),const DeepCollectionEquality().hash(_subproducts));

@override
String toString() {
  return 'RecipeBookModel(products: $products, subproducts: $subproducts)';
}


}

/// @nodoc
abstract mixin class _$RecipeBookModelCopyWith<$Res> implements $RecipeBookModelCopyWith<$Res> {
  factory _$RecipeBookModelCopyWith(_RecipeBookModel value, $Res Function(_RecipeBookModel) _then) = __$RecipeBookModelCopyWithImpl;
@override @useResult
$Res call({
 List<RecipeBookEntryModel> products, List<RecipeBookEntryModel> subproducts
});




}
/// @nodoc
class __$RecipeBookModelCopyWithImpl<$Res>
    implements _$RecipeBookModelCopyWith<$Res> {
  __$RecipeBookModelCopyWithImpl(this._self, this._then);

  final _RecipeBookModel _self;
  final $Res Function(_RecipeBookModel) _then;

/// Create a copy of RecipeBookModel
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? products = null,Object? subproducts = null,}) {
  return _then(_RecipeBookModel(
products: null == products ? _self._products : products // ignore: cast_nullable_to_non_nullable
as List<RecipeBookEntryModel>,subproducts: null == subproducts ? _self._subproducts : subproducts // ignore: cast_nullable_to_non_nullable
as List<RecipeBookEntryModel>,
  ));
}


}

// dart format on
