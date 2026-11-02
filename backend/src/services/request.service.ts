import type { z } from 'zod';
import type { ApproveRequestInput, CreateRequestInput, listRequestsSchema } from '../dtos/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import type { SessionUser } from '../middlewares/auth.middleware.js';
import { AppError, type FieldError, notFound } from '../utils/app-error.js';
import { skipTake } from '../utils/http.js';
import { applyTransaction, getTransaction, nextReferenceNo, toLine, withdrawalHeader } from './transaction.service.js';

// D17: every withdrawal is a signed request. STAFF/ADMIN other than its creator and requester
// approve it (signing too), and only then does stock move, through applyTransaction.

// ---- response shape: frontend/src/app/shared/models/request.ts (signatures are never listed) ----

const person = { select: { id: true, fullName: true } } as const;
const ref = { select: { id: true, name: true } } as const;
export const requestSelect = {
  id: true,
  requestNo: true,
  status: true,
  createdAt: true,
  requesterName: true,
  floor: true,
  purpose: true,
  note: true,
  decidedAt: true,
  rejectReason: true,
  createdBy: person,
  requester: person,
  decidedBy: person,
  requestingDepartment: ref,
  usingDepartment: ref,
  building: ref,
  transaction: { select: { id: true, referenceNo: true } },
  items: {
    select: {
      id: true,
      materialId: true,
      quantity: true,
      approvedQuantity: true,
      material: { select: { id: true, code: true, name: true, unit: true, trackingType: true, currentQuantity: true } },
    },
    orderBy: { material: { code: 'asc' } },
  },
} satisfies Prisma.WithdrawalRequestSelect;

/** USER sees requests they created or that are in their name; 404 for the rest, like transactions. */
const visibleTo = (user: SessionUser): Prisma.WithdrawalRequestWhereInput =>
  user.role === 'USER' ? { OR: [{ createdById: user.id }, { requesterId: user.id }] } : {};

const notPending = () => new AppError(409, 'REQUEST_NOT_PENDING', 'คำขอนี้ได้รับการพิจารณาหรือถูกยกเลิกไปแล้ว');
const invalid = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', [{ field, message }]);

export async function createRequest(user: SessionUser, input: CreateRequestInput) {
  const header = await withdrawalHeader(user, input);
  const materials = await prisma.material.findMany({
    where: { id: { in: input.items.map((i) => i.materialId) } },
    select: { id: true, name: true, unit: true, currentQuantity: true },
  });
  const byId = new Map(materials.map((m) => [m.id, m]));
  for (const item of input.items) {
    const m = byId.get(item.materialId);
    if (!m) throw notFound('ไม่พบวัสดุบางรายการ');
    // Early warning only: stock is checked again, atomically, when the request is approved.
    if (item.quantity > m.currentQuantity) {
      throw new AppError(400, 'INSUFFICIENT_STOCK', `วัสดุ "${m.name}" คงเหลือ ${m.currentQuantity} ${m.unit} ไม่พอเบิก ${item.quantity} ${m.unit}`);
    }
  }
  return prisma.$transaction(async (tx) =>
    tx.withdrawalRequest.create({
      data: {
        requestNo: await nextReferenceNo(tx, undefined, 'REQ'),
        createdById: user.id,
        requesterId: header.requesterId ?? null,
        requesterName: header.requesterName,
        // withdrawalHeader has rejected empty departments already.
        requestingDepartmentId: header.requestingDepartmentId as string,
        usingDepartmentId: header.usingDepartmentId as string,
        buildingId: header.buildingId ?? null,
        floor: header.floor ?? null,
        purpose: header.purpose ?? null,
        note: header.note ?? null,
        requesterSignature: input.signature,
        items: { create: input.items.map((i) => ({ materialId: i.materialId, quantity: i.quantity })) },
      },
      select: requestSelect,
    }),
  );
}

/** Data for the printable withdrawal form. request is null for receipts, reversals and old withdrawals. */
export async function withdrawalDocument(user: SessionUser, transactionId: string) {
  const transaction = await getTransaction(user, transactionId);
  const request = await prisma.withdrawalRequest.findUnique({
    where: { transactionId },
    select: {
      requestNo: true,
      createdAt: true,
      requesterName: true,
      requesterSignature: true,
      decidedBy: person,
      decidedAt: true,
      approverSignature: true,
    },
  });
  return { transaction, request };
}

export async function getRequest(user: SessionUser, id: string) {
  const request = await prisma.withdrawalRequest.findFirst({ where: { id, ...visibleTo(user) }, select: requestSelect });
  if (!request) throw notFound('ไม่พบคำขอเบิก');
  return request;
}

