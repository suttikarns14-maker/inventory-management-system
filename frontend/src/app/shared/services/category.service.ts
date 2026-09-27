import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ApiSuccess } from '../models/api';
import { Category, CategoryInput } from '../models/material';
import { API, unwrap } from '../utils/http';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private http = inject(HttpClient);

  list() {
    return this.http.get<ApiSuccess<Category[]>>(`${API}/categories`).pipe(unwrap());
  }

  create(input: CategoryInput) {
    return this.http.post<ApiSuccess<Category>>(`${API}/categories`, input).pipe(unwrap());
  }

  update(id: string, input: CategoryInput) {
    return this.http.put<ApiSuccess<Category>>(`${API}/categories/${id}`, input).pipe(unwrap());
  }
}
