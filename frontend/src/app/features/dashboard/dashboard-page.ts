import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of, OperatorFunction, switchMap } from 'rxjs';
import { MaterialBrief, ProcurementRow, TopWithdrawnSort } from '../../shared/models/dashboard';
import { StockTransaction } from '../../shared/models/transaction';
import { InventoryService } from '../inventory/inventory.service';
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

  /** First day of this month (local date), for the "withdrawals this month" card's link. */
  protected readonly monthStart = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  })();

  // ---- procurement by fiscal year / stock age ----
  protected readonly procurement = toSignal(this.dashboard.procurement().pipe(this.safe([])), {
    initialValue: undefined,
  });
  /** Thai fiscal year starts 1 October. */
  protected readonly currentFiscalYear = (() => {
    const [y, m] = bangkokDate().split('-').map(Number) as [number, number];
    return y + 543 + (m >= 10 ? 1 : 0);
  })();

  protected usedPercent(p: ProcurementRow): number {
    return p.receivedQty ? Math.round(((p.receivedQty - p.remainingQty) / p.receivedQty) * 100) : 0;
  }

  // ---- monthly trend ----
  protected readonly monthly = toSignal(this.dashboard.monthlyWithdrawals().pipe(this.safe([])), {
    initialValue: undefined,
  });
  private readonly monthlyMax = computed(() =>
    Math.max(1, ...(this.monthly() ?? []).flatMap((m) => [m.quantity, m.previousYearQuantity])),
  );

  protected barHeight(value: number): string {
    return `${(value / this.monthlyMax()) * 100}%`;
  }

  /** "2026-10" -> "ต.ค. 69" (or "ต.ค." with `withYear` false) */
  protected monthLabel(month: string, withYear = true): string {
    return new Intl.DateTimeFormat('th-TH', {
      month: 'short',
      year: withYear ? '2-digit' : undefined,
      timeZone: 'UTC',
    }).format(new Date(`${month}-01T00:00:00Z`));
  }

  // ---- recent withdrawals ----
  protected readonly recent = toSignal(
    inject(InventoryService)
      .history({ type: 'OUT', limit: 10 })
      .pipe(
        // A cancelled receipt is also an OUT; it is not a withdrawal.
        map((p) => p.items.filter((t) => !t.reversalOf)),
        this.safe([]),
      ),
    { initialValue: undefined },
  );

  protected itemsText(t: StockTransaction): string {
    return t.items.map((i) => `${i.material.name} ${i.quantity} ${i.material.unit}`).join(', ');
  }

  // ---- unused ----
  /** null = never withdrawn at all. */
  protected readonly unusedDays = signal<number | null>(null);
  protected readonly unused = toSignal(
    toObservable(this.unusedDays).pipe(
      switchMap((days) => this.dashboard.unused(days).pipe(this.safe([]))),
    ),
    { initialValue: undefined },
  );

  protected readonly unusedValue = computed(() => (this.unused() ?? []).reduce((sum, u) => sum + u.value, 0));

  /** Shown in the data-quality card; same value as the back-end's IMPORT_DEFAULT_MIN_STOCK. */
  protected readonly defaultMinStock = 5;

  protected valueWidth(value: number): string {
    const max = Math.max(1, ...(this.summary()?.valueByCategory ?? []).map((c) => c.value));
    return `${Math.max(2, (value / max) * 100)}%`;
  }

  /** "CODE · brand · model": same-named materials are told apart by brand and model. */
  protected detail(m: MaterialBrief): string {
    return [m.code, m.brand, m.model].filter((x) => x && x !== '-').join(' · ');
  }

  protected barWidth(value: number): string {
    return `${Math.max(2, (value / this.topMax()) * 100)}%`;
  }
}
