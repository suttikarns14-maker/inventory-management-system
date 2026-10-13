import express, { Router } from 'express';
import {
  auth,
  category,
  dashboards,
  imports,
  inventory,
  lookup,
  material,
  unit,
  user,
} from '../controllers/index.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import { loginLimiter } from '../middlewares/rate-limit.middleware.js';

/** All routes of spec §4.3, mounted at /api/v1. Roles follow spec §1. */
export function apiRouter(): Router {
  const r = Router();
  const admin = requireRole('ADMIN');
  const staff = requireRole('ADMIN', 'STAFF');

  r.post('/auth/login', loginLimiter(), auth.login);

  // Everything below needs a session.
  r.use(requireAuth);
  r.post('/auth/logout', auth.logout);
  r.get('/auth/me', auth.me);

  r.get('/users/options', staff, user.options);
  r.get('/users', admin, user.list);
  r.post('/users', admin, user.create);
  r.put('/users/:id', admin, user.update);
  r.put('/users/:id/password', admin, user.resetPassword);

  r.get('/categories', category.list);
  r.post('/categories', admin, category.create);
  r.put('/categories/:id', admin, category.update);

  r.get('/materials', material.list);
  r.get('/materials/:id', material.get);
  r.get('/materials/:id/units', unit.listForMaterial);
  r.post('/materials', staff, material.create);
  r.put('/materials/:id', admin, material.update);

  // IN vs OUT permission depends on the body, so the service checks it.
  r.post('/inventory/transactions', inventory.create);
  r.get('/inventory/transactions/:id', inventory.get);
  r.post('/inventory/transactions/:id/reverse', admin, inventory.reverse);
  r.get('/inventory/history', inventory.history);

  // Serial numbers and reference lists (spec v2.2 §3)
  r.get('/units', staff, unit.search);
  r.put('/units/:id', admin, unit.update);
  r.get('/lookups', lookup.all);
  r.post('/lookups/departments', admin, lookup.createDepartment);
  r.put('/lookups/departments/:id', admin, lookup.updateDepartment);
  r.post('/lookups/buildings', admin, lookup.createBuilding);
  r.put('/lookups/buildings/:id', admin, lookup.updateBuilding);
  r.post('/lookups/storage-locations', admin, lookup.createStorageLocation);
  r.put('/lookups/storage-locations/:id', admin, lookup.updateStorageLocation);

  // Excel import (spec v2.2 §5): the file is sent as the raw request body.
  const upload = express.raw({ type: () => true, limit: '20mb' });
  r.post('/import/initial/preview', admin, upload, imports.previewInitial);
  r.post('/import/initial/commit', admin, imports.commitInitial);
  r.post('/import/receipt/preview', admin, upload, imports.previewReceipt);
  r.post('/import/receipt/commit', admin, imports.commitReceipt);
  r.get('/import/receipt/template', admin, imports.template);

  r.get('/dashboard/summary', staff, dashboards.summary);
  r.get('/dashboard/reorder-suggestions', staff, dashboards.reorder);
  r.get('/dashboard/top-withdrawn', staff, dashboards.topWithdrawn);
  r.get('/dashboard/unused', staff, dashboards.unused);

  return r;
}
