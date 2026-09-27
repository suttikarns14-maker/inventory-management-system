import { DATE_PIPE_DEFAULT_OPTIONS, registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeTh from '@angular/common/locales/th';
import {
  ApplicationConfig,
  inject,
  LOCALE_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { mockApiInterceptor } from './core/mock/mock-api.interceptor';
import { USE_MOCK_API } from './core/mock/mock-backend';
import { thaiPaginatorIntl } from './shared/utils/paginator-intl';

registerLocaleData(localeTh);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // The mock must be last: it stands in for the network at the end of the chain.
    provideHttpClient(
      withInterceptors([authInterceptor, ...(USE_MOCK_API ? [mockApiInterceptor] : [])]),
    ),
    provideAppInitializer(() => inject(AuthService).loadMe()),
    { provide: LOCALE_ID, useValue: 'th' },
    {
      provide: DATE_PIPE_DEFAULT_OPTIONS,
      useValue: { timezone: '+0700', dateFormat: 'd MMM y HH:mm' },
    },
    { provide: MatPaginatorIntl, useFactory: thaiPaginatorIntl },
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline', subscriptSizing: 'dynamic' },
    },
  ],
};
