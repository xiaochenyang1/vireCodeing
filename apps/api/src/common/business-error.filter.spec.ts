import type { ArgumentsHost } from '@nestjs/common';
import { ApiErrorCode, BusinessError } from './errors';
import { BusinessErrorFilter } from './business-error.filter';

describe('BusinessErrorFilter', () => {
  function createHost() {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const getResponse = jest.fn(() => ({ status, json }));
    const getRequest = jest.fn(() => ({
      headers: {
        'x-request-id': 'req_test',
      },
    }));
    const switchToHttp = jest.fn(() => ({
      getResponse,
      getRequest,
    }));

    return {
      host: { switchToHttp } as unknown as ArgumentsHost,
      status,
      json,
    };
  }

  it('maps auth business errors to a unified response', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError(ApiErrorCode.AUTH_CODE_INVALID, '验证码错误'),
      host,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      code: 'AUTH_CODE_INVALID',
      message: '验证码错误',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps password authentication failures to unauthorized', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError(ApiErrorCode.AUTH_PASSWORD_INVALID, '手机号或密码错误'),
      host,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      code: 'AUTH_PASSWORD_INVALID',
      message: '手机号或密码错误',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps password reset failures to unauthorized', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError(
        ApiErrorCode.AUTH_PASSWORD_RESET_INVALID,
        '手机号或验证码错误',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      code: 'AUTH_PASSWORD_RESET_INVALID',
      message: '手机号或验证码错误',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps validation business errors to bad request', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status } = createHost();

    filter.catch(
      new BusinessError(ApiErrorCode.VALIDATION_ERROR, '参数不合法'),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
  });

  it('maps order draft version conflicts to conflict', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError(
        'ORDER_DRAFT_CONFLICT' as ApiErrorCode,
        '发单草稿已被其他设备更新，请先拉取最新草稿后再保存。',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      code: 'ORDER_DRAFT_CONFLICT',
      message: '发单草稿已被其他设备更新，请先拉取最新草稿后再保存。',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps order state conflicts to conflict', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许取消',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      code: 'ORDER_STATE_INVALID',
      message: '当前订单状态不允许取消',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps profile address book version conflicts to conflict', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError(
        'PROFILE_ADDRESS_BOOK_CONFLICT' as ApiErrorCode,
        '常用地址/联系人已被其他设备更新，请先拉取最新地址簿后再保存。',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      code: 'PROFILE_ADDRESS_BOOK_CONFLICT',
      message: '常用地址/联系人已被其他设备更新，请先拉取最新地址簿后再保存。',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps verification code rate limit errors to too many requests', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError(
        ApiErrorCode.AUTH_CODE_RATE_LIMITED,
        '验证码发送过于频繁',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({
      code: 'AUTH_CODE_RATE_LIMITED',
      message: '验证码发送过于频繁',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps verification code delivery failures to bad gateway', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError(
        ApiErrorCode.AUTH_CODE_DELIVERY_FAILED,
        '验证码发送失败',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({
      code: 'AUTH_CODE_DELIVERY_FAILED',
      message: '验证码发送失败',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps disabled user authentication failures to forbidden', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError('AUTH_USER_DISABLED' as ApiErrorCode, '账号已禁用'),
      host,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      code: 'AUTH_USER_DISABLED',
      message: '账号已禁用',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps driver certification gate failures to forbidden', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError(
        ApiErrorCode.DRIVER_CERTIFICATION_REQUIRED,
        '司机实名和车辆认证通过后才能接单',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      code: 'DRIVER_CERTIFICATION_REQUIRED',
      message: '司机实名和车辆认证通过后才能接单',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps driver offline acceptance failures to forbidden', () => {
    const filter = new BusinessErrorFilter(
      () => new Date('2026-06-26T06:00:00.000Z'),
    );
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError(
        ApiErrorCode.DRIVER_ACCEPTANCE_OFFLINE,
        '司机当前处于离线接单状态',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      code: 'DRIVER_ACCEPTANCE_OFFLINE',
      message: '司机当前处于离线接单状态',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps missing driver certification records to not found', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError(
        ApiErrorCode.DRIVER_CERTIFICATION_NOT_FOUND,
        '司机认证记录不存在',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      code: 'DRIVER_CERTIFICATION_NOT_FOUND',
      message: '司机认证记录不存在',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps missing files to not found', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '文件不存在'),
      host,
    );

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      code: 'FILE_NOT_FOUND',
      message: '文件不存在',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps invalid file state to conflict', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError(ApiErrorCode.FILE_STATE_INVALID, '文件状态不允许确认'),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      code: 'FILE_STATE_INVALID',
      message: '文件状态不允许确认',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps invalid file preview signatures to unauthorized', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status, json } = createHost();

    filter.catch(
      new BusinessError(
        'FILE_PREVIEW_SIGNATURE_INVALID' as ApiErrorCode,
        '预览链接无效或已过期',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      code: 'FILE_PREVIEW_SIGNATURE_INVALID',
      message: '预览链接无效或已过期',
      requestId: 'req_test',
      timestamp: '2026-06-26T06:00:00.000Z',
    });
  });

  it('maps missing exception cases to not found', () => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status } = createHost();

    filter.catch(
      new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_NOT_FOUND,
        '异常工单不存在',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(404);
  });

  it.each([
    ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
    ApiErrorCode.EXCEPTION_CASE_CONFLICT,
  ])('maps %s to conflict', code => {
    const filter = new BusinessErrorFilter(() => new Date('2026-06-26T06:00:00.000Z'));
    const { host, status } = createHost();

    filter.catch(new BusinessError(code, '异常工单状态冲突'), host);

    expect(status).toHaveBeenCalledWith(409);
  });
});
