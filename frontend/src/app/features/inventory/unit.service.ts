import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ApiSuccess } from '../../shared/models/api';
import { MaterialUnit, UnitQuery } from '../../shared/models/unit';
import { API, toParams, unwrap, unwrapPage } from '../../shared/utils/http';

/** Serial numbers (spec v2.2 §3). */
@Injectable({ providedIn: 'root' })
export class UnitService {
  private http = inject(HttpClient);

  /** Units of one material (any role). */
  forMaterial(materialId: string, query: UnitQuery) {
    return this.http
      .get<ApiSuccess<MaterialUnit[]>>(`${API}/materials/${materialId}/units`, { params: toParams(query) })
      .pipe(unwrapPage());
  }

  /** Search the whole system (ADMIN, STAFF). */
  search(query: UnitQuery) {
    return this.http
      .get<ApiSuccess<MaterialUnit[]>>(`${API}/units`, { params: toParams(query) })
      .pipe(unwrapPage());
  }

  /** ADMIN: replace a serial number (e.g. a -TEMP-SN- placeholder). */
  updateSerial(id: string, serialNumber: string) {
    return this.http
      .put<ApiSuccess<MaterialUnit>>(`${API}/units/${id}`, { serialNumber })
      .pipe(unwrap());
  }
}
