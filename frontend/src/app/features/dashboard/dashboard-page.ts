import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { catchError, combineLatest, of, OperatorFunction, switchMap } from 'rxjs';
import { TopWithdrawnSort } from '../../shared/models/dashboard';
import { Notify } from '../../shared/services/notify';
import { bangkokDate, daysAgo } from '../../shared/utils/date';
import { DashboardService } from './dashboard.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [DatePipe, DecimalPipe, RouterLink, MatButtonToggleModule, MatIconModule],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  private dashboard = inject(DashboardService);
  private notify = inject(Notify);

  /** Shows the error and lets the widget render its empty state instead of breaking the page. */
  private safe<T, F>(fallback: F): OperatorFunction<T, T | F> {
    return catchError(() => {
      this.notify.error('โหลดข้อมูลบางส่วนของหน้านี้ไม่สำเร็จ');
      return of(fallback);
    });
  }

  protected readonly summary = toSignal(this.dashboard.summary().pipe(this.safe(null)), {
    initialValue: undefined,
  });
  protected readonly reorder = toSignal(this.dashboard.reorderSuggestions().pipe(this.safe([])), {
    initialValue: undefined,
  });

  // ---- top withdrawn ----
  protected readonly topPeriod = signal(30);
  protected readonly topSort = signal<TopWithdrawnSort>('quantity');
  protected readonly top = toSignal(
    combineLatest([toObservable(this.topPeriod), toObservable(this.topSort)]).pipe(
      switchMap(([days, sortBy]) =>
        this.dashboard
          .topWithdrawn({
            from: bangkokDate(daysAgo(days - 1)),
            to: bangkokDate(),
            sortBy,
            limit: 10,
          })
          .pipe(this.safe([])),
      ),
    ),
    { initialValue: undefined },
  );
  protected readonly topMax = computed(() => {
    const key = this.topSort() === 'count' ? 'withdrawalCount' : 'totalQuantity';
    return Math.max(1, ...(this.top() ?? []).map((t) => t[key]));
  });

  // ---- unused ----
  /** null = never withdrawn at all. */
  protected readonly unusedDays = signal<number | null>(null);
  protected readonly unused = toSignal(
    toObservable(this.unusedDays).pipe(
      switchMap((days) => this.dashboard.unused(days).pipe(this.safe([]))),
    ),
    { initialValue: undefined },
  );

  protected barWidth(value: number): string {
    return `${Math.max(2, (value / this.topMax()) * 100)}%`;
  }
}
