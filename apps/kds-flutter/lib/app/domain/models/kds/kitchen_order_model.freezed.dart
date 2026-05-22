// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'kitchen_order_model.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$KitchenOrderModel {

 String get id; int get receiptNumber; OrderType get type; KitchenStatus get status; String? get customerName; String? get notes; DateTime? get paidAt; DateTime get createdAt; List<KitchenOrderItemModel> get items;
/// Create a copy of KitchenOrderModel
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$KitchenOrderModelCopyWith<KitchenOrderModel> get copyWith => _$KitchenOrderModelCopyWithImpl<KitchenOrderModel>(this as KitchenOrderModel, _$identity);

  /// Serializes this KitchenOrderModel to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is KitchenOrderModel&&(identical(other.id, id) || other.id == id)&&(identical(other.receiptNumber, receiptNumber) || other.receiptNumber == receiptNumber)&&(identical(other.type, type) || other.type == type)&&(identical(other.status, status) || other.status == status)&&(identical(other.customerName, customerName) || other.customerName == customerName)&&(identical(other.notes, notes) || other.notes == notes)&&(identical(other.paidAt, paidAt) || other.paidAt == paidAt)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&const DeepCollectionEquality().equals(other.items, items));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,receiptNumber,type,status,customerName,notes,paidAt,createdAt,const DeepCollectionEquality().hash(items));

@override
String toString() {
  return 'KitchenOrderModel(id: $id, receiptNumber: $receiptNumber, type: $type, status: $status, customerName: $customerName, notes: $notes, paidAt: $paidAt, createdAt: $createdAt, items: $items)';
}


}

/// @nodoc
abstract mixin class $KitchenOrderModelCopyWith<$Res>  {
  factory $KitchenOrderModelCopyWith(KitchenOrderModel value, $Res Function(KitchenOrderModel) _then) = _$KitchenOrderModelCopyWithImpl;
@useResult
$Res call({
 String id, int receiptNumber, OrderType type, KitchenStatus status, String? customerName, String? notes, DateTime? paidAt, DateTime createdAt, List<KitchenOrderItemModel> items
});




}
/// @nodoc
class _$KitchenOrderModelCopyWithImpl<$Res>
    implements $KitchenOrderModelCopyWith<$Res> {
  _$KitchenOrderModelCopyWithImpl(this._self, this._then);

  final KitchenOrderModel _self;
  final $Res Function(KitchenOrderModel) _then;

/// Create a copy of KitchenOrderModel
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? receiptNumber = null,Object? type = null,Object? status = null,Object? customerName = freezed,Object? notes = freezed,Object? paidAt = freezed,Object? createdAt = null,Object? items = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,receiptNumber: null == receiptNumber ? _self.receiptNumber : receiptNumber // ignore: cast_nullable_to_non_nullable
as int,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as OrderType,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as KitchenStatus,customerName: freezed == customerName ? _self.customerName : customerName // ignore: cast_nullable_to_non_nullable
as String?,notes: freezed == notes ? _self.notes : notes // ignore: cast_nullable_to_non_nullable
as String?,paidAt: freezed == paidAt ? _self.paidAt : paidAt // ignore: cast_nullable_to_non_nullable
as DateTime?,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime,items: null == items ? _self.items : items // ignore: cast_nullable_to_non_nullable
as List<KitchenOrderItemModel>,
  ));
}

}


