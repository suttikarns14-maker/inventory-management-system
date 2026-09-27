import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ApiSuccess } from '../../shared/models/api';
import {
  DashboardSummary,
  ReorderSuggestion,
  TopWithdrawn,
  TopWithdrawnSort,
  UnusedMaterial,
} from '../../shared/models/dashboard';
import { API, toParams, unwrap } from '../../shared/utils/http';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);

  summary() {
    return this.http.get<ApiSuccess<DashboardSummary>>(`${API}/dashboard/summary`).pipe(unwrap());
  }

  reorderSuggestions() {
    return this.http
      .get<ApiSuccess<ReorderSuggestion[]>>(`${API}/dashboard/reorder-suggestions`)
      .pipe(unwrap());
  }

  topWithdrawn(query: { from: string; to: string; sortBy: TopWithdrawnSort; limit?: number }) {
    return this.http
      .get<ApiSuccess<TopWithdrawn[]>>(`${API}/dashboard/top-withdrawn`, { params: toParams(query) })
      .pipe(unwrap());
  }

  unused(days: number | null) {
    return this.http
      .get<ApiSuccess<UnusedMaterial[]>>(`${API}/dashboard/unused`, { params: toParams({ days }) })
      .pipe(unwrap());
  }
}
