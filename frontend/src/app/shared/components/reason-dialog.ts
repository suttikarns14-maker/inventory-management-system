import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ReasonDialogData {
  title: string;
  message: string;
  label: string;
  confirmText: string;
  /** 'password' turns this into a "set new password" prompt. */
  type?: 'text' | 'password';
  minLength?: number;
}

/** Asks for one required text value. Closes with the value, or undefined on cancel. */
@Component({
  selector: 'app-reason-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      <mat-form-field class="full">
        <mat-label>{{ data.label }}</mat-label>
        <input
          matInput
          [type]="data.type ?? 'text'"
          [formControl]="value"
          (keydown.enter)="submit()"
        />
        @if (value.hasError('minlength')) {
          <mat-error>ต้องมีอย่างน้อย {{ data.minLength }} ตัวอักษร</mat-error>
        } @else if (value.invalid) {
          <mat-error>กรุณากรอก{{ data.label }}</mat-error>
        }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="submit()">{{ data.confirmText }}</button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReasonDialog {
  protected readonly data = inject<ReasonDialogData>(MAT_DIALOG_DATA);
  private ref = inject<MatDialogRef<ReasonDialog, string>>(MatDialogRef);
  protected readonly value = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(this.data.minLength ?? 1)],
  });

  protected submit(): void {
    this.value.markAsTouched();
    if (this.value.valid && this.value.value.trim()) this.ref.close(this.value.value.trim());
  }
}
