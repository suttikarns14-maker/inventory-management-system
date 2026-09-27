import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { errorMessage } from '../utils/api-error';

@Injectable({ providedIn: 'root' })
export class Notify {
  private snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.snackBar.open(message, 'ปิด', { duration: 4000, panelClass: 'snack-success' });
  }

  error(errOrMessage: unknown): void {
    const message = typeof errOrMessage === 'string' ? errOrMessage : errorMessage(errOrMessage);
    this.snackBar.open(message, 'ปิด', { duration: 6000, panelClass: 'snack-error' });
  }
}
