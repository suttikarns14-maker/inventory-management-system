import { Router } from 'express';
import { auth, category, dashboards, inventory, material, user } from '../controllers/index.js';
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

  r.get('/users', admin, user.list);
  r.post('/users', admin, user.create);
  r.put('/users/:id', admin, user.update);
  r.put('/users/:id/password', admin, user.resetPassword);

  r.get('/categories', category.list);
  r.post('/categories', admin, category.create);
  r.put('/categories/:id', admin, category.update);

  r.get('/materials', material.list);
  r.get('/materials/:id', material.get);
  r.post('/materials', staff, material.create);
  r.put('/materials/:id', admin, material.update);

  // IN vs OUT permission depends on the body, so the service checks it.
  r.post('/inventory/transactions', inventory.create);
  r.get('/inventory/transactions/:id', inventory.get);
  r.post('/inventory/transactions/:id/reverse', admin, inventory.reverse);
  r.get('/inventory/history', inventory.history);

  r.get('/dashboard/summary', staff, dashboards.summary);
  r.get('/dashboard/reorder-suggestions', staff, dashboards.reorder);
  r.get('/dashboard/top-withdrawn', staff, dashboards.topWithdrawn);
  r.get('/dashboard/unused', staff, dashboards.unused);

  return r;
}
