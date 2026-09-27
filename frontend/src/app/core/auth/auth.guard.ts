import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from '../../shared/models/user';
import { AuthService } from './auth.service';

/** Not logged in → /login. Logged in without one of `route.data.roles` → /403. */
export const authGuard: CanActivateFn = (route) => {
  const user = inject(AuthService).user();
  const router = inject(Router);
  if (!user) return router.createUrlTree(['/login']);
  const roles = route.data['roles'] as Role[] | undefined;
  return !roles || roles.includes(user.role) ? true : router.createUrlTree(['/403']);
};

/** Keeps a logged-in user away from /login. */
export const guestGuard: CanActivateFn = () =>
  inject(AuthService).user() ? inject(Router).createUrlTree(['/']) : true;