/// Adds pattern-matching-related methods to [KitchenOrderModel].
extension KitchenOrderModelPatterns on KitchenOrderModel {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _KitchenOrderModel value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _KitchenOrderModel() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _KitchenOrderModel value)  $default,){
final _that = this;
switch (_that) {
case _KitchenOrderModel():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _KitchenOrderModel value)?  $default,){
final _that = this;
switch (_that) {
case _KitchenOrderModel() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  int receiptNumber,  OrderType type,  KitchenStatus status,  String? customerName,  String? notes,  DateTime? paidAt,  DateTime createdAt,  List<KitchenOrderItemModel> items)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _KitchenOrderModel() when $default != null:
return $default(_that.id,_that.receiptNumber,_that.type,_that.status,_that.customerName,_that.notes,_that.paidAt,_that.createdAt,_that.items);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  int receiptNumber,  OrderType type,  KitchenStatus status,  String? customerName,  String? notes,  DateTime? paidAt,  DateTime createdAt,  List<KitchenOrderItemModel> items)  $default,) {final _that = this;
switch (_that) {
case _KitchenOrderModel():
return $default(_that.id,_that.receiptNumber,_that.type,_that.status,_that.customerName,_that.notes,_that.paidAt,_that.createdAt,_that.items);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  int receiptNumber,  OrderType type,  KitchenStatus status,  String? customerName,  String? notes,  DateTime? paidAt,  DateTime createdAt,  List<KitchenOrderItemModel> items)?  $default,) {final _that = this;
switch (_that) {
case _KitchenOrderModel() when $default != null:
return $default(_that.id,_that.receiptNumber,_that.type,_that.status,_that.customerName,_that.notes,_that.paidAt,_that.createdAt,_that.items);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _KitchenOrderModel implements KitchenOrderModel {
  const _KitchenOrderModel({required this.id, required this.receiptNumber, required this.type, required this.status, this.customerName, this.notes, this.paidAt, required this.createdAt, final  List<KitchenOrderItemModel> items = const []}): _items = items;
  factory _KitchenOrderModel.fromJson(Map<String, dynamic> json) => _$KitchenOrderModelFromJson(json);

@override final  String id;
@override final  int receiptNumber;
@override final  OrderType type;
@override final  KitchenStatus status;
@override final  String? customerName;
@override final  String? notes;
@override final  DateTime? paidAt;
@override final  DateTime createdAt;
 final  List<KitchenOrderItemModel> _items;
@override@JsonKey() List<KitchenOrderItemModel> get items {
  if (_items is EqualUnmodifiableListView) return _items;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_items);
}


/// Create a copy of KitchenOrderModel
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$KitchenOrderModelCopyWith<_KitchenOrderModel> get copyWith => __$KitchenOrderModelCopyWithImpl<_KitchenOrderModel>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$KitchenOrderModelToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _KitchenOrderModel&&(identical(other.id, id) || other.id == id)&&(identical(other.receiptNumber, receiptNumber) || other.receiptNumber == receiptNumber)&&(identical(other.type, type) || other.type == type)&&(identical(other.status, status) || other.status == status)&&(identical(other.customerName, customerName) || other.customerName == customerName)&&(identical(other.notes, notes) || other.notes == notes)&&(identical(other.paidAt, paidAt) || other.paidAt == paidAt)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&const DeepCollectionEquality().equals(other._items, _items));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,receiptNumber,type,status,customerName,notes,paidAt,createdAt,const DeepCollectionEquality().hash(_items));

@override
String toString() {
  return 'KitchenOrderModel(id: $id, receiptNumber: $receiptNumber, type: $type, status: $status, customerName: $customerName, notes: $notes, paidAt: $paidAt, createdAt: $createdAt, items: $items)';
}


}

/// @nodoc
abstract mixin class _$KitchenOrderModelCopyWith<$Res> implements $KitchenOrderModelCopyWith<$Res> {
  factory _$KitchenOrderModelCopyWith(_KitchenOrderModel value, $Res Function(_KitchenOrderModel) _then) = __$KitchenOrderModelCopyWithImpl;
@override @useResult
$Res call({
 String id, int receiptNumber, OrderType type, KitchenStatus status, String? customerName, String? notes, DateTime? paidAt, DateTime createdAt, List<KitchenOrderItemModel> items
});




}
/// @nodoc
class __$KitchenOrderModelCopyWithImpl<$Res>
    implements _$KitchenOrderModelCopyWith<$Res> {
  __$KitchenOrderModelCopyWithImpl(this._self, this._then);

  final _KitchenOrderModel _self;
  final $Res Function(_KitchenOrderModel) _then;

/// Create a copy of KitchenOrderModel
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? receiptNumber = null,Object? type = null,Object? status = null,Object? customerName = freezed,Object? notes = freezed,Object? paidAt = freezed,Object? createdAt = null,Object? items = null,}) {
  return _then(_KitchenOrderModel(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,receiptNumber: null == receiptNumber ? _self.receiptNumber : receiptNumber // ignore: cast_nullable_to_non_nullable
as int,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as OrderType,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as KitchenStatus,customerName: freezed == customerName ? _self.customerName : customerName // ignore: cast_nullable_to_non_nullable
as String?,notes: freezed == notes ? _self.notes : notes // ignore: cast_nullable_to_non_nullable
as String?,paidAt: freezed == paidAt ? _self.paidAt : paidAt // ignore: cast_nullable_to_non_nullable
as DateTime?,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime,items: null == items ? _self._items : items // ignore: cast_nullable_to_non_nullable
as List<KitchenOrderItemModel>,
  ));
}


}

// dart format on
