export type ApiResponse<T> = {
  code: 'OK';
  message: 'success';
  data: T;
  requestId: string;
  timestamp: string;
};

export function ok<T>(data: T, requestId = 'req_local'): ApiResponse<T> {
  return {
    code: 'OK',
    message: 'success',
    data,
    requestId,
    timestamp: new Date().toISOString(),
  };
}
