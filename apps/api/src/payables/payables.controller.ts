import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  CreatePayableSchema,
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
  @UseInterceptors(FileInterceptor('proof', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async pay(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body('payload') payloadRaw: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<PayableCommitment> {
    if (!payloadRaw) throw new BadRequestException('Falta el payload del pago.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw);
    } catch {
      throw new BadRequestException('Payload inválido.');
    }
    const input = PayPayableSchema.parse(parsed);
    let proof: { buffer: Buffer; mime: string; ext: string } | null = null;
    if (file) {
      const detected = detectImageMimeLoose(file.buffer, file.mimetype, file.originalname);
      if (!detected) throw new BadRequestException('La imagen debe ser JPEG, PNG o WebP.');
      proof = { buffer: file.buffer, mime: detected.mime, ext: detected.ext };
    }
    return this.payables.pay(id, input, proof, user.sub);
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
}
