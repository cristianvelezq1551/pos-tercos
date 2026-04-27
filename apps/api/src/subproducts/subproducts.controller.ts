import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UsePipes } from '@nestjs/common';
import {
  CreateSubproductSchema,
  UpdateSubproductSchema,
  type CreateSubproduct,
  type Subproduct,
  type UpdateSubproduct,
} from '@pos-tercos/types';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SubproductsService } from './subproducts.service';

@Controller('subproducts')
export class SubproductsController {
  constructor(private readonly subproducts: SubproductsService) {}

  @Get()
  list(@Query('only_active') onlyActive?: string): Promise<Subproduct[]> {
    return this.subproducts.list({ onlyActive: onlyActive === 'true' });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Subproduct> {
    return this.subproducts.getById(id);
  }

  @AdminAccess()
  @Post()
  @UsePipes(new ZodValidationPipe(CreateSubproductSchema))
  create(@Body() body: CreateSubproduct): Promise<Subproduct> {
    return this.subproducts.create(body);
  }

  @AdminAccess()
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateSubproductSchema)) body: UpdateSubproduct,
  ): Promise<Subproduct> {
    return this.subproducts.update(id, body);
  }

  @AdminAccess()
  @Delete(':id')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Subproduct> {
    return this.subproducts.deactivate(id);
  }
}
