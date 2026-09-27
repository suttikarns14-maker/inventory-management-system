import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** The session cookie is sent by the browser; this only reacts to an expired/invalid session. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return next(req).pipe(
    catchError((err: unknown) => {
      const isAuthCall = req.url.endsWith('/auth/me') || req.url.endsWith('/auth/login');
      if (err instanceof HttpErrorResponse && err.status === 401 && !isAuthCall) {
        auth.user.set(null);
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
