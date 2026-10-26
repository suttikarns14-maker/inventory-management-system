import type { Request, Response } from 'express';
import * as dto from '../dtos/index.js';
import {
  clearSessionCookie,
  currentUser,
  setSessionCookie,
} from '../middlewares/auth.middleware.js';
import * as categories from '../services/category.service.js';
import * as dashboard from '../services/dashboard.service.js';
import * as importer from '../services/import.service.js';
import * as lookups from '../services/lookup.service.js';
import * as units from '../services/unit.service.js';
import * as materials from '../services/material.service.js';
import * as transactions from '../services/transaction.service.js';
import * as users from '../services/user.service.js';
import { AppError } from '../utils/app-error.js';
import { bangkokDate } from '../utils/date.js';
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
  async options(_req: Request, res: Response) {
    ok(res, await users.userOptions());
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
  async fillDepartments(req: Request, res: Response) {
    const input = dto.fillDepartmentsSchema.parse(req.body);
    ok(res, await transactions.fillDepartments(currentUser(req), id(req), input));
  },
  async history(req: Request, res: Response) {
    const q = dto.historySchema.parse(req.query);
    sendPage(res, await transactions.history(currentUser(req), q), q);
  },
};

export const unit = {
  async listForMaterial(req: Request, res: Response) {
    const q = dto.listUnitsSchema.parse(req.query);
    sendPage(res, await units.listUnits(q, id(req)), q);
  },
  async search(req: Request, res: Response) {
    const q = dto.listUnitsSchema.parse(req.query);
    sendPage(res, await units.listUnits(q), q);
  },
  async update(req: Request, res: Response) {
    ok(res, await units.updateSerial(id(req), dto.updateUnitSchema.parse(req.body).serialNumber));
  },
};

export const lookup = {
  async all(_req: Request, res: Response) {
    ok(res, await lookups.getLookups());
  },
  async createDepartment(req: Request, res: Response) {
    ok(res, await lookups.createDepartment(dto.departmentSchema.parse(req.body)), 201);
  },
  async updateDepartment(req: Request, res: Response) {
    ok(res, await lookups.updateDepartment(id(req), dto.departmentSchema.parse(req.body)));
  },
  async createBuilding(req: Request, res: Response) {
    ok(res, await lookups.createBuilding(dto.lookupSchema.parse(req.body)), 201);
  },
  async updateBuilding(req: Request, res: Response) {
    ok(res, await lookups.updateBuilding(id(req), dto.lookupSchema.parse(req.body)));
  },
  async createStorageLocation(req: Request, res: Response) {
    ok(res, await lookups.createStorageLocation(dto.lookupSchema.parse(req.body)), 201);
  },
  async updateStorageLocation(req: Request, res: Response) {
    ok(res, await lookups.updateStorageLocation(id(req), dto.lookupSchema.parse(req.body)));
  },
};

/** The upload arrives as the raw request body (express.raw on these routes). */
function uploadedFile(req: Request): Buffer {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาเลือกไฟล์ Excel');
  }
  return req.body;
}

export const imports = {
  async previewInitial(req: Request, res: Response) {
    ok(res, await importer.previewInitialImport(currentUser(req), uploadedFile(req)));
  },
  async commitInitial(req: Request, res: Response) {
    ok(res, await importer.commitInitialImport(currentUser(req), dto.commitInitialImportSchema.parse(req.body)), 201);
  },
  async previewReceipt(req: Request, res: Response) {
    ok(res, await importer.previewReceiptImport(currentUser(req), uploadedFile(req)));
  },
  async commitReceipt(req: Request, res: Response) {
    ok(res, await importer.commitReceiptImport(currentUser(req), dto.commitReceiptImportSchema.parse(req.body)), 201);
  },
  async template(_req: Request, res: Response) {
    res
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .attachment('receipt-template.xlsx')
      .send(await importer.receiptTemplate());
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
    ok(res, await dashboard.unused(dto.daysSchema.parse(req.query).days));
  },
  async procurement(_req: Request, res: Response) {
    ok(res, await dashboard.procurement());
  },
  async monthlyWithdrawals(_req: Request, res: Response) {
    ok(res, await dashboard.monthlyWithdrawals());
  },
  async byDepartment(req: Request, res: Response) {
    ok(res, await dashboard.byDepartment(dto.daysSchema.parse(req.query).days));
  },
  async byLocation(_req: Request, res: Response) {
    ok(res, await dashboard.byLocation());
  },
  async exportXlsx(_req: Request, res: Response) {
    res
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .attachment(`dashboard-${bangkokDate()}.xlsx`)
      .send(await dashboard.exportWorkbook());
  },
};
