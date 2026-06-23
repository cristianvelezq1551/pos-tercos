import 'package:kds/app/core/network/dio_http_provider.dart';
import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/data/sources/recipe_book_api_provider.dart';
import 'package:kds/app/domain/models/recipe_book/recipe_book_models.dart';
import 'package:kds/app/domain/repositories/recipe_book_repository.dart';

class RecipeBookRepositoryImpl implements RecipeBookRepository {
  RecipeBookRepositoryImpl({required DioHttpProvider http})
      : _provider = RecipeBookApiProvider(http: http);

  final RecipeBookApiProvider _provider;

  @override
  Future<Either<Failure, RecipeBookModel>> getRecipeBook() =>
      _provider.getRecipeBook();
}
