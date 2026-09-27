import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl } from '@angular/forms';
import { ApiErrorBody } from '../models/api';

export function apiError(err: unknown): ApiErrorBody['error'] | null {
  if (err instanceof HttpErrorResponse && (err.error as ApiErrorBody | null)?.success === false) {
    return (err.error as ApiErrorBody).error;
  }
  return null;
}

export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse && err.status === 0) return 'ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่';
  return apiError(err)?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

/**
 * Puts VALIDATION_ERROR / DUPLICATE_CODE field details onto the matching form controls.
 * Field paths like `items.0.quantity` map directly onto `form.get()`.
 * Returns true when at least one field error was shown.
 */
export function applyServerErrors(form: AbstractControl, err: unknown): boolean {
  let shown = false;
  for (const { field, message } of apiError(err)?.details ?? []) {
    const control = form.get(field);
    if (control) {
      control.setErrors({ server: message });
      control.markAsTouched();
      shown = true;
    }
  }
  return shown;
}
