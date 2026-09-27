import type { Request, Response } from 'express';
import * as dto from '../dtos/index.js';
import {
  clearSessionCookie,
  currentUser,
  setSessionCookie,
} from '../middlewares/auth.middleware.js';
import * as categories from '../services/category.service.js';
import * as dashboard from '../services/dashboard.service.js';
import * as materials from '../services/material.service.js';
import * as transactions from '../services/transaction.service.js';
import * as users from '../services/user.service.js';
import { ok, sendPage } from '../utils/http.js';

// Controllers only parse input (Zod DTOs; a ZodError becomes VALIDATION_ERROR in the error
// middleware) and shape the HTTP response. Business rules live in the services.

const id = (req: Request) => String(req.params['id']);

export const auth = {
  async login(req: Request, res: Response) {
    const user = await users.login(dto.loginSchema.parse(req.body));
    setSessionCookie(res, user.id);
    ok(res, user);
  },
  logout(_req: Request, res: Response) {
    clearSessionCookie(res);
    ok(res, null);
  },
  me(req: Request, res: Response) {
    ok(res, currentUser(req));
  },
};

export const user = {
  async list(req: Request, res: Response) {
    const q = dto.listUsersSchema.parse(req.query);
    sendPage(res, await users.listUsers(q), q);
  },
  async create(req: Request, res: Response) {
    ok(res, await users.createUser(dto.createUserSchema.parse(req.body)), 201);
  },
  async update(req: Request, res: Response) {
    ok(res, await users.updateUser(currentUser(req), id(req), dto.updateUserSchema.parse(req.body)));
  },
  async resetPassword(req: Request, res: Response) {
    await users.resetPassword(id(req), dto.resetPasswordSchema.parse(req.body).password);
    ok(res, null);
  },
};

export const category = {
  async list(_req: Request, res: Response) {
    ok(res, await categories.listCategories());
  },
  async create(req: Request, res: Response) {
    ok(res, await categories.createCategory(dto.categorySchema.parse(req.body)), 201);
  },
  async update(req: Request, res: Response) {
    ok(res, await categories.updateCategory(id(req), dto.categorySchema.parse(req.body)));
  },
};

export const material = {
  async list(req: Request, res: Response) {
    const q = dto.listMaterialsSchema.parse(req.query);
    sendPage(res, await materials.listMaterials(q), q);
  },
  async get(req: Request, res: Response) {
    ok(res, await materials.getMaterial(id(req)));
  },
  async create(req: Request, res: Response) {
    ok(res, await materials.createMaterial(dto.createMaterialSchema.parse(req.body)), 201);
  },
  async update(req: Request, res: Response) {
    ok(res, await materials.updateMaterial(id(req), dto.updateMaterialSchema.parse(req.body)));
  },
};

export const inventory = {
  async create(req: Request, res: Response) {
    const input = dto.createTransactionSchema.parse(req.body);
    ok(res, await transactions.createTransaction(currentUser(req), input), 201);
  },
  async get(req: Request, res: Response) {
    ok(res, await transactions.getTransaction(currentUser(req), id(req)));
  },
  async reverse(req: Request, res: Response) {
    const { note } = dto.reverseTransactionSchema.parse(req.body);
    ok(res, await transactions.reverseTransaction(currentUser(req), id(req), note), 201);
  },
  async history(req: Request, res: Response) {
    const q = dto.historySchema.parse(req.query);
    sendPage(res, await transactions.history(currentUser(req), q), q);
  },
};

export const dashboards = {
  async summary(_req: Request, res: Response) {
    ok(res, await dashboard.summary());
  },
  async reorder(_req: Request, res: Response) {
    ok(res, await dashboard.reorderSuggestions());
  },
  async topWithdrawn(req: Request, res: Response) {
    ok(res, await dashboard.topWithdrawn(dto.topWithdrawnSchema.parse(req.query)));
  },
  async unused(req: Request, res: Response) {
    ok(res, await dashboard.unused(dto.unusedSchema.parse(req.query).days));
  },
};
