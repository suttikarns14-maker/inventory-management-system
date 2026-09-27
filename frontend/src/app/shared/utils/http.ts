import { HttpParams } from '@angular/common/http';
import { map, OperatorFunction } from 'rxjs';
import { ApiSuccess, Page } from '../models/api';

export const API = '/api/v1';

/** Builds query params, skipping empty values. */
export function toParams(query: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
  }
  return params;
}

export const unwrap = <T>(): OperatorFunction<ApiSuccess<T>, T> => map((res) => res.data);

export const unwrapPage = <T>(): OperatorFunction<ApiSuccess<T[]>, Page<T>> =>
  map((res) => ({ items: res.data, meta: res.meta! }));
