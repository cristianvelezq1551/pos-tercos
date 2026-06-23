import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/recipe_book/recipe_book_models.dart';

abstract class RecipeBookRepository {
  /// Trae la biblia: productos + subproductos con composición y paso a paso.
  Future<Either<Failure, RecipeBookModel>> getRecipeBook();
}
