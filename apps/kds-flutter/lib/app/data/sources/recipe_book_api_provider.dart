import 'package:kds/app/core/constants/endpoints.dart';
import 'package:kds/app/core/network/dio_http_provider.dart';
import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/recipe_book/recipe_book_models.dart';

/// Cliente HTTP de la biblia de productos: `GET /recipe-book` (@KitchenAccess).
class RecipeBookApiProvider {
  RecipeBookApiProvider({required DioHttpProvider http}) : _http = http;

  final DioHttpProvider _http;

  Future<Either<Failure, RecipeBookModel>> getRecipeBook() {
    return _http.get<RecipeBookModel>(
      Endpoints.recipeBook,
      converter: (json) => RecipeBookModel.fromJson(json as Map<String, dynamic>),
    );
  }
}
