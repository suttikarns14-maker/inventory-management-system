import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ReturnInput, ReturnLine, StockTransaction } from '../../shared/models/transaction';
import { Notify } from '../../shared/services/notify';
import { InventoryService } from './inventory.service';

/** Lines with nothing coming back are left out; a SERIAL line sends the ticked units. */
export function returnPayload(
  lines: ReturnLine[],
  quantities: Record<string, number>,
  units: Set<string>,
  note: string,
): ReturnInput {
  const items = lines.flatMap((l) => {
    if (l.trackingType === 'QUANTITY') {
      const quantity = quantities[l.materialId] ?? 0;
      return quantity > 0 ? [{ materialId: l.materialId, quantity }] : [];
    }
    const chosen = l.units.filter((u) => units.has(u.id)).map((u) => ({ unitId: u.id }));
    return chosen.length ? [{ materialId: l.materialId, quantity: chosen.length, units: chosen }] : [];
  });
  return { note: note.trim(), items };
}

/** D18: STAFF/ADMIN take good items back from a withdrawal. Closes with the new return transaction. */
@Component({
  selector: 'app-return-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>รับคืนจาก {{ data.referenceNo }}</h2>
    <mat-dialog-content>
      <p class="muted">ผู้เบิก: {{ data.requesterName }} · รับคืนเฉพาะของสภาพดี ของชำรุดไม่รับคืน</p>
      @if (lines(); as rows) {
        @for (l of rows; track l.materialId) {
          <section class="line">
            <div>
              <strong>{{ l.code }}</strong> {{ l.name }}
              <span class="muted">เบิก {{ l.issued }} คืนแล้ว {{ l.returned }} {{ l.unit }}</span>
            </div>
            @if (l.issued - l.returned === 0) {
              <span class="muted">คืนครบแล้ว</span>
            } @else if (l.trackingType === 'QUANTITY') {
              <mat-form-field class="qty">
                <mat-label>จำนวนที่คืน</mat-label>
                <input
                  matInput
                  type="number"
                  min="0"
                  [max]="l.issued - l.returned"
                  [value]="quantities()[l.materialId] ?? 0"
                  (input)="setQuantity(l, $event)"
                />
                <span matTextSuffix class="nowrap">/ {{ l.issued - l.returned }} {{ l.unit }}</span>
              </mat-form-field>
            } @else {
              <div class="serials">
                @for (u of l.units; track u.id) {
                  <mat-checkbox [checked]="units().has(u.id)" (change)="toggle(u.id)">{{ u.serialNumber }}</mat-checkbox>
                }
              </div>
            }
          </section>
        }
        <mat-form-field class="note">
          <mat-label>เหตุผลการคืน</mat-label>
          <textarea matInput [formControl]="note" rows="2" maxlength="400"></textarea>
          <mat-error>กรุณากรอกเหตุผล</mat-error>
        </mat-form-field>
      } @else {
        <p>กำลังโหลด...</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button [disabled]="saving() || !payload().items.length" (click)="save()">
        บันทึกรับคืน
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      min-width: min(480px, 80vw);
    }
    .line {
      margin-bottom: 12px;
    }
    .qty {
      width: 240px;
      margin-top: 4px;
    }
    .serials {
      display: flex;
      flex-wrap: wrap;
      gap: 0 12px;
    }
    .nowrap {
      white-space: nowrap;
    }
    .note {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnDialog {
  protected readonly data = inject<StockTransaction>(MAT_DIALOG_DATA);
  private ref = inject<MatDialogRef<ReturnDialog, StockTransaction>>(MatDialogRef);
  private inventory = inject(InventoryService);
  private notify = inject(Notify);

  protected readonly lines = signal<ReturnLine[] | null>(null);
  protected readonly quantities = signal<Record<string, number>>({});
  protected readonly units = signal(new Set<string>());
  protected readonly note = new FormControl('', { nonNullable: true, validators: Validators.required });
  protected readonly saving = signal(false);
  private readonly noteText = signal('');
  protected readonly payload = computed(() =>
    returnPayload(this.lines() ?? [], this.quantities(), this.units(), this.noteText()),
  );

  constructor() {
    this.note.valueChanges.subscribe((v) => this.noteText.set(v));
    this.inventory.returnable(this.data.id).subscribe({
      next: (r) => this.lines.set(r.lines),
      error: (err: unknown) => {
        this.notify.error(err);
        this.ref.close();
      },
    });
  }

  protected setQuantity(l: ReturnLine, e: Event): void {
    const input = e.target as HTMLInputElement;
    const quantity = Math.min(Math.max(Math.trunc(Number(input.value) || 0), 0), l.issued - l.returned);
    // Show what will be sent, e.g. 9 typed when only 3 can come back.
    if (input.value !== '' && Number(input.value) !== quantity) input.value = String(quantity);
    this.quantities.update((q) => ({ ...q, [l.materialId]: quantity }));
  }

  protected toggle(id: string): void {
    this.units.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected save(): void {
    this.note.markAsTouched();
    if (this.note.invalid || !this.note.value.trim()) return;
    this.saving.set(true);
    this.inventory.returnItems(this.data.id, this.payload()).subscribe({
      next: (txn) => this.ref.close(txn),
      error: (err: unknown) => {
        this.saving.set(false);
        this.notify.error(err);
      },
    });
  }
}
