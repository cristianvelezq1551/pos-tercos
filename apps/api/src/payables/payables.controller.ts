import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  CreatePayableSchema,
  IDEMPOTENCY_HEADER,
  IdempotencyKeySchema,
  PayPayableSchema,
  PayableStatusEnum,
  type CreatePayable,
  type JwtAccessPayload,
  type PayableCommitment,
  type PayableStatus,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OnlyDueno } from '../auth/decorators/roles.decorator';
import { detectImageMimeLoose } from '../common/image-mime';
import {
  MAX_PROOFS_POR_PAGO,
  parseProofUploads,
  parseProofUploadsOptional,
} from '../common/proof-images';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PayablesService } from './payables.service';

/** Compromisos / cuentas por pagar a personas. Dueño-only. */
@Controller('payables')
@OnlyDueno()
export class PayablesController {
  constructor(private readonly payables: PayablesService) {}

  @Get()
  list(@Query('status') status?: string): Promise<PayableCommitment[]> {
    const parsed = status ? PayableStatusEnum.safeParse(status) : null;
    return this.payables.list(parsed?.success ? (parsed.data as PayableStatus) : undefined);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreatePayableSchema)) body: CreatePayable,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PayableCommitment> {
    return this.payables.create(body, user.sub);
  }

  @Post(':id/pay')
  @UseInterceptors(
    FilesInterceptor('proof', MAX_PROOFS_POR_PAGO, {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async pay(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body('payload') payloadRaw: string | undefined,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Headers(IDEMPOTENCY_HEADER) idemKey?: string,
  ): Promise<PayableCommitment> {
    if (!payloadRaw) throw new BadRequestException('Faltan los datos del pago.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw);
    } catch {
      throw new BadRequestException('Payload inválido.');
    }
    const input = PayPayableSchema.parse(parsed);
    // El comprobante acá es OPCIONAL: un compromiso se puede saldar sin foto.
    const proofs = parseProofUploadsOptional(files, detectImageMimeLoose);
    const idempotencyKey = idemKey && IdempotencyKeySchema.safeParse(idemKey).success ? idemKey : undefined;
    return this.payables.pay(id, input, proofs, user.sub, idempotencyKey);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<void> {
    return this.payables.cancel(id, user.sub);
  }

  @Get(':id/proof')
  async getProof(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const { buffer, mime } = await this.payables.getProof(id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(buffer);
  }

  /** Comprobante N del compromiso (0 = el primero). */
  @Get(':id/proof/:index')
  async getProofAt(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mime } = await this.payables.getProof(id, index);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(buffer);
  }

  /** Suma comprobantes a un compromiso ya pagado. */
  @Post(':id/proofs')
  @UseInterceptors(
    FilesInterceptor('proofs', MAX_PROOFS_POR_PAGO, {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  addProofs(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ): Promise<PayableCommitment> {
    return this.payables.addProofs(
      id,
      user.sub,
      parseProofUploads(files, detectImageMimeLoose),
    );
  }

  /** Quita un comprobante (acá puede quedar en cero: es opcional). */
  @Delete(':id/proofs/:index')
  removeProof(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PayableCommitment> {
    return this.payables.removeProof(id, index, user.sub);
  }
}
