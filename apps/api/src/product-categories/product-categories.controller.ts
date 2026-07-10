import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateProductCategorySchema,
  UpdateProductCategorySchema,
  type CreateProductCategory,
  type JwtAccessPayload,
  type ProductCategory,
  type UpdateProductCategory,
} from '@pos-tercos/types';
import { AdminAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProductCategoriesService } from './product-categories.service';

@AdminAccess()
@Controller('product-categories')
export class ProductCategoriesController {
  constructor(private readonly categories: ProductCategoriesService) {}

  @Get()
  list(@Query('only_active') onlyActive?: string): Promise<ProductCategory[]> {
    return this.categories.list({ onlyActive: onlyActive === 'true' });
  }

  @OnlyDueno()
  @Post()
  create(
    @Body(new ZodValidationPipe(CreateProductCategorySchema)) body: CreateProductCategory,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<ProductCategory> {
    return this.categories.create(body, user.sub);
  }

  @OnlyDueno()
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateProductCategorySchema)) body: UpdateProductCategory,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<ProductCategory> {
    return this.categories.update(id, body, user.sub);
  }

  @OnlyDueno()
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<void> {
    await this.categories.remove(id, user.sub);
  }
}
