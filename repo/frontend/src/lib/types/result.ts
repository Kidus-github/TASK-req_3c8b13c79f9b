export enum ErrorCode {
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  LOCKED = 'LOCKED',
  COOLDOWN = 'COOLDOWN',
  AUTH_FAILED = 'AUTH_FAILED',
  DUPLICATE = 'DUPLICATE',
  LIMIT_EXCEEDED = 'LIMIT_EXCEEDED',
  INVALID_FILE = 'INVALID_FILE',
  CRYPTO_FAIL = 'CRYPTO_FAIL',
  CHECKSUM_MISMATCH = 'CHECKSUM_MISMATCH',
  CANCELLED = 'CANCELLED',
  WORKER_ERROR = 'WORKER_ERROR',
  CANARY_FAILED = 'CANARY_FAILED',
  PARSE_ERROR = 'PARSE_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export type AppResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

export function ok<T>(data: T): AppResult<T> {
  return { ok: true, data };
}

export function err<T>(code: ErrorCode, message: string, details?: unknown): AppResult<T> {
  return { ok: false, error: { code, message, details } };
}
