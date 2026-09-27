import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { AuthService, homeFor } from '../../core/auth/auth.service';
import { USE_MOCK_API } from '../../core/mock/mock-backend';
import { MOCK_ACCOUNTS, MOCK_PASSWORD } from '../../core/mock/mock-seed';
import { errorMessage } from '../../shared/utils/api-error';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <div class="login">
      <form class="login-card" [formGroup]="form" (ngSubmit)="submit()">
        <div class="login-brand">
          <mat-icon>warehouse</mat-icon>
          <h1>ระบบคลังวัสดุ</h1>
        </div>

        <mat-form-field>
          <mat-label>อีเมล</mat-label>
          <input matInput type="email" formControlName="email" autocomplete="username" />
          <mat-error>กรุณากรอกอีเมล</mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>รหัสผ่าน</mat-label>
          <input
            matInput
            [type]="showPassword() ? 'text' : 'password'"
            formControlName="password"
            autocomplete="current-password"
          />
          <button
            mat-icon-button
            matSuffix
            type="button"
            (click)="showPassword.set(!showPassword())"
            [attr.aria-label]="showPassword() ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
          >
            <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
          <mat-error>กรุณากรอกรหัสผ่าน</mat-error>
        </mat-form-field>

        @if (error()) {
          <p class="text-danger" role="alert">{{ error() }}</p>
        }

        <button mat-flat-button type="submit" [disabled]="loading()">
          {{ loading() ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ' }}
        </button>

        @if (useMock) {
          <div class="demo">
            <p class="muted">บัญชีทดสอบ (รหัสผ่าน {{ mockPassword }})</p>
            <div class="demo-buttons">
              @for (account of accounts; track account.email) {
                <button mat-stroked-button type="button" (click)="fill(account.email)">
                  {{ account.label }}
                </button>
              }
            </div>
          </div>
        }
      </form>
    </div>
  `,
  styles: `
    .login {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 16px;
      background: var(--mat-sys-surface-container);
    }
    .login-card {
      width: min(400px, 100%);
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 32px;
      border-radius: 16px;
      background: var(--mat-sys-surface-container-lowest);
      box-shadow: var(--mat-sys-level2);
    }
    .login-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      color: var(--mat-sys-primary);
      h1 {
        margin: 0;
        font: var(--mat-sys-headline-small);
      }
    }
    .demo {
      margin-top: 8px;
      padding-top: 16px;
      border-top: 1px dashed var(--mat-sys-outline-variant);
      p {
        margin: 0 0 8px;
      }
    }
    .demo-buttons {
      display: flex;
      gap: 8px;
      button {
        flex: 1;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  protected readonly useMock = USE_MOCK_API;
  protected readonly accounts = MOCK_ACCOUNTS;
  protected readonly mockPassword = MOCK_PASSWORD;
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly showPassword = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  protected fill(email: string): void {
    this.form.setValue({ email, password: MOCK_PASSWORD });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.loading.set(true);
    this.error.set('');
    this.auth.login(email.trim(), password).subscribe({
      next: (user) => this.router.navigateByUrl(homeFor(user.role)),
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
