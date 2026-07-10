import { z } from 'zod';
import { ApiErrorCode, BusinessError } from './errors';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  it('returns parsed values from the provided schema', () => {
    const pipe = new ZodValidationPipe(
      z.object({
        name: z.string().trim().min(1),
      }),
    );

    expect(pipe.transform({ name: '  货主  ' })).toEqual({
      name: '货主',
    });
  });

  it('maps zod validation issues to business validation errors', () => {
    const pipe = new ZodValidationPipe(
      z.object({
        phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
      }),
    );

    expect(() => pipe.transform({ phone: '123' })).toThrow(
      new BusinessError(ApiErrorCode.VALIDATION_ERROR, '手机号格式不正确'),
    );
  });
});
