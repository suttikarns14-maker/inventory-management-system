import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { AuthService, homeFor } from './core/auth/auth.service';
import { Shell } from './core/layout/shell';

// Role rules mirror spec §1; the back-end enforces them again.
export const routes: Routes = [
  {
    path: 'login',
    title: 'เข้าสู่ระบบ',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: '403',
    title: 'ไม่มีสิทธิ์เข้าถึง',
    loadComponent: () => import('./features/errors/forbidden-page').then((m) => m.ForbiddenPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      {
        path: 'dashboard',
        title: 'ภาพรวมคลัง',
        data: { roles: ['ADMIN', 'STAFF'] },
        loadComponent: () =>
          import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'materials',
        title: 'รายการวัสดุ',
        loadComponent: () =>
          import('./features/materials/material-list-page').then((m) => m.MaterialListPage),
      },
      {
        path: 'materials/new',
        title: 'เพิ่มวัสดุ',
        data: { roles: ['ADMIN', 'STAFF'] },
        loadComponent: () =>
          import('./features/materials/material-form-page').then((m) => m.MaterialFormPage),
      },
      {
        path: 'materials/:id/edit',
        title: 'แก้ไขวัสดุ',
        data: { roles: ['ADMIN'] },
        loadComponent: () =>
          import('./features/materials/material-form-page').then((m) => m.MaterialFormPage),
      },
      {
        path: 'inventory/transactions',
        title: 'รับเข้า / เบิกจ่าย',
        loadComponent: () =>
          import('./features/inventory/transaction-form-page').then((m) => m.TransactionFormPage),
      },
      {
        path: 'inventory/history',
        title: 'ประวัติรับ-จ่าย',
        loadComponent: () =>
          import('./features/inventory/history-page').then((m) => m.HistoryPage),
      },
      {
        path: 'settings/users',
        title: 'จัดการผู้ใช้',
        data: { roles: ['ADMIN'] },
        loadComponent: () => import('./features/settings/users-page').then((m) => m.UsersPage),
      },
      {
        path: 'settings/categories',
        title: 'หมวดหมู่วัสดุ',
        data: { roles: ['ADMIN'] },
        loadComponent: () =>
          import('./features/settings/categories-page').then((m) => m.CategoriesPage),
      },
      { path: '', pathMatch: 'full', redirectTo: () => homeFor(inject(AuthService).role()) },
    ],
  },
  { path: '**', redirectTo: '' },
];
