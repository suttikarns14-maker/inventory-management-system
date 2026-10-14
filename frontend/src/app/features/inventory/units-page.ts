import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Page } from '../../shared/models/api';
import { MaterialUnit } from '../../shared/models/unit';
import { Notify } from '../../shared/services/notify';
import { UnitTable } from './unit-table';
import { UnitService } from './unit.service';

/** "Where is this serial?" across the whole stock, plus the list of placeholders to fix (spec v2.2 §4). */
@Component({
  selector: 'app-units-page',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatCheckboxModule,
    MatPaginatorModule,
    MatProgressBarModule,
    UnitTable,
  ],
  template: `
    <div class="page-header"><h1>ค้นหา Serial Number</h1></div>
    <section class="card">
      <div class="filters">
        <mat-form-field>
          <mat-label>S/N (พิมพ์บางส่วนได้)</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput [ngModel]="search()" (ngModelChange)="search.set($event); reload()" />
        </mat-form-field>
        <mat-checkbox [checked]="tempOnly()" (change)="tempOnly.set($event.checked); reload()">
          เฉพาะ S/N ชั่วคราว (รอแก้เป็น S/N จริง)
        </mat-checkbox>
      </div>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <app-unit-table
        [units]="result()?.items ?? []"
        [showMaterial]="true"
        [canEdit]="canEdit"
        [emptyText]="search() || tempOnly() ? 'ไม่พบ S/N ตามเงื่อนไข' : 'พิมพ์ S/N เพื่อค้นหา'"
        (changed)="load()"
      />
      <mat-paginator
        [length]="result()?.meta?.total ?? 0"
        [pageIndex]="page() - 1"
        [pageSize]="20"
        [hidePageSize]="true"
        (page)="onPage($event)"
      />
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitsPage {
  private units = inject(UnitService);
  private notify = inject(Notify);

  protected readonly canEdit = inject(AuthService).hasRole('ADMIN');
  protected readonly search = signal('');
  /** `?tempOnly=true` comes from the dashboard's data-quality card. */
  protected readonly tempOnly = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('tempOnly') === 'true');
  protected readonly page = signal(1);
  protected readonly result = signal<Page<MaterialUnit> | null>(null);
  protected readonly loading = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.load(); // no-op unless tempOnly came from the URL
  }

  protected reload(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 300);
  }

  protected onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.load();
  }

  protected load(): void {
    const search = this.search().trim();
    // Listing every serial in the system is not useful; ask for a search or the placeholder filter.
    if (!search && !this.tempOnly()) {
      this.result.set(null);
      return;
    }
    this.loading.set(true);
    this.units.search({ search: search || undefined, tempOnly: this.tempOnly() || undefined, page: this.page(), limit: 20 }).subscribe({
      next: (p) => {
        this.result.set(p);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.notify.error(err);
        this.loading.set(false);
      },
    });
  }
}
