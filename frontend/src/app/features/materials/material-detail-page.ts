import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { StockBadge } from '../../shared/components/stock-badge';
import { Page } from '../../shared/models/api';
import { Material, TRACKING_LABELS } from '../../shared/models/material';
import { MaterialUnit, UnitStatus } from '../../shared/models/unit';
import { Notify } from '../../shared/services/notify';
import { UnitTable } from '../inventory/unit-table';
import { UnitService } from '../inventory/unit.service';
import { MaterialService } from './material.service';

/** Material details; for SERIAL materials, every serial number and where it is (spec v2.2 §4). */
@Component({
  selector: 'app-material-detail-page',
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatPaginatorModule,
    StockBadge,
    UnitTable,
  ],
  template: `
    <div class="page-header">
      <a mat-icon-button routerLink="/materials" aria-label="กลับ"><mat-icon>arrow_back</mat-icon></a>
      <h1>{{ material()?.name ?? 'รายละเอียดวัสดุ' }}</h1>
      @if (canEdit && material()) {
        <a mat-stroked-button [routerLink]="['/materials', id(), 'edit']"><mat-icon>edit</mat-icon> แก้ไข</a>
      }
    </div>

    @if (material(); as m) {
      <section class="card info">
        <div><span class="muted">รหัส</span>{{ m.code }}</div>
        <div><span class="muted">ยี่ห้อ / รุ่น</span>{{ m.brand ?? '-' }} / {{ m.model ?? '-' }}</div>
        <div><span class="muted">หมวดหมู่</span>{{ m.category.name }}</div>
        <div><span class="muted">วิธีติดตาม</span>{{ trackingLabels[m.trackingType] }}</div>
        <div><span class="muted">สถานที่เก็บ</span>{{ m.storageLocation?.name ?? '-' }}</div>
        <div>
          <span class="muted">คงเหลือ</span>{{ m.currentQuantity }} {{ m.unit }} (จุดสั่งซื้อ {{ m.minStock }})
          <app-stock-badge [currentQuantity]="m.currentQuantity" [minStock]="m.minStock" />
        </div>
      </section>

      @if (m.trackingType === 'SERIAL') {
        <section class="card">
          <h2>Serial Number</h2>
          <div class="filters">
            <mat-form-field>
              <mat-label>ค้นหา S/N</mat-label>
              <mat-icon matPrefix>search</mat-icon>
              <input matInput [ngModel]="search()" (ngModelChange)="search.set($event); reload()" />
            </mat-form-field>
            <mat-button-toggle-group
              [value]="status()"
              (change)="status.set($event.value); reload()"
              hideSingleSelectionIndicator
              aria-label="สถานะ"
            >
              <mat-button-toggle value="IN_STOCK">อยู่ในคลัง</mat-button-toggle>
              <mat-button-toggle value="ISSUED">เบิกแล้ว</mat-button-toggle>
              <mat-button-toggle [value]="null">ทั้งหมด</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
          <app-unit-table [units]="units()?.items ?? []" [canEdit]="canEdit" (changed)="load()" />
          <mat-paginator
            [length]="units()?.meta?.total ?? 0"
            [pageIndex]="page() - 1"
            [pageSize]="50"
            [hidePageSize]="true"
            (page)="onPage($event)"
          />
        </section>
      }
    }
  `,
  styles: `
    .info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px 24px;
      .muted {
        display: block;
        font: var(--mat-sys-label-medium);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialDetailPage implements OnInit {
  /** Bound from the `:id` route param. */
  readonly id = input.required<string>();

  private materials = inject(MaterialService);
  private unitService = inject(UnitService);
  private notify = inject(Notify);

  protected readonly canEdit = inject(AuthService).hasRole('ADMIN');
  protected readonly trackingLabels = TRACKING_LABELS;
  protected readonly material = signal<Material | null>(null);
  protected readonly units = signal<Page<MaterialUnit> | null>(null);
  protected readonly search = signal('');
  protected readonly status = signal<UnitStatus | null>('IN_STOCK');
  protected readonly page = signal(1);
  private searchTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.materials.get(this.id()).subscribe({
      next: (m) => {
        this.material.set(m);
        if (m.trackingType === 'SERIAL') this.loadUnits();
      },
      error: (err: unknown) => this.notify.error(err),
    });
  }

  protected reload(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.loadUnits();
    }, 300);
  }

  protected onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.loadUnits();
  }

  private loadUnits(): void {
    this.unitService
      .forMaterial(this.id(), {
        search: this.search().trim() || undefined,
        status: this.status() ?? undefined,
        page: this.page(),
        limit: 50,
      })
      .subscribe({
        next: (p) => this.units.set(p),
        error: (err: unknown) => this.notify.error(err),
      });
  }
}
