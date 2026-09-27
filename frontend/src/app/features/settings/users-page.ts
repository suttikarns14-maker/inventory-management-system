import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ReasonDialog, ReasonDialogData } from '../../shared/components/reason-dialog';
import { Page } from '../../shared/models/api';
import { ROLE_LABELS, User } from '../../shared/models/user';
import { Notify } from '../../shared/services/notify';
import { UserDialog } from './user-dialog';
import { UserService } from './user.service';

@Component({
  selector: 'app-users-page',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <h1>จัดการผู้ใช้</h1>
      <button mat-flat-button (click)="open(null)"><mat-icon>person_add</mat-icon> เพิ่มผู้ใช้</button>
    </div>

    <section class="card">
      <div class="filters">
        <mat-form-field>
          <mat-label>ค้นหาชื่อหรืออีเมล</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput [formControl]="search" />
        </mat-form-field>
      </div>

      <div class="table-wrap">
        <table class="simple">
          <thead>
            <tr>
              <th>ชื่อ-นามสกุล</th>
              <th>อีเมล</th>
              <th>สิทธิ์</th>
              <th>สถานะ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (u of result()?.items ?? []; track u.id) {
              <tr>
                <td>
                  {{ u.fullName }}
                  @if (u.id === me()?.id) {
                    <span class="muted">(คุณ)</span>
                  }
                </td>
                <td>{{ u.email }}</td>
                <td>{{ roleLabels[u.role] }}</td>
                <td>
                  <span [class]="u.isActive ? 'badge badge-ok' : 'badge badge-neutral'">
                    {{ u.isActive ? 'ใช้งาน' : 'ปิดใช้งาน' }}
                  </span>
                </td>
                <td class="num nowrap">
                  <button mat-icon-button (click)="open(u)" matTooltip="แก้ไข" aria-label="แก้ไข">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    (click)="resetPassword(u)"
                    matTooltip="ตั้งรหัสผ่านใหม่"
                    aria-label="ตั้งรหัสผ่านใหม่"
                  >
                    <mat-icon>key</mat-icon>
                  </button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="empty">ไม่พบผู้ใช้</td></tr>
            }
          </tbody>
        </table>
      </div>

      <mat-paginator
        [length]="result()?.meta?.total ?? 0"
        [pageIndex]="page() - 1"
        [pageSize]="20"
        [hidePageSize]="true"
        (page)="onPage($event)"
      />
      <p class="muted">ผู้ใช้ลบไม่ได้เพราะประวัติรับ-จ่ายต้องอ้างถึงผู้ทำรายการ ให้ใช้การปิดบัญชีแทน</p>
    </section>
  `,
  styles: `
    .simple {
      border-collapse: collapse;
      th, td {
        padding: 8px;
        text-align: left;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
    }
    .nowrap {
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersPage {
  private users = inject(UserService);
  private dialog = inject(MatDialog);
  private notify = inject(Notify);

  protected readonly me = inject(AuthService).user;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly result = signal<Page<User> | null>(null);
  protected readonly page = signal(1);
  protected readonly search = new FormControl('', { nonNullable: true });

  constructor() {
    this.load();
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => {
        this.page.set(1);
        this.load();
      });
  }

  private load(): void {
    this.users.list({ search: this.search.value.trim() || undefined, page: this.page(), limit: 20 }).subscribe({
      next: (page) => this.result.set(page),
      error: (err: unknown) => this.notify.error(err),
    });
  }

  protected onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.load();
  }

  protected open(user: User | null): void {
    this.dialog
      .open<UserDialog, User | null, User>(UserDialog, { data: user, width: '440px' })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.notify.success(`บันทึกผู้ใช้ ${saved.fullName} แล้ว`);
        this.load();
      });
  }

  protected resetPassword(user: User): void {
    const data: ReasonDialogData = {
      title: 'ตั้งรหัสผ่านใหม่',
      message: `ตั้งรหัสผ่านใหม่ให้ ${user.fullName} (${user.email})`,
      label: 'รหัสผ่านใหม่',
      confirmText: 'บันทึกรหัสผ่าน',
      type: 'password',
      minLength: 8,
    };
    this.dialog
      .open<ReasonDialog, ReasonDialogData, string>(ReasonDialog, { data, width: '440px' })
      .afterClosed()
      .subscribe((password) => {
        if (!password) return;
        this.users.resetPassword(user.id, password).subscribe({
          next: () => this.notify.success(`ตั้งรหัสผ่านใหม่ให้ ${user.fullName} แล้ว`),
          error: (err: unknown) => this.notify.error(err),
        });
      });
  }
}
