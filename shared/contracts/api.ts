/** 共享 API 响应信封类型 */

export interface ApiSuccess<T = unknown> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
  requestId: string;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
  requestId: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;
