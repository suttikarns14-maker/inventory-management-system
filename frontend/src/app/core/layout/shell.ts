import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { Role, ROLE_LABELS } from '../../shared/models/user';
import { AuthService } from '../auth/auth.service';
import { MockBackend, USE_MOCK_API } from '../mock/mock-backend';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { path: '/dashboard', label: 'ภาพรวมคลัง', icon: 'dashboard', roles: ['ADMIN', 'STAFF'] },
  { path: '/materials', label: 'รายการวัสดุ', icon: 'inventory_2' },
  { path: '/inventory/transactions', label: 'รับเข้า / เบิกจ่าย', icon: 'swap_horiz' },
  { path: '/inventory/history', label: 'ประวัติรับ-จ่าย', icon: 'history' },
  { path: '/settings/categories', label: 'หมวดหมู่วัสดุ', icon: 'category', roles: ['ADMIN'] },
  { path: '/settings/users', label: 'จัดการผู้ใช้', icon: 'group', roles: ['ADMIN'] },
];

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  private auth = inject(AuthService);
  private router = inject(Router);
  // Only create the mock store when the mock is on; otherwise it would seed localStorage for nothing.
  private mock = USE_MOCK_API ? inject(MockBackend) : null;

  protected readonly useMock = USE_MOCK_API;
  protected readonly user = this.auth.user;
  protected readonly roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? ROLE_LABELS[role] : '';
  });
  protected readonly nav = computed(() => {
    const role = this.auth.role();
    return NAV.filter((item) => !item.roles || (role && item.roles.includes(role))).map((item) =>
      item.path === '/inventory/transactions' && role === 'USER'
        ? { ...item, label: 'เบิกวัสดุ' }
        : item,
    );
  });
  protected readonly isMobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 959px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  protected logout(): void {
    const done = () => this.router.navigate(['/login']);
    this.auth.logout().subscribe({ next: done, error: done });
  }

  protected resetData(): void {
    if (confirm('ล้างข้อมูลทั้งหมดและกลับไปใช้ข้อมูลตัวอย่างเริ่มต้น?')) {
      this.mock?.reset();
      location.reload();
    }
  }
}
