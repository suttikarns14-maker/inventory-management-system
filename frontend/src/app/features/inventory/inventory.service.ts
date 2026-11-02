import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ApiSuccess } from '../../shared/models/api';
import { CreateTransactionInput, HistoryQuery, Returnable, ReturnInput, StockTransaction } from '../../shared/models/transaction';
import { UserOption } from '../../shared/models/user';
import { API, toParams, unwrap, unwrapPage } from '../../shared/utils/http';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private http = inject(HttpClient);

  create(input: CreateTransactionInput) {
    return this.http
      .post<ApiSuccess<StockTransaction>>(`${API}/inventory/transactions`, input)
      .pipe(unwrap());
  }

  /** Active users for the requester picker (ADMIN, STAFF). */
  userOptions() {
    return this.http.get<ApiSuccess<UserOption[]>>(`${API}/users/options`).pipe(unwrap());
  }

  reverse(id: string, note: string) {
    return this.http
      .post<ApiSuccess<StockTransaction>>(`${API}/inventory/transactions/${id}/reverse`, { note })
      .pipe(unwrap());
  }

  /** STAFF/ADMIN (D18): what can still come back from a withdrawal. */
  returnable(id: string) {
    return this.http.get<ApiSuccess<Returnable>>(`${API}/inventory/transactions/${id}/return`).pipe(unwrap());
  }

  returnItems(id: string, input: ReturnInput) {
    return this.http
      .post<ApiSuccess<StockTransaction>>(`${API}/inventory/transactions/${id}/return`, input)
      .pipe(unwrap());
  }

  /** ADMIN: fill in departments that are still empty (imported history). */
  fillDepartments(id: string, input: { requestingDepartmentId: string | null; usingDepartmentId: string | null }) {
    return this.http
      .patch<ApiSuccess<StockTransaction>>(`${API}/inventory/transactions/${id}/departments`, input)
      .pipe(unwrap());
  }

  history(query: HistoryQuery) {
    return this.http
      .get<ApiSuccess<StockTransaction[]>>(`${API}/inventory/history`, { params: toParams(query) })
      .pipe(unwrapPage());
  }
}
