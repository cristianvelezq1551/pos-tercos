import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UsePipes } from '@nestjs/common';
import {
  CreateSupplierSchema,
  UpdateSupplierSchema,
  type CreateSupplier,
  type Supplier,
  type UpdateSupplier,
} from '@pos-tercos/types';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  list(@Query('only_active') onlyActive?: string): Promise<Supplier[]> {
    return this.suppliers.list({ onlyActive: onlyActive === 'true' });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Supplier> {
    return this.suppliers.getById(id);
  }

  @AdminAccess()
  @Post()
  @UsePipes(new ZodValidationPipe(CreateSupplierSchema))
  create(@Body() body: CreateSupplier): Promise<Supplier> {
    return this.suppliers.create(body);
  }

  @AdminAccess()
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateSupplierSchema)) body: UpdateSupplier,
  ): Promise<Supplier> {
    return this.suppliers.update(id, body);
  }

  @AdminAccess()
  @Delete(':id')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Supplier> {
    return this.suppliers.deactivate(id);
  }
}
