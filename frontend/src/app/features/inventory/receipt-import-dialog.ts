import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ReceiptImportPreview } from '../../shared/models/import';
import { TRACKING_LABELS, TrackingType } from '../../shared/models/material';
import { ImportService } from '../../shared/services/import.service';
import { Notify } from '../../shared/services/notify';

/** ADMIN: receive a new purchase from an Excel file (spec v2.2 §5.4). Closes with true when saved. */
@Component({
  selector: 'app-receipt-import-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>นำเข้ารายการรับเข้าจากไฟล์</h2>
    <mat-dialog-content>
      <div class="steps">
        <button mat-stroked-button (click)="imports.downloadTemplate()">
          <mat-icon>download</mat-icon> ดาวน์โหลดไฟล์ตัวอย่าง
        </button>
        <button mat-flat-button (click)="file.click()" [disabled]="busy()">
          <mat-icon>upload_file</mat-icon> {{ fileName() || 'เลือกไฟล์ .xlsx' }}
        </button>
        <input #file type="file" accept=".xlsx" hidden (change)="choose($event)" />
      </div>
      <p class="muted">คอลัมน์เหมือนชีต "รายการ": ชื่อวัสดุ, ยี่ห้อ, รุ่น, รหัสสินค้า(S/N), ประเภทอุปกรณ์, ปีงบประมาณ, ราคาต่อหน่วย, ชื่อโครงการ (TOR), สถานที่เก็บของ</p>

      @if (busy()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (preview(); as p) {
        <div class="summary">
          <span>{{ p.summary.rows }} ชิ้น</span>
          <span>{{ p.summary.materials }} วัสดุ (ใหม่ {{ p.summary.newMaterials }})</span>
          <span>{{ p.summary.receipts }} รายการรับเข้า</span>
        </div>

        @if (p.issues.length) {
          <div class="issues">
            @for (i of p.issues; track $index) {
              <div [class.text-danger]="i.blocking">
                <mat-icon>{{ i.blocking ? 'error' : 'warning' }}</mat-icon>
                @if (i.row) {
                  แถว {{ i.row }}:
                }
                {{ i.message }}
              </div>
            }
          </div>
        }

        <div class="table-wrap">
          <table class="simple">
            <thead>
              <tr>
                <th>รหัส</th>
                <th>วัสดุ</th>
                <th class="num">ชิ้น</th>
                <th class="num">มี S/N</th>
                <th>วิธีติดตาม</th>
              </tr>
            </thead>
            <tbody>
              @for (m of p.materials; track m.key) {
                <tr>
                  <td>
                    {{ m.code }}
                    @if (!m.existing) {
                      <span class="badge badge-warn">ใหม่</span>
                    }
                  </td>
                  <td>
                    {{ m.name }}
                    <div class="muted">{{ m.brand ?? '' }} {{ m.model ?? '' }}</div>
                  </td>
                  <td class="num">{{ m.units }}</td>
                  <td class="num">{{ m.validSerials }}</td>
                  <td>
                    @if (m.existing) {
                      {{ labels[m.proposed] }}
                    } @else {
                      <mat-select [value]="tracking()[m.key] ?? m.proposed" (selectionChange)="setTracking(m.key, $event.value)">
                        <mat-option value="SERIAL">{{ labels.SERIAL }}</mat-option>
                        <mat-option value="QUANTITY">{{ labels.QUANTITY }}</mat-option>
                      </mat-select>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="muted">วัสดุรายชิ้นที่บางแถวไม่มี S/N จะได้ S/N ชั่วคราว (...-TEMP-SN-NN) ให้แก้ภายหลังที่หน้า "ค้นหา S/N"</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button [disabled]="!canCommit() || busy()" (click)="commit()">ยืนยันนำเข้า</button>
    </mat-dialog-actions>
  `,
  styles: `
    .steps {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .summary {
      display: flex;
      gap: 16px;
      margin: 12px 0;
      font: var(--mat-sys-title-small);
    }
    .issues {
      max-height: 160px;
      overflow-y: auto;
      margin-bottom: 12px;
      div {
        display: flex;
        gap: 6px;
        align-items: center;
      }
    }
    .simple {
      border-collapse: collapse;
      th, td {
        padding: 6px 8px;
        text-align: left;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptImportDialog {
  protected readonly imports = inject(ImportService);
  private ref = inject<MatDialogRef<ReceiptImportDialog, boolean>>(MatDialogRef);
  private notify = inject(Notify);

  protected readonly labels = TRACKING_LABELS;
  protected readonly fileName = signal('');
  protected readonly busy = signal(false);
  protected readonly preview = signal<ReceiptImportPreview | null>(null);
  protected readonly tracking = signal<Record<string, TrackingType>>({});
  /** Serial clashes may disappear if a new material is switched to QUANTITY; the server re-checks. */
  protected readonly canCommit = computed(
    () => !!this.preview()?.issues.every((i) => !i.blocking || i.message.includes('มีอยู่ในระบบแล้ว')),
  );

  protected choose(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.fileName.set(file.name);
    this.preview.set(null);
    this.tracking.set({});
    this.busy.set(true);
    this.imports.previewReceipt(file).subscribe({
      next: (p) => {
        this.preview.set(p);
        this.busy.set(false);
      },
      error: (err: unknown) => {
        this.notify.error(err);
        this.busy.set(false);
      },
    });
    (event.target as HTMLInputElement).value = '';
  }

  protected setTracking(key: string, value: TrackingType): void {
    this.tracking.update((t) => ({ ...t, [key]: value }));
  }

  protected commit(): void {
    const p = this.preview();
    if (!p) return;
    this.busy.set(true);
    this.imports.commitReceipt(p.importId, this.tracking()).subscribe({
      next: (r) => {
        this.notify.success(`นำเข้าสำเร็จ: ${r.transactions.map((t) => t.referenceNo).join(', ')}`);
        this.ref.close(true);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        // The preview is used up on the server either way; ask for the file again.
        this.preview.set(null);
        this.fileName.set('');
        this.notify.error(err);
      },
    });
  }
}
