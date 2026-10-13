/** Error codes: spec §4.2. The front-end mirrors this list in shared/models/api.ts. */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INSUFFICIENT_STOCK'
  | 'MATERIAL_INACTIVE'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'USER_INACTIVE'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'DUPLICATE_CODE'
  | 'ALREADY_REVERSED'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR';

export interface FieldError {
  field: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: FieldError[],
  ) {
    super(message);
  }
}

export const notFound = (message: string) => new AppError(404, 'NOT_FOUND', message);

/** 409 for a unique value that is already taken, pinned to the form field that caused it. */
export const duplicate = (field: string, message: string) =>
  new AppError(409, 'DUPLICATE_CODE', message, [{ field, message }]);
