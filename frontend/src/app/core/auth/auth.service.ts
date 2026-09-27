import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, tap } from 'rxjs';
import { ApiSuccess } from '../../shared/models/api';
import { Role, User } from '../../shared/models/user';
import { API, unwrap } from '../../shared/utils/http';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  readonly user = signal<User | null>(null);
  readonly role = computed(() => this.user()?.role ?? null);

  /** Called once at startup (provideAppInitializer). A 401 simply means "not logged in". */
  async loadMe(): Promise<void> {
    try {
      this.user.set(await firstValueFrom(this.http.get<ApiSuccess<User>>(`${API}/auth/me`).pipe(unwrap())));
    } catch {
      this.user.set(null);
    }
  }

  login(email: string, password: string) {
    return this.http
      .post<ApiSuccess<User>>(`${API}/auth/login`, { email, password })
      .pipe(unwrap(), tap((user) => this.user.set(user)));
  }

  logout() {
    return this.http.post<ApiSuccess<null>>(`${API}/auth/logout`, {}).pipe(tap(() => this.user.set(null)));
  }

  hasRole(...roles: Role[]): boolean {
    const role = this.role();
    return role !== null && roles.includes(role);
  }
}

/** Where each role lands after login (spec §1). */
export const homeFor = (role: Role | null): string =>
  role === 'USER' ? '/inventory/transactions' : '/dashboard';
