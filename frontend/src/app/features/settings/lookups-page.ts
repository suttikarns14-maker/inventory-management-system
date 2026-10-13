import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ReasonDialog, ReasonDialogData } from '../../shared/components/reason-dialog';
import { Department, DepartmentKind, LookupItem, LookupKind, Lookups } from '../../shared/models/lookup';
import { LookupService } from '../../shared/services/lookup.service';
import { Notify } from '../../shared/services/notify';

interface Tab {
  kind: LookupKind;
  label: string;
  rows: (LookupItem & { kind?: DepartmentKind })[];
}

/** ADMIN: departments, buildings and storage locations (spec v2.2 Q4). Deactivate instead of delete. */
@Component({
  selector: 'app-lookups-page',
  imports: [
    FormsModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  template: `
    <div class="page-header"><h1>ข้อมูลอ้างอิง</h1></div>
    <section class="card">
      <mat-tab-group (selectedIndexChange)="tabIndex.set($event)" animationDuration="0ms">
        @for (tab of tabs(); track tab.kind) {
          <mat-tab [label]="tab.label + ' (' + tab.rows.length + ')'" />
        }
      </mat-tab-group>

      @if (tab(); as t) {
        <div class="filters add">
          <mat-form-field>
            <mat-label>เพิ่ม{{ t.label }}</mat-label>
            <input matInput [(ngModel)]="newName" (keydown.enter)="add(t)" />
          </mat-form-field>
          @if (t.kind === 'departments') {
            <mat-button-toggle-group [(ngModel)]="newKind" hideSingleSelectionIndicator aria-label="ประเภทหน่วยงาน">
              <mat-button-toggle value="MAIN">หน่วยงานหลัก</mat-button-toggle>
              <mat-button-toggle value="SUB">หน่วยงานย่อย</mat-button-toggle>
            </mat-button-toggle-group>
          }
          <button mat-flat-button (click)="add(t)" [disabled]="!newName.trim()">เพิ่ม</button>
          <mat-form-field>
            <mat-label>ค้นหา</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [ngModel]="filter()" (ngModelChange)="filter.set($event)" />
          </mat-form-field>
        </div>

        <div class="table-wrap">
          <table class="simple">
            <thead>
              <tr>
                <th>ชื่อ</th>
                @if (t.kind === 'departments') {
                  <th>ประเภท</th>
                }
                <th>ใช้งาน</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (r of visibleRows(); track r.id) {
                <tr [class.muted]="!r.isActive">
                  <td>{{ r.name }}</td>
                  @if (t.kind === 'departments') {
                    <td>{{ r.kind === 'MAIN' ? 'หลัก' : 'ย่อย' }}</td>
                  }
                  <td>
                    <mat-slide-toggle [checked]="r.isActive" (change)="save(t, r, { isActive: $event.checked })" />
                  </td>
                  <td>
                    <button mat-icon-button (click)="rename(t, r)" matTooltip="แก้ชื่อ" aria-label="แก้ชื่อ">
                      <mat-icon>edit</mat-icon>
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="empty">ไม่มีข้อมูล</td></tr>
              }
            </tbody>
          </table>
        </div>
        <p class="muted">ปิดใช้งานแทนการลบ: ค่าที่ปิดจะไม่อยู่ในตัวเลือกตอนเบิก แต่ประวัติเดิมยังแสดงชื่อนี้</p>
      }
    </section>
  `,
  styles: `
    .add {
      margin-top: 16px;
    }
    .simple {
      border-collapse: collapse;
      th, td {
        padding: 4px 8px;
        text-align: left;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LookupsPage {
  private service = inject(LookupService);
  private dialog = inject(MatDialog);
  private notify = inject(Notify);

  private readonly lookups = signal<Lookups | null>(null);
  protected readonly tabIndex = signal(0);
  protected readonly filter = signal('');
  protected newName = '';
  protected newKind: DepartmentKind = 'SUB';

  protected readonly tabs = computed<Tab[]>(() => {
    const l = this.lookups();
    return [
      { kind: 'departments', label: 'หน่วยงาน', rows: l?.departments ?? [] },
      { kind: 'buildings', label: 'อาคาร', rows: l?.buildings ?? [] },
      { kind: 'storage-locations', label: 'สถานที่เก็บของ', rows: l?.storageLocations ?? [] },
    ];
  });
  protected readonly tab = computed(() => this.tabs()[this.tabIndex()]);
  protected readonly visibleRows = computed(() => {
    const text = this.filter().trim().toLowerCase();
    const rows = this.tab()?.rows ?? [];
    return text ? rows.filter((r) => r.name.toLowerCase().includes(text)) : rows;
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.service.all().subscribe({
      next: (l) => this.lookups.set(l),
      error: (err: unknown) => this.notify.error(err),
    });
  }

  protected add(t: Tab): void {
    const name = this.newName.trim();
    if (!name) return;
    this.service
      .create(t.kind, { name, isActive: true, ...(t.kind === 'departments' && { kind: this.newKind }) })
      .subscribe({
        next: () => {
          this.notify.success(`เพิ่ม "${name}" แล้ว`);
          this.newName = '';
          this.load();
        },
        error: (err: unknown) => this.notify.error(err),
      });
  }

  protected save(t: Tab, row: LookupItem & { kind?: DepartmentKind }, changes: Partial<LookupItem>): void {
    const next = { name: row.name, isActive: row.isActive, ...(row.kind && { kind: row.kind }), ...changes };
    this.service.update(t.kind, row.id, next).subscribe({
      next: () => this.load(),
      error: (err: unknown) => {
        this.notify.error(err);
        this.load();
      },
    });
  }

  protected rename(t: Tab, row: LookupItem | Department): void {
    const data: ReasonDialogData = {
      title: `แก้ชื่อ${t.label}`,
      message: `ชื่อเดิม: ${row.name}`,
      label: 'ชื่อใหม่',
      confirmText: 'บันทึก',
    };
    this.dialog
      .open<ReasonDialog, ReasonDialogData, string>(ReasonDialog, { data, width: '440px' })
      .afterClosed()
      .subscribe((name) => name && this.save(t, row, { name }));
  }
}
