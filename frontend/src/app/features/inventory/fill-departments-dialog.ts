import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { map } from 'rxjs';
import { Department } from '../../shared/models/lookup';
import { StockTransaction } from '../../shared/models/transaction';
import { Notify } from '../../shared/services/notify';
import { applyServerErrors } from '../../shared/utils/api-error';
import { InventoryService } from './inventory.service';

export interface FillDepartmentsData {
  txn: StockTransaction;
  departments: Department[];
}

/** Empty is fine (fill one field now, the other later); typed text must be a picked option. */
const pickedOrEmpty = (c: AbstractControl): ValidationErrors | null =>
  !c.value || typeof c.value === 'object' ? null : { picked: true };

/**
 * ADMIN fills in a department the import could not match (decision D14). Only empty fields are
 * shown; the old name from the Excel file is in the note. Closes with the updated transaction.
 */
@Component({
  selector: 'app-fill-departments-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule],
  template: `
    <h2 mat-dialog-title>เติมหน่วยงาน {{ data.txn.referenceNo }}</h2>
    <mat-dialog-content>
      <p class="muted">หมายเหตุเดิม: {{ data.txn.note ?? '-' }}</p>
      <p class="muted">เลือกได้เฉพาะช่องที่ยังว่าง บันทึกแล้วแก้ไขไม่ได้</p>
      <form [formGroup]="form" class="fields">
        @if (!data.txn.requestingDepartment) {
          <mat-form-field>
            <mat-label>หน่วยงานที่เบิก (หน่วยงานหลัก)</mat-label>
            <input matInput formControlName="requestingDepartmentId" [matAutocomplete]="reqAuto" placeholder="พิมพ์เพื่อค้นหา" />
            <mat-autocomplete #reqAuto="matAutocomplete" [displayWith]="displayName" requireSelection>
              @for (d of requestingOptions(); track d.id) {
                <mat-option [value]="d">{{ d.name }}</mat-option>
              }
            </mat-autocomplete>
            <mat-error>
              {{ form.controls.requestingDepartmentId.getError('server') ?? 'กรุณาเลือกจากรายการ' }}
            </mat-error>
          </mat-form-field>
        } @else {
          <p>หน่วยงานที่เบิก: {{ data.txn.requestingDepartment.name }}</p>
        }
        @if (!data.txn.usingDepartment) {
          <mat-form-field>
            <mat-label>หน่วยงานที่ใช้</mat-label>
            <input matInput formControlName="usingDepartmentId" [matAutocomplete]="usingAuto" placeholder="พิมพ์เพื่อค้นหา" />
            <mat-autocomplete #usingAuto="matAutocomplete" [displayWith]="displayName" requireSelection>
              @for (d of usingOptions(); track d.id) {
                <mat-option [value]="d">
                  {{ d.name }}
                  @if (d.kind === 'MAIN') {
                    <span class="muted">(หลัก)</span>
                  }
                </mat-option>
              }
            </mat-autocomplete>
            <mat-error>
              {{ form.controls.usingDepartmentId.getError('server') ?? 'กรุณาเลือกจากรายการ' }}
            </mat-error>
          </mat-form-field>
        } @else {
          <p>หน่วยงานที่ใช้: {{ data.txn.usingDepartment.name }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button [disabled]="saving()" (click)="save()">บันทึก</button>
    </mat-dialog-actions>
  `,
  styles: `
    .fields {
      display: flex;
      flex-direction: column;
      min-width: min(420px, 80vw);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FillDepartmentsDialog {
  protected readonly data = inject<FillDepartmentsData>(MAT_DIALOG_DATA);
  private ref = inject<MatDialogRef<FillDepartmentsDialog, StockTransaction>>(MatDialogRef);
  private inventory = inject(InventoryService);
  private notify = inject(Notify);

  protected readonly form = new FormGroup({
    requestingDepartmentId: new FormControl<string | Department>('', { nonNullable: true, validators: pickedOrEmpty }),
    usingDepartmentId: new FormControl<string | Department>('', { nonNullable: true, validators: pickedOrEmpty }),
  });
  protected readonly saving = signal(false);

  private textOf = (c: FormControl<string | Department>) =>
    toSignal(c.valueChanges.pipe(map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))), { initialValue: '' });
  private readonly requestingText = this.textOf(this.form.controls.requestingDepartmentId);
  private readonly usingText = this.textOf(this.form.controls.usingDepartmentId);
  private readonly active = this.data.departments.filter((d) => d.isActive);
  protected readonly requestingOptions = computed(() =>
    this.filter(this.active.filter((d) => d.kind === 'MAIN'), this.requestingText()),
  );
  protected readonly usingOptions = computed(() => this.filter(this.active, this.usingText()));
  protected readonly displayName = (d: Department | string | null) => (d && typeof d === 'object' ? d.name : (d ?? ''));

  private filter(rows: Department[], text: string): Department[] {
    return text ? rows.filter((r) => r.name.toLowerCase().includes(text)) : rows;
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const id = (v: string | Department) => (typeof v === 'object' ? v.id : null);
    const { requestingDepartmentId, usingDepartmentId } = this.form.getRawValue();
    const input = { requestingDepartmentId: id(requestingDepartmentId), usingDepartmentId: id(usingDepartmentId) };
    if (!input.requestingDepartmentId && !input.usingDepartmentId) {
      this.notify.error('กรุณาเลือกหน่วยงานอย่างน้อย 1 ช่อง');
      return;
    }
    this.saving.set(true);
    this.inventory.fillDepartments(this.data.txn.id, input).subscribe({
      next: (txn) => this.ref.close(txn),
      error: (err: unknown) => {
        this.saving.set(false);
        if (!applyServerErrors(this.form, err)) this.notify.error(err);
      },
    });
  }
}
