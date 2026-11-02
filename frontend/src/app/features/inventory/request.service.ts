import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { ApiSuccess } from '../../shared/models/api';
import {
  ApproveRequestInput,
  CreateRequestInput,
  RequestQuery,
  WithdrawalDocument,
  WithdrawalRequest,
} from '../../shared/models/request';
import { API, toParams, unwrap, unwrapPage } from '../../shared/utils/http';

const URL = `${API}/inventory/requests`;

/** Withdrawal requests (D17). */
@Injectable({ providedIn: 'root' })
export class RequestService {
  private http = inject(HttpClient);

  create(input: CreateRequestInput) {
    return this.http.post<ApiSuccess<WithdrawalRequest>>(URL, input).pipe(unwrap());
  }

  list(query: RequestQuery) {
    return this.http.get<ApiSuccess<WithdrawalRequest[]>>(URL, { params: toParams(query) }).pipe(unwrapPage());
  }

  get(id: string) {
    return this.http.get<ApiSuccess<WithdrawalRequest>>(`${URL}/${id}`).pipe(unwrap());
  }

  approve(id: string, input: ApproveRequestInput) {
    return this.http.post<ApiSuccess<WithdrawalRequest>>(`${URL}/${id}/approve`, input).pipe(unwrap());
  }

  reject(id: string, reason: string) {
    return this.http.post<ApiSuccess<WithdrawalRequest>>(`${URL}/${id}/reject`, { reason }).pipe(unwrap());
  }

  cancel(id: string) {
    return this.http.post<ApiSuccess<WithdrawalRequest>>(`${URL}/${id}/cancel`, {}).pipe(unwrap());
  }

  /** Requests waiting for a decision (menu badge). */
  pendingCount() {
    return this.list({ status: 'PENDING', limit: 1 }).pipe(map((p) => p.meta.total));
  }

  document(transactionId: string) {
    return this.http
      .get<ApiSuccess<WithdrawalDocument>>(`${API}/inventory/transactions/${transactionId}/document`)
      .pipe(unwrap());
  }
}
