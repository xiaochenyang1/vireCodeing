import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { ApiErrorCode, BusinessError } from './errors';

type ErrorResponse = {
  status(statusCode: number): ErrorResponse;
  json(body: unknown): void;
};

type ErrorRequest = {
  headers?: Record<string, string | string[] | undefined>;
};

const AUTH_ERROR_CODES = new Set<string>([
  ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
  ApiErrorCode.AUTH_CODE_EXPIRED,
  ApiErrorCode.AUTH_CODE_INVALID,
  ApiErrorCode.AUTH_PASSWORD_INVALID,
  ApiErrorCode.AUTH_PASSWORD_RESET_INVALID,
  ApiErrorCode.AUTH_REFRESH_TOKEN_INVALID,
  ApiErrorCode.FILE_PREVIEW_SIGNATURE_INVALID,
]);
const RATE_LIMIT_ERROR_CODES = new Set<string>([
  ApiErrorCode.AUTH_CODE_RATE_LIMITED,
]);
const UPSTREAM_ERROR_CODES = new Set<string>([
  ApiErrorCode.AUTH_CODE_DELIVERY_FAILED,
  ApiErrorCode.PAYMENT_CHANNEL_UNAVAILABLE,
  ApiErrorCode.REFUND_PROVIDER_FAILED,
]);
const INTERNAL_ERROR_CODES = new Set<string>([
  ApiErrorCode.FINANCIAL_LEDGER_UNBALANCED,
]);
const NOT_FOUND_ERROR_CODES = new Set<string>([
  ApiErrorCode.AUTH_ACCOUNT_NOT_FOUND,
  ApiErrorCode.DRIVER_CERTIFICATION_NOT_FOUND,
  ApiErrorCode.DRIVER_LOCATION_NOT_FOUND,
  ApiErrorCode.EXCEPTION_CASE_NOT_FOUND,
  ApiErrorCode.FILE_NOT_FOUND,
  ApiErrorCode.ORDER_NOT_FOUND,
]);
const FORBIDDEN_ERROR_CODES = new Set<string>([
  ApiErrorCode.AUTH_FORBIDDEN,
  ApiErrorCode.AUTH_USER_DISABLED,
  ApiErrorCode.DRIVER_ACCEPTANCE_OFFLINE,
  ApiErrorCode.DRIVER_CERTIFICATION_REQUIRED,
]);
const CONFLICT_ERROR_CODES = new Set<string>([
  ApiErrorCode.FILE_STATE_INVALID,
  ApiErrorCode.DRIVER_LOCATION_ORDER_INVALID,
  ApiErrorCode.EXCEPTION_CASE_APPEAL_NOT_ALLOWED,
  ApiErrorCode.EXCEPTION_CASE_COMPENSATION_ALREADY_EXECUTED,
  ApiErrorCode.EXCEPTION_CASE_COMPENSATION_NOT_EXECUTABLE,
  ApiErrorCode.EXCEPTION_CASE_CONFLICT,
  ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
  ApiErrorCode.IDEMPOTENCY_KEY_EXPIRED,
  ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
  ApiErrorCode.ORDER_CONFLICT,
  ApiErrorCode.ORDER_DRAFT_CONFLICT,
  ApiErrorCode.ORDER_STATE_INVALID,
  ApiErrorCode.PAYMENT_ALREADY_ESCROWED,
  ApiErrorCode.PAYMENT_CALLBACK_CONFLICT,
  ApiErrorCode.PAYMENT_REQUIRED,
  ApiErrorCode.PROFILE_ADDRESS_BOOK_CONFLICT,
  ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
  ApiErrorCode.PROFILE_COUPON_PRICE_MISMATCH,
  ApiErrorCode.PROFILE_FREQUENT_ROUTES_CONFLICT,
  ApiErrorCode.REFUND_NOT_AVAILABLE,
  ApiErrorCode.DRIVER_WITHDRAWAL_CONFLICT,
  ApiErrorCode.SETTLEMENT_DRIVER_MISSING,
]);

@Catch(BusinessError)
export class BusinessErrorFilter implements ExceptionFilter<BusinessError> {
  constructor(private readonly now: () => Date = () => new Date()) {}

  catch(exception: BusinessError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<ErrorResponse>();
    const request = http.getRequest<ErrorRequest>();
    const requestIdHeader = request.headers?.['x-request-id'];
    const requestId = Array.isArray(requestIdHeader)
      ? requestIdHeader[0]
      : requestIdHeader;

    response.status(this.getStatusCode(exception.code)).json({
      code: exception.code,
      message: exception.message,
      requestId: requestId ?? 'req_local',
      timestamp: this.now().toISOString(),
    });
  }

  private getStatusCode(code: ApiErrorCode): number {
    if (INTERNAL_ERROR_CODES.has(code)) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    if (RATE_LIMIT_ERROR_CODES.has(code)) {
      return HttpStatus.TOO_MANY_REQUESTS;
    }

    if (UPSTREAM_ERROR_CODES.has(code)) {
      return HttpStatus.BAD_GATEWAY;
    }

    if (NOT_FOUND_ERROR_CODES.has(code)) {
      return HttpStatus.NOT_FOUND;
    }

    if (FORBIDDEN_ERROR_CODES.has(code)) {
      return HttpStatus.FORBIDDEN;
    }

    if (CONFLICT_ERROR_CODES.has(code)) {
      return HttpStatus.CONFLICT;
    }

    if (AUTH_ERROR_CODES.has(code)) {
      return HttpStatus.UNAUTHORIZED;
    }

    return HttpStatus.BAD_REQUEST;
  }
}
