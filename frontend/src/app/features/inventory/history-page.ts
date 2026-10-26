import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ActivatedRoute } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ReasonDialog, ReasonDialogData } from '../../shared/components/reason-dialog';
import { Page } from '../../shared/models/api';
import {
  HistoryQuery,
  StockTransaction,
  TRANSACTION_TYPE_LABELS,
} from '../../shared/models/transaction';
import { LookupService } from '../../shared/services/lookup.service';
import { Notify } from '../../shared/services/notify';
import { MaterialService } from '../materials/material.service';
import { FillDepartmentsData, FillDepartmentsDialog } from './fill-departments-dialog';
import { InventoryService } from './inventory.service';

@Component({
  selector: 'app-history-page',
  imports: [
    DatePipe,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatCheckboxModule,
  ],
  templateUrl: './history-page.html',
  styleUrl: './history-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPage {
  private inventory = inject(InventoryService);
  private notify = inject(Notify);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);

  protected readonly isUser = this.auth.hasRole('USER');
  protected readonly canReverse = this.auth.hasRole('ADMIN');
  protected readonly typeLabels = TRANSACTION_TYPE_LABELS;
  protected readonly materials = toSignal(
    inject(MaterialService)
      .list({ limit: 100 })
      .pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  private readonly lookups = toSignal(inject(LookupService).all().pipe(catchError(() => of(null))));
  protected readonly departments = computed(() => this.lookups()?.departments ?? []);

  /** Filters the dashboard links to: `?missingDepartment=true`, `?type=OUT&from=YYYY-MM-DD`, `?type=OUT&usingDepartmentId=`. */
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly query = signal<HistoryQuery>({
    page: 1,
    limit: 20,
    missingDepartment: this.params.get('missingDepartment') === 'true' || undefined,
    type: (['IN', 'OUT'] as const).find((t) => t === this.params.get('type')),
    from: this.params.get('from') ?? undefined,
    usingDepartmentId: this.params.get('usingDepartmentId') ?? undefined,
  });
  private serialTimer?: ReturnType<typeof setTimeout>;
  protected readonly result = signal<Page<StockTransaction> | null>(null);
  protected readonly loading = signal(false);

  constructor() {
    this.load();
  }

  protected setFilter(changes: Partial<HistoryQuery>): void {
    this.query.update((q) => ({ ...q, ...changes, page: 1 }));
    this.load();
  }

  protected setSerial(value: string): void {
    clearTimeout(this.serialTimer);
    this.serialTimer = setTimeout(() => this.setFilter({ serial: value.trim() || undefined }), 300);
  }

  protected clearFilters(): void {
    this.query.set({ page: 1, limit: this.query().limit });
    this.load();
  }

  protected onPage(e: PageEvent): void {
    this.query.update((q) => ({ ...q, page: e.pageIndex + 1, limit: e.pageSize }));
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.inventory.history(this.query()).subscribe({
      next: (page) => {
        this.result.set(page);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.notify.error(err);
        this.loading.set(false);
      },
    });
  }

  protected missingDepartment(t: StockTransaction): boolean {
    return t.type === 'OUT' && !t.reversalOf && (!t.requestingDepartment || !t.usingDepartment);
  }

  protected fillDepartments(txn: StockTransaction): void {
    const data: FillDepartmentsData = { txn, departments: this.lookups()?.departments ?? [] };
    this.dialog
      .open<FillDepartmentsDialog, FillDepartmentsData, StockTransaction>(FillDepartmentsDialog, { data })
      .afterClosed()
      .subscribe((updated) => {
        if (!updated) return;
        this.notify.success(`บันทึกหน่วยงานของ ${updated.referenceNo} แล้ว`);
        this.load();
      });
  }

  protected reverse(txn: StockTransaction): void {
    const data: ReasonDialogData = {
      title: `ยกเลิกรายการ ${txn.referenceNo}`,
      message: `ระบบจะสร้างรายการ${txn.type === 'IN' ? 'เบิกจ่าย' : 'รับเข้า'}กลับด้วยจำนวนเท่าเดิม รายการเดิมจะยังอยู่ในประวัติ`,
      label: 'เหตุผลการยกเลิก',
      confirmText: 'ยืนยันการยกเลิก',
    };
    this.dialog
      .open<ReasonDialog, ReasonDialogData, string>(ReasonDialog, { data, width: '480px' })
      .afterClosed()
      .subscribe((note) => {
        if (!note) return;
        this.inventory.reverse(txn.id, note).subscribe({
          next: (reversal) => {
            this.notify.success(`ยกเลิกรายการแล้ว (${reversal.referenceNo})`);
            this.load();
          },
          error: (err: unknown) => this.notify.error(err),
        });
      });
  }
}
