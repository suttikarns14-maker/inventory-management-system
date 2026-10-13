import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ApiSuccess } from '../models/api';
import { Department, LookupInput, LookupItem, LookupKind, Lookups } from '../models/lookup';
import { API, unwrap } from '../utils/http';

/** Departments, buildings, floors and storage locations for dropdowns (spec v2.2 §2.1). */
@Injectable({ providedIn: 'root' })
export class LookupService {
  private http = inject(HttpClient);

  all() {
    return this.http.get<ApiSuccess<Lookups>>(`${API}/lookups`).pipe(unwrap());
  }

  create(kind: LookupKind, input: LookupInput) {
    return this.http.post<ApiSuccess<LookupItem | Department>>(`${API}/lookups/${kind}`, input).pipe(unwrap());
  }

  update(kind: LookupKind, id: string, input: LookupInput) {
    return this.http
      .put<ApiSuccess<LookupItem | Department>>(`${API}/lookups/${kind}/${id}`, input)
      .pipe(unwrap());
  }
}

/** Active rows only, for pickers; inactive ones stay visible in history. */
export const active = <T extends LookupItem>(rows: readonly T[] | undefined): T[] =>
  (rows ?? []).filter((r) => r.isActive);
