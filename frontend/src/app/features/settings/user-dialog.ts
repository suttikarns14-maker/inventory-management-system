import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Role, ROLE_LABELS, User } from '../../shared/models/user';
import { Notify } from '../../shared/services/notify';
import { applyServerErrors } from '../../shared/utils/api-error';
import { UserService } from './user.service';

/** Create (data = null) or edit a user. Closes with the saved user. */
@Component({
  selector: 'app-user-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ user ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="fields">
        <mat-form-field>
          <mat-label>อีเมล</mat-label>
          <input matInput type="email" formControlName="email" />
          <mat-error>{{ form.controls.email.getError('server') ?? 'กรุณากรอกอีเมลให้ถูกต้อง' }}</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>ชื่อ-นามสกุล</mat-label>
          <input matInput formControlName="fullName" />
          <mat-error>กรุณากรอกชื่อ-นามสกุล</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>สิทธิ์การใช้งาน</mat-label>
          <mat-select formControlName="role">
            @for (r of roles; track r) {
              <mat-option [value]="r">{{ roleLabels[r] }} ({{ r }})</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (user) {
          <mat-checkbox formControlName="isActive">เปิดใช้งานบัญชี</mat-checkbox>
        } @else {
          <mat-form-field>
            <mat-label>รหัสผ่านเริ่มต้น</mat-label>
            <input matInput type="password" formControlName="password" autocomplete="new-password" />
            <mat-hint>อย่างน้อย 8 ตัวอักษร</mat-hint>
            <mat-error>
              {{ form.controls.password.getError('server') ?? 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }}
            </mat-error>
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
        <button mat-flat-button type="submit" [disabled]="saving()">บันทึก</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .fields {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 8px !important;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserDialog {
  protected readonly user = inject<User | null>(MAT_DIALOG_DATA);
  private ref = inject<MatDialogRef<UserDialog, User>>(MatDialogRef);
  private users = inject(UserService);
  private notify = inject(Notify);

  protected readonly roles: Role[] = ['ADMIN', 'STAFF', 'USER'];
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly saving = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: [
      { value: this.user?.email ?? '', disabled: !!this.user },
      [Validators.required, Validators.email],
    ],
    fullName: [this.user?.fullName ?? '', Validators.required],
    role: [this.user?.role ?? ('USER' as Role)],
    isActive: [this.user?.isActive ?? true],
    password: ['', this.user ? [] : [Validators.required, Validators.minLength(8)]],
  });

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const request = this.user
      ? this.users.update(this.user.id, { fullName: v.fullName.trim(), role: v.role, isActive: v.isActive })
      : this.users.create({
          email: v.email.trim(),
          fullName: v.fullName.trim(),
          role: v.role,
          password: v.password,
        });
    this.saving.set(true);
    request.subscribe({
      next: (saved) => this.ref.close(saved),
      error: (err: unknown) => {
        this.saving.set(false);
        if (!applyServerErrors(this.form, err)) this.notify.error(err);
      },
    });
  }
}
