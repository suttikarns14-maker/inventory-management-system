import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ApiSuccess } from '../../shared/models/api';
import { CreateTransactionInput, HistoryQuery, StockTransaction } from '../../shared/models/transaction';
import { API, toParams, unwrap, unwrapPage } from '../../shared/utils/http';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private http = inject(HttpClient);

  create(input: CreateTransactionInput) {
    return this.http
      .post<ApiSuccess<StockTransaction>>(`${API}/inventory/transactions`, input)
      .pipe(unwrap());
  }

  reverse(id: string, note: string) {
    return this.http
      .post<ApiSuccess<StockTransaction>>(`${API}/inventory/transactions/${id}/reverse`, { note })
      .pipe(unwrap());
  }

  history(query: HistoryQuery) {
    return this.http
      .get<ApiSuccess<StockTransaction[]>>(`${API}/inventory/history`, { params: toParams(query) })
      .pipe(unwrapPage());
  }
}
