export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PageMeta;
}

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

export interface ApiErrorBody {
  success: false;
  error: { code: ErrorCode; message: string; details?: FieldError[] };
}

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

export type SortOrder = 'asc' | 'desc';
