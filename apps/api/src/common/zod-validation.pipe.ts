import { type PipeTransform } from '@nestjs/common';
import { z, type ZodType } from 'zod';
import { ApiErrorCode, BusinessError } from './errors';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (result.success) {
      return result.data;
    }

    throw new BusinessError(
      ApiErrorCode.VALIDATION_ERROR,
      this.getFirstIssueMessage(result.error),
    );
  }

  private getFirstIssueMessage(error: z.ZodError): string {
    return error.issues[0]?.message ?? '请求参数不合法';
  }
}
