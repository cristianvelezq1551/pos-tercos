import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UsePipes } from '@nestjs/common';
import {
  CreateProductSchema,
  UpdateProductSchema,
  type CreateProduct,
  type Product,
  type UpdateProduct,
} from '@pos-tercos/types';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @Query('only_active') onlyActive?: string,
    @Query('category') category?: string,
  ): Promise<Product[]> {
    return this.products.list({ onlyActive: onlyActive === 'true', category });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.products.getById(id);
  }

  @AdminAccess()
  @Post()
  @UsePipes(new ZodValidationPipe(CreateProductSchema))
  create(@Body() body: CreateProduct): Promise<Product> {
    return this.products.create(body);
  }

  @AdminAccess()
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateProductSchema)) body: UpdateProduct,
  ): Promise<Product> {
    return this.products.update(id, body);
  }

  @AdminAccess()
  @Delete(':id')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.products.deactivate(id);
  }
}
