import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ApiSuccess } from '../../shared/models/api';
import { Material, MaterialInput, MaterialQuery } from '../../shared/models/material';
import { API, toParams, unwrap, unwrapPage } from '../../shared/utils/http';

@Injectable({ providedIn: 'root' })
export class MaterialService {
  private http = inject(HttpClient);

  list(query: MaterialQuery) {
    return this.http
      .get<ApiSuccess<Material[]>>(`${API}/materials`, { params: toParams(query) })
      .pipe(unwrapPage());
  }

  get(id: string) {
    return this.http.get<ApiSuccess<Material>>(`${API}/materials/${id}`).pipe(unwrap());
  }

  create(input: MaterialInput) {
    return this.http.post<ApiSuccess<Material>>(`${API}/materials`, input).pipe(unwrap());
  }

  update(id: string, input: MaterialInput) {
    return this.http.put<ApiSuccess<Material>>(`${API}/materials/${id}`, input).pipe(unwrap());
  }
}
