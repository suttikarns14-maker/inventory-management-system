import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden-page',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="forbidden">
      <mat-icon>block</mat-icon>
      <h1>ไม่มีสิทธิ์เข้าถึงหน้านี้</h1>
      <p class="muted">บัญชีของคุณไม่มีสิทธิ์ใช้งานส่วนนี้ หากต้องการใช้งานกรุณาติดต่อผู้ดูแลระบบ</p>
      <a mat-flat-button routerLink="/">กลับหน้าหลัก</a>
    </div>
  `,
  styles: `
    .forbidden {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px;
      text-align: center;
      mat-icon {
        width: 64px;
        height: 64px;
        font-size: 64px;
        color: var(--app-danger);
      }
      h1 {
        margin: 0;
        font: var(--mat-sys-headline-small);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForbiddenPage {}
