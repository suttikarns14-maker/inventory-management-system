import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { mergeMap, of, throwError, timer } from 'rxjs';
import { MockBackend } from './mock-backend';

/** Answers every /api request from the in-browser mock instead of the network. */
export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const backend = inject(MockBackend);

  // A small random delay so loading states are visible, like a real server.
  return timer(150 + Math.random() * 250).pipe(
    mergeMap(() => {
      const url = new URL(req.urlWithParams, location.origin);
      const res = backend.api.handle({
        method: req.method,
        path: url.pathname,
        query: url.searchParams,
        body: req.body,
      });
      const body = JSON.parse(JSON.stringify(res.body)); // never hand out references to stored rows
      return res.status < 400
        ? of(new HttpResponse({ status: res.status, body, url: req.url }))
        : throwError(() => new HttpErrorResponse({ status: res.status, error: body, url: req.url }));
    }),
  );
};
