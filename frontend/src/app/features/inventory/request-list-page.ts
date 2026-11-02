import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ReasonDialog, ReasonDialogData } from '../../shared/components/reason-dialog';
import { Page } from '../../shared/models/api';
import { REQUEST_STATUS_LABELS, RequestQuery, RequestStatus, WithdrawalRequest } from '../../shared/models/request';
import { Notify } from '../../shared/services/notify';
import { RequestService } from './request.service';

const STATUS_BADGE: Record<RequestStatus, string> = {
  PENDING: 'badge badge-warn',
  APPROVED: 'badge badge-ok',
  REJECTED: 'badge badge-danger',
  CANCELLED: 'badge badge-neutral',
};

/** Withdrawal requests (D17): everyone follows their own; STAFF/ADMIN work the approval queue. */
@Component({
  selector: 'app-request-list-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatPaginatorModule,
    MatProgressBarModule,
  ],
  templateUrl: './request-list-page.html',
  styleUrl: './history-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestListPage {
  private requests = inject(RequestService);
  private notify = inject(Notify);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);

  protected readonly isStaff = this.auth.hasRole('ADMIN', 'STAFF');
  protected readonly statusLabels = REQUEST_STATUS_LABELS;
  protected readonly statuses = Object.keys(REQUEST_STATUS_LABELS) as RequestStatus[];
  protected readonly badge = STATUS_BADGE;
  protected readonly query = signal<RequestQuery>({ page: 1, limit: 20, status: this.isStaff ? 'PENDING' : undefined });
  protected readonly result = signal<Page<WithdrawalRequest> | null>(null);
  protected readonly loading = signal(false);

  constructor() {
    this.load();
  }

  private isMine(r: WithdrawalRequest): boolean {
    const me = this.auth.user()?.id;
    return r.createdBy.id === me || r.requester?.id === me;
  }

  /** Nobody decides on a request they created or that is in their name. */
  protected canDecide(r: WithdrawalRequest): boolean {
    return this.isStaff && r.status === 'PENDING' && !this.isMine(r);
  }

  protected canCancel(r: WithdrawalRequest): boolean {
    return r.status === 'PENDING' && this.isMine(r);
  }

  protected setStatus(status: RequestStatus | undefined): void {
    this.query.update((q) => ({ ...q, status, page: 1 }));
    this.load();
  }

  protected onPage(e: PageEvent): void {
    this.query.update((q) => ({ ...q, page: e.pageIndex + 1, limit: e.pageSize }));
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.requests.list(this.query()).subscribe({
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

  protected reject(r: WithdrawalRequest): void {
    const data: ReasonDialogData = {
      title: `ไม่อนุมัติคำขอ ${r.requestNo}`,
      message: `ผู้เบิก: ${r.requesterName} ระบบจะไม่ตัดสต็อก และผู้เบิกจะเห็นเหตุผลนี้`,
      label: 'เหตุผลที่ไม่อนุมัติ',
      confirmText: 'ไม่อนุมัติ',
    };
    this.dialog
      .open<ReasonDialog, ReasonDialogData, string>(ReasonDialog, { data, width: '480px' })
      .afterClosed()
      .subscribe((reason) => {
        if (!reason) return;
        this.requests.reject(r.id, reason).subscribe({
          next: () => {
            this.notify.success(`ไม่อนุมัติคำขอ ${r.requestNo} แล้ว`);
            this.load();
          },
          error: (err: unknown) => {
            this.notify.error(err);
            this.load();
          },
        });
      });
  }

  protected cancel(r: WithdrawalRequest): void {
    if (!confirm(`ยกเลิกคำขอ ${r.requestNo} ใช่ไหม`)) return;
    this.requests.cancel(r.id).subscribe({
      next: () => {
        this.notify.success(`ยกเลิกคำขอ ${r.requestNo} แล้ว`);
        this.load();
      },
      error: (err: unknown) => {
        this.notify.error(err);
        this.load();
      },
    });
  }
}