export async function listRequests(user: SessionUser, q: z.infer<typeof listRequestsSchema>) {
  const where: Prisma.WithdrawalRequestWhereInput = { ...(q.status && { status: q.status }), ...visibleTo(user) };
  const [items, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where,
      select: requestSelect,
      orderBy: [{ createdAt: 'desc' }, { requestNo: 'desc' }],
      ...skipTake(q),
    }),
    prisma.withdrawalRequest.count({ where }),
  ]);
  return { items, total };
}

/** Only the creator or the requester may cancel, and only while it is pending. */
export async function cancelRequest(user: SessionUser, id: string) {
  const own = await prisma.withdrawalRequest.findFirst({
    where: { id, OR: [{ createdById: user.id }, { requesterId: user.id }] },
    select: { id: true },
  });
  if (!own) throw notFound('ไม่พบคำขอเบิก');
  const { count } = await prisma.withdrawalRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'CANCELLED', decidedById: user.id, decidedAt: new Date() },
  });
  if (count === 0) throw notPending();
  return getRequest(user, id);
}

/** Approvers are STAFF/ADMIN (route guard) who neither created the request nor are its requester. */
async function decidable(user: SessionUser, id: string) {
  const request = await prisma.withdrawalRequest.findUnique({ where: { id }, include: { items: true } });
  if (!request) throw notFound('ไม่พบคำขอเบิก');
  if (request.createdById === user.id || request.requesterId === user.id) {
    throw new AppError(403, 'FORBIDDEN', 'อนุมัติหรือปฏิเสธคำขอของตัวเองไม่ได้');
  }
  return request;
}

export async function approveRequest(user: SessionUser, id: string, input: ApproveRequestInput) {
  const request = await decidable(user, id);

  // The approval covers exactly the requested materials; a line may be lowered, even to 0.
  const requested = new Map(request.items.map((i) => [i.materialId, i.quantity]));
  if (input.items.length !== requested.size || input.items.some((i) => !requested.has(i.materialId))) {
    throw invalid('items', 'รายการวัสดุไม่ตรงกับคำขอ');
  }
  const errors: FieldError[] = [];
  input.items.forEach((item, i) => {
    const max = requested.get(item.materialId)!;
    if (item.quantity > max) errors.push({ field: `items.${i}.quantity`, message: `อนุมัติได้ไม่เกินจำนวนที่ขอ (${max})` });
    if (item.units && item.units.length !== item.quantity) {
      errors.push({ field: `items.${i}.units`, message: `กรุณาเลือก S/N ให้ครบ ${item.quantity} ชิ้น` });
    }
  });
  if (errors.length) throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', errors);
  if (!input.items.some((i) => i.quantity > 0)) throw invalid('items', 'ต้องอนุมัติอย่างน้อย 1 รายการ');

  const tracking = new Map(
    (
      await prisma.material.findMany({ where: { id: { in: [...requested.keys()] } }, select: { id: true, trackingType: true } })
    ).map((m) => [m.id, m.trackingType]),
  );
  const lines = input.items.flatMap((item, i) =>
    item.quantity === 0 ? [] : [toLine('OUT', item, tracking.get(item.materialId), i)],
  );

  return prisma.$transaction(async (tx) => {
    // Claim the request first: of two approvers at the same moment only one gets count 1.
    const { count } = await tx.withdrawalRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', decidedById: user.id, decidedAt: new Date(), approverSignature: input.signature },
    });
    if (count === 0) throw notPending();
    // Any stock error below rolls the claim back, so the request stays pending.
    const txn = await applyTransaction(
      user,
      'OUT',
      {
        note: request.note,
        requesterId: request.requesterId,
        requesterName: request.requesterName,
        requestingDepartmentId: request.requestingDepartmentId,
        usingDepartmentId: request.usingDepartmentId,
        buildingId: request.buildingId,
        floor: request.floor,
        purpose: request.purpose,
      },
      lines,
      null,
      tx,
    );
    for (const item of input.items) {
      await tx.withdrawalRequestItem.update({
        where: { requestId_materialId: { requestId: id, materialId: item.materialId } },
        data: { approvedQuantity: item.quantity },
      });
    }
    return tx.withdrawalRequest.update({ where: { id }, data: { transactionId: txn.id }, select: requestSelect });
  });
}

export async function rejectRequest(user: SessionUser, id: string, reason: string) {
  await decidable(user, id);
  const { count } = await prisma.withdrawalRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'REJECTED', decidedById: user.id, decidedAt: new Date(), rejectReason: reason },
  });
  if (count === 0) throw notPending();
  return getRequest(user, id);
}
