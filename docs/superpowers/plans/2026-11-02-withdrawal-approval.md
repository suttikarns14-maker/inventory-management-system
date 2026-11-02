# คำขอเบิก + ลายเซ็น + อนุมัติ + ใบเบิก PDF (D17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** การเบิกทุกครั้งต้องเป็น "คำขอเบิก" ที่ผู้เบิกเซ็น → รอ STAFF/ADMIN (คนอื่น) อนุมัติพร้อมเซ็น → ระบบจึงตัดสต็อก และพิมพ์/บันทึกใบเบิกเป็น PDF จากหน้าประวัติได้

**Architecture:** เพิ่มตาราง `withdrawal_requests` (+ items) แยกจาก `stock_transactions` ประวัติรับ-จ่ายยังเป็นของที่เคลื่อนจริงเท่านั้น (Dashboard ไม่ต้องแก้) ตอนอนุมัติ: เปลี่ยนสถานะแบบมีเงื่อนไข + `applyTransaction(..., outer tx)` ตัวเดิม ใน `prisma.$transaction` เดียว ลายเซ็นเป็น PNG data URL เก็บในคอลัมน์ของคำขอ (ไม่อยู่ใน select ของ list) ใบเบิก PDF = หน้าเว็บสำหรับพิมพ์ + `window.print()` (ผู้ใช้เลือก "บันทึกเป็น PDF") ไม่เพิ่ม library

**Tech Stack:** Express 5, Prisma 7, Zod 4, Vitest + Supertest · Angular 22 zoneless, Reactive Forms, Angular Material, `<canvas>` + Pointer Events

**Spec:** ข้อตกลงในแชท 2026-11-02 (บันทึกเป็น D17 ใน Task 9): ผู้เบิกเซ็นทุกครั้ง (ไม่มีลายเซ็นบันทึกไว้), อนุมัติได้เฉพาะ STAFF/ADMIN และห้ามอนุมัติคำขอที่ตัวเองสร้างหรือเป็นผู้เบิก, ผู้อนุมัติลดจำนวนได้, ผู้อนุมัติเลือก S/N, อนุมัติ = ตัดสต็อกและจ่ายของ (ไม่มีขั้นเซ็นรับแยก), ADMIN/STAFF ที่เบิกเองก็ต้องรออนุมัติ, ไม่อนุมัติต้องมีเหตุผล, ผู้ขอยกเลิกคำขอที่ยังรออยู่ได้, ประวัติเดิม 406 รายการไม่มีลายเซ็น

## Global Constraints

- กติกาใน `CLAUDE.md` ยังใช้ทั้งหมด: ตัดสต็อกแบบมีเงื่อนไข, ห้ามติดลบ, ทุกอย่างใน `$transaction` เดียว, ห้ามแก้/ลบรายการเดิม
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย · โค้ด/commit ภาษาอังกฤษ · branch `feat/withdrawal-approval` แตกจาก `develop`
- คอลัมน์วันเวลาใหม่ใส่ `@db.Timestamptz(3)` · DB snake_case ผ่าน `@map`
- migration เขียนมือ (`prisma migrate dev` ใช้ไม่ได้ ดู handoff §4) · ห้าม `migrate reset`
- ห้ามเพิ่ม dependency (signature pad / PDF เขียนเอง)
- mock API ไม่อัปเดต: แก้เฉพาะที่จำเป็นให้ compile ผ่าน (เช่น ใส่ `pendingQuantity: 0`)
- ลายเซ็น: ต้องขึ้นต้น `data:image/png;base64,` ยาวไม่เกิน 200,000 ตัวอักษร
- รหัสคำขอ `REQ-YYYYMMDD-NNN` ใช้ `reference_counters` โดย key `REQ-YYYYMMDD` (แถวเดิม key `YYYYMMDD` ของ TXN ไม่เปลี่ยน)

## Review Focus

1. **อนุมัติพร้อมกันสองคน** → คนเดียวสำเร็จ อีกคนได้ 409 `REQUEST_NOT_PENDING` และสต็อกถูกตัดครั้งเดียว (Task 3)
2. **ของหมดระหว่างรออนุมัติ** → อนุมัติไม่ผ่าน `INSUFFICIENT_STOCK` / `UNIT_NOT_AVAILABLE` และคำขอยังเป็น PENDING (rollback สถานะด้วย) (Task 3)
3. **ลายเซ็นใหญ่เกิน/ว่าง/ไม่ใช่ PNG** → 400 `VALIDATION_ERROR` field `signature` ไม่ใช่ 413/500 (Task 1, 2)
4. **USER เข้าถึงคำขอหรือใบเบิกของคนอื่นด้วย id** → 404 (Task 2, 4)
5. **ลดจำนวนทุกบรรทัดเป็น 0 หรือส่ง S/N ไม่ตรงจำนวน** → 400 ไม่ตัดสต็อก (Task 3)

---

### Task 1: DB schema + error code + body limit

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261102120000_withdrawal_requests/migration.sql`
- Modify: `backend/src/utils/app-error.ts` (ErrorCode), `frontend/src/app/shared/models/api.ts` (ErrorCode เดียวกัน)
- Modify: `backend/src/app.ts:14` (`limit: '512kb'`), `backend/src/middlewares/error.middleware.ts` (`type === 'entity.too.large'` → 400 `VALIDATION_ERROR` "ข้อมูลใหญ่เกินไป")
- Modify: `backend/test/helpers.ts` `resetDb()` เพิ่ม `withdrawal_request_items, withdrawal_requests` ใน TRUNCATE

**Interfaces — Produces:**
```prisma
enum RequestStatus { PENDING APPROVED REJECTED CANCELLED }

model WithdrawalRequest {            // @@map("withdrawal_requests"), @@index([status, createdAt])
  id, requestNo @unique (request_no), status RequestStatus @default(PENDING)
  createdById + createdBy User @relation("RequestCreatedBy")
  // หัวคำขอเหมือน OUT: requesterId?/requester @relation("RequestRequester"), requesterName,
  // requestingDepartmentId, usingDepartmentId (บังคับ), buildingId?, floor?, purpose?, note?
  requesterSignature String         // PNG data URL
  createdAt @db.Timestamptz(3)
  decidedById? + decidedBy User? @relation("RequestDecidedBy"), decidedAt? @db.Timestamptz(3)
  rejectReason String?, approverSignature String?
  transactionId String? @unique + transaction StockTransaction?
  items WithdrawalRequestItem[]
}
model WithdrawalRequestItem {        // @@map("withdrawal_request_items"), @@unique([requestId, materialId])
  id, requestId, materialId, quantity Int, approvedQuantity Int? (approved_quantity)
}
```
- ErrorCode ใหม่: `'REQUEST_NOT_PENDING'`
- migration SQL เพิ่ม `CHECK (quantity > 0)` และ `CHECK (approved_quantity BETWEEN 0 AND quantity)`

- [ ] **Step 1:** แก้ schema + เขียน migration.sql → `npx prisma migrate deploy` → `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` ต้องได้ว่าง → `npx prisma generate`
- [ ] **Step 2:** test ใน `backend/test/inventory.test.ts`: `it('rejects an oversized body with 400, not 500')` ส่ง body ~600KB ไป `POST /inventory/transactions` → `expect(res.status).toBe(400); expect(res.body.error.code).toBe('VALIDATION_ERROR')` → รันแล้ว FAIL
- [ ] **Step 3:** แก้ app.ts / error.middleware → `npm test` ผ่านทั้งหมด + `npm run typecheck`
- [ ] **Step 4:** สำรอง DB จริงก่อน (`docker exec inventory_db pg_dump ...` → `backend/backups/before-withdrawal-requests-<ts>.sql`) แล้วค่อย `migrate deploy` กับ DB จริง
- [ ] **Step 5:** Commit `feat(db): add withdrawal requests tables`

### Task 2: สร้าง / ดู / ยกเลิกคำขอ (BE) และปิดการเบิกตรง

**Files:**
- Create: `backend/src/services/request.service.ts`
- Modify: `backend/src/services/transaction.service.ts` (export `withdrawalHeader`; `nextReferenceNo(tx, date = bangkokDate(), prefix: 'TXN' | 'REQ' = 'TXN')`; `createTransaction` type OUT → 400 `VALIDATION_ERROR` "การเบิกต้องส่งเป็นคำขอเบิก")
- Modify: `backend/src/dtos/index.ts`, `backend/src/controllers/index.ts` (`requests` object), `backend/src/routes/index.ts`
- Create: `backend/test/requests.test.ts`
- Modify: `backend/test/helpers.ts` + ทุกไฟล์ test ที่เรียก OUT ตรง (35 จุดใน inventory/serial/dashboard/auth-materials/import tests)

**Interfaces — Produces:**
- DTO: `signature = z.string().startsWith('data:image/png;base64,', 'กรุณาเซ็นชื่อ').max(200_000)`
- `createRequestSchema` = ฟิลด์หัว OUT เดิม (requesterId, requesterName, requestingDepartmentId, usingDepartmentId, buildingId, floor, purpose, note) + `items: [{ materialId, quantity: int>0 }]` (1–100, ไม่ซ้ำ) + `signature`
- `listRequestsSchema = pageQuery.extend({ status: z.enum([...]).optional() })` · `rejectRequestSchema = { reason: text('เหตุผล', 400) }`
- Routes (ทุก role ยกเว้นระบุ):
  - `POST /inventory/requests` → 201 `WithdrawalRequestDto`
  - `GET /inventory/requests` → page ของ `WithdrawalRequestDto` (เรียง `createdAt desc`)
  - `GET /inventory/requests/:id`
  - `POST /inventory/requests/:id/cancel` (เฉพาะ createdBy หรือ requester)
- `WithdrawalRequestDto` (ไม่มีลายเซ็น): `{ id, requestNo, status, createdAt, createdBy{id,fullName}, requester{id,fullName}|null, requesterName, requestingDepartment Ref, usingDepartment Ref, building Ref|null, floor, purpose, note, decidedBy{id,fullName}|null, decidedAt, rejectReason, transaction{id,referenceNo}|null, items: [{ id, materialId, quantity, approvedQuantity, material{id,code,name,unit,trackingType,currentQuantity} }] }`
- USER เห็นเฉพาะ `createdById = me OR requesterId = me` (อื่นๆ 404) เหมือน `getTransaction`
- ตอนสร้าง: `quantity > currentQuantity` → 400 `INSUFFICIENT_STOCK` (ยังไม่หักสต็อก)
- `helpers.ts`: `withdraw(materialId, quantity | units, extra?)` = USER `user` สร้างคำขอด้วย `SIG` แล้ว `staff` อนุมัติ คืน transaction · `export const SIG = 'data:image/png;base64,iVBORw0KGgo='`

- [ ] **Step 1: test ที่ต้อง FAIL** ใน `requests.test.ts`:
  - `creates a pending request without touching stock`: 201, `status 'PENDING'`, `requestNo` ตรง `/^REQ-\d{8}-001$/`, `stockOf(paper) === 20`, ไม่มี `requesterSignature` ใน body
  - `requires a png signature`: ไม่ส่ง / `'abc'` / ยาว 200_001 → 400 `details[0].field === 'signature'`
  - `rejects quantity above stock at request time`: pens (3) ขอ 4 → 400 `INSUFFICIENT_STOCK`
  - `USER sees only own requests; others 404 by id` (user2)
  - `requester cancels own pending request; second cancel 409 REQUEST_NOT_PENDING; staff cancelling someone else's 404`
  - `POST /inventory/transactions type OUT is refused` → 400
- [ ] **Step 2:** รัน `npx vitest run test/requests.test.ts` → FAIL
- [ ] **Step 3:** implement service/DTO/controller/routes (ใช้ `withdrawalHeader` ซ้ำ, cancel = `updateMany where { id, status: 'PENDING' }` แล้วเช็ก `count`)
- [ ] **Step 4:** ย้าย test เดิมที่เบิกตรงไปใช้ `withdraw()` (Task 3 ต้องเสร็จก่อน helper ใช้ได้ → ทำ Step นี้หลัง Task 3 Step 3 ถ้าทำทีละ task ให้รวม Task 2–3 เป็น commit เดียว)
- [ ] **Step 5:** `npm test` ผ่านทั้งหมด + typecheck → Commit `feat(api): withdrawal requests`

### Task 3: อนุมัติ / ไม่อนุมัติ (BE)

**Files:** `backend/src/services/request.service.ts`, dtos, controllers, routes, `backend/test/requests.test.ts`

**Interfaces — Produces:**
- `POST /inventory/requests/:id/approve` (ADMIN, STAFF) body `approveRequestSchema = { signature, items: [{ materialId, quantity: int 0..requested, units?: [{unitId, remark}] }] }` → 200 `WithdrawalRequestDto` (มี `transaction`)
- `POST /inventory/requests/:id/reject` (ADMIN, STAFF) body `{ reason }` → 200
- `approveRequest(user, id, input)`: ใน `prisma.$transaction(async tx => …)`:
  1. ผู้อนุมัติ = `createdById` หรือ `requesterId` → 403 `FORBIDDEN` "อนุมัติคำขอของตัวเองไม่ได้"
  2. `items` ต้องตรงกับวัสดุในคำขอทุกตัว (ไม่ขาดไม่เกิน) และผลรวม quantity > 0 → ไม่งั้น 400 `VALIDATION_ERROR`
  3. `updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', decidedById, decidedAt, approverSignature } })` count 0 → 409 `REQUEST_NOT_PENDING`
  4. สร้าง `Line[]` ด้วย `toLine('OUT', …)` เดิม (SERIAL ต้องมี units = quantity, ข้ามบรรทัดที่ quantity 0) → `applyTransaction(user, 'OUT', header จากคำขอ, lines, null, tx)`
  5. อัปเดต `approvedQuantity` ทุกบรรทัด + `transactionId`
- reject: ตรวจข้อ 1 เหมือนกัน แล้ว conditional update → `REJECTED`, `rejectReason`

- [ ] **Step 1: test ที่ต้อง FAIL:**
  - `approval deducts stock and links the transaction`: paper ขอ 5 → staff อนุมัติ 5 → `stockOf(paper) === 15`, `res.body.data.transaction.referenceNo` ตรง `/^TXN-/`, history มีรายการ OUT 1 รายการ ที่ `requesterName` ตรงคำขอ
  - `approver can reduce quantity`: ขอ 5 อนุมัติ 3 → stock 17, `items[0].approvedQuantity === 3`
  - `all-zero approval is refused`: → 400, stock 20, status PENDING
  - `cannot approve own request`: staff สร้าง (ในชื่อ requesterName) แล้ว staff อนุมัติ → 403 · admin อนุมัติได้
  - `USER cannot approve` → 403
  - `only one of two simultaneous approvals wins`: `Promise.all` staff + admin → status [200, 409], stock 15
  - `stock gone before approval keeps the request pending`: คำขอ A, B ขอ paper 15 ทั้งคู่ → อนุมัติ A ผ่าน, B → 400 `INSUFFICIENT_STOCK` และ `GET` B ยัง `PENDING`
  - `SERIAL: approver picks units; count must match quantity` (ใช้ fixture แบบใน `serial.test.ts`) → units ไม่ครบ 400, ครบ → ชิ้นเป็น `ISSUED`
  - `reject needs a reason and closes the request` → 400 ไม่มี reason; มี → `REJECTED`, approve ทีหลัง → 409
- [ ] **Step 2:** รัน → FAIL
- [ ] **Step 3:** implement
- [ ] **Step 4:** ทำ Task 2 Step 4 (ย้าย test เดิม) → `npm test` ผ่านทั้งหมด (เดิม 48 ข้อ + ใหม่)
- [ ] **Step 5:** Commit `feat(api): approve and reject withdrawal requests`

### Task 4: ยอดรออนุมัติ + ข้อมูลใบเบิก (BE)

**Files:** `backend/src/services/material.service.ts`, `backend/src/services/transaction.service.ts`, controllers, routes, `frontend/src/app/shared/models/material.ts`, `frontend/src/app/core/mock/mock-api.ts:341` (`pendingQuantity: 0` เพื่อให้ compile), tests

**Interfaces — Produces:**
- `Material.pendingQuantity: number` = ผลรวม `quantity` ของ items ในคำขอ `PENDING` ทั้ง `listMaterials` และ `getMaterial` (หนึ่ง `groupBy` ต่อ request)
- `GET /inventory/transactions/:id/document` (สิทธิ์เดียวกับ `getTransaction`) → `{ transaction: StockTransaction, request: { requestNo, createdAt, requesterName, requesterSignature, decidedBy{fullName}, decidedAt, approverSignature } | null }` (`request` = null สำหรับรายการเก่า/IN/reversal)

- [ ] **Step 1: test ที่ต้อง FAIL:** `pendingQuantity counts only pending requests` (pending 5 + rejected 2 → 5) · `document returns both signatures for an approved withdrawal, null request for old ones, 404 for another USER`
- [ ] **Step 2:** รัน → FAIL → implement → `npm test` + typecheck ผ่าน
- [ ] **Step 3:** Commit `feat(api): pending quantity and withdrawal document`

### Task 5: FE models, service และช่องเซ็นชื่อ

**Files:**
- Create: `frontend/src/app/shared/models/request.ts` (`RequestStatus`, `REQUEST_STATUS_LABELS = { PENDING: 'รออนุมัติ', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่อนุมัติ', CANCELLED: 'ยกเลิกแล้ว' }`, `WithdrawalRequest`, `CreateRequestInput`, `ApproveRequestInput`, `WithdrawalDocument` ตาม Task 2–4)
- Modify: `frontend/src/app/shared/models/api.ts` (ErrorCode)
- Create: `frontend/src/app/features/inventory/request.service.ts` `RequestService`: `create`, `list(query)`, `get(id)`, `approve(id, input)`, `reject(id, reason)`, `cancel(id)`, `document(txnId)`, `pendingCount(): Observable<number>` (= `list({status:'PENDING', limit:1})` → `meta.total`)
- Create: `frontend/src/app/shared/components/signature-pad.ts` `SignaturePad` (selector `app-signature-pad`)

**Interfaces — Produces:**
- `SignaturePad` เป็น `ControlValueAccessor` ค่า = PNG data URL หรือ `''` (ว่าง) ใช้กับ `FormControl<string>` + `Validators.required` · canvas 600×200 วาดด้วย Pointer Events, CSS `touch-action: none` (มือถือไม่เลื่อนจอ), ปุ่ม "ล้าง", `aria-label="ช่องเซ็นชื่อ"` · ส่งค่า `canvas.toDataURL('image/png')` ตอน `pointerup`

- [ ] **Step 1:** test `signature-pad.spec.ts` (Vitest): วาดจำลอง pointerdown/move/up → ค่า control ขึ้นต้น `data:image/png;base64,` · กด "ล้าง" → ค่า `''`
- [ ] **Step 2:** รัน → FAIL → implement → `npm test -- --watch=false` + `npx ng build` ผ่าน
- [ ] **Step 3:** Commit `feat(web): request models, service and signature pad`

### Task 6: หน้า "รับเข้า / เบิกจ่าย" โหมดเบิก → ส่งคำขอ

**Files:** `frontend/src/app/features/inventory/transaction-form-page.{ts,html,scss}`

- โหมด OUT: ทุกบรรทัดกรอก **จำนวน** อย่างเดียว (SERIAL ด้วย) · ย้ายโค้ดเลือก S/N (`unitOptions`, `searchUnits`, `pickUnit`, `addFirstUnits`, `removeUnit`, `units`/`unitSearch`/`autoCount` ใน Line) ไป Task 7 (ลบออกจากหน้านี้)
- รายการวัสดุแสดง "คงเหลือ X · รออนุมัติ Y" (`pendingQuantity`)
- เพิ่ม `signature: FormControl<string>` (required เฉพาะ OUT) + `<app-signature-pad>` หัวข้อ "ลายเซ็นผู้เบิก" ใต้รายการวัสดุ · ADMIN/STAFF เบิกแทน: ข้อความ "ให้ผู้เบิกเซ็นบนจอนี้"
- submit OUT → `RequestService.create` → แจ้ง `ส่งคำขอเบิกแล้ว (REQ-…) รออนุมัติ` แล้ว navigate ไป `/inventory/requests` · ปุ่ม OUT เปลี่ยนข้อความเป็น "ส่งคำขอเบิก"
- error `VALIDATION_ERROR` field `signature` ต้อง map ลง control (ผ่าน `applyServerErrors` เดิม)

- [ ] **Step 1:** implement → `npx ng build` ผ่าน
- [ ] **Step 2:** Commit `feat(web): withdrawal form submits a signed request`

### Task 7: หน้าคำขอเบิก + หน้าอนุมัติ + ป้ายในเมนู

**Files:**
- Create: `frontend/src/app/features/inventory/request-list-page.{ts,html}` route `inventory/requests` title "คำขอเบิก" (ทุก role)
- Create: `frontend/src/app/features/inventory/request-approve-page.{ts,html}` route `inventory/requests/:id/approve` roles ADMIN/STAFF
- Modify: `frontend/src/app/app.routes.ts`, `frontend/src/app/core/layout/shell.{ts,html}`

- **รายการ:** ตัวกรองสถานะ (ค่าเริ่มต้น "รออนุมัติ" สำหรับ STAFF/ADMIN, "ทั้งหมด" สำหรับ USER) · คอลัมน์ เลขที่, วันที่, ผู้เบิก, หน่วยงานที่เบิก/ที่ใช้, วัสดุ×จำนวน, สถานะ (+ เหตุผลถ้าไม่อนุมัติ, + เลข TXN ถ้าอนุมัติ) · ปุ่ม: "อนุมัติ" (STAFF/ADMIN, ไม่ใช่คำขอของตัวเอง) → หน้าอนุมัติ · "ไม่อนุมัติ" → `ReasonDialog` เดิม · "ยกเลิกคำขอ" (เจ้าของ, PENDING)
- **อนุมัติ:** แต่ละบรรทัด: จำนวนที่อนุมัติ (0..ที่ขอ, ค่าเริ่มต้น = ที่ขอ แต่ไม่เกินคงเหลือ) · SERIAL: ตัวเลือก S/N ที่ย้ายมาจาก Task 6 (ต้องเลือกครบตามจำนวน, ปุ่ม S/N ชั่วคราวเดิม) · "ลายเซ็นผู้อนุมัติ" (`SignaturePad`) · ปุ่ม "อนุมัติและจ่ายของ" · error `INSUFFICIENT_STOCK`/`UNIT_NOT_AVAILABLE` → แจ้งแล้วโหลดคำขอใหม่ · `REQUEST_NOT_PENDING` → แจ้งแล้วกลับหน้ารายการ
- **เมนู:** เพิ่ม `{ path: '/inventory/requests', label: 'คำขอเบิก', icon: 'approval' }` ต่อจาก "รับเข้า / เบิกจ่าย" · STAFF/ADMIN แสดงตัวเลข `pendingCount()` (โหลดตอนเปิดและทุก `NavigationEnd`) ซ่อนเมื่อเป็น 0

- [ ] **Step 1:** implement → `npx ng build` ผ่าน
- [ ] **Step 2:** Commit `feat(web): request list, approval page and pending badge`

### Task 8: ใบเบิก (พิมพ์ / บันทึก PDF)

**Files:**
- Create: `frontend/src/app/features/inventory/withdrawal-document-page.{ts,html,scss}` route `inventory/transactions/:id/document` (ทุก role)
- Modify: `frontend/src/app/features/inventory/history-page.html` (ปุ่ม icon `print` tooltip "ใบเบิก (พิมพ์ / PDF)" เฉพาะแถว OUT ที่ไม่ใช่ reversal เปิดแท็บใหม่) · `frontend/src/app/core/layout/shell.scss` (`@media print` ซ่อน toolbar/sidenav)

- เนื้อหา A4: หัว "ใบเบิกวัสดุ", เลขที่ TXN + REQ, วันที่ขอ/อนุมัติ, ผู้เบิก, หน่วยงานที่เบิก/ที่ใช้, อาคาร/ชั้น, ระบบงานที่ใช้, ตาราง (ลำดับ, รหัส, ชื่อวัสดุ, จำนวน, หน่วย, S/N คั่นด้วย ", "), หมายเหตุ, ช่องลายเซ็น 2 ช่อง (รูป + ชื่อ + วันที่) "ผู้เบิก" / "ผู้อนุมัติ" · รายการเก่าที่ `request = null`: ช่องลายเซ็นเป็นเส้นว่างให้เซ็นมือ · ถ้ารายการถูกยกเลิกแล้ว แสดงแถบ "รายการนี้ถูกยกเลิกแล้ว (TXN-…)"
- ปุ่ม "พิมพ์ / บันทึก PDF" (`window.print()`, ซ่อนตอนพิมพ์) · CSS `@page { size: A4; margin: 15mm }`
- วันที่ในใบเบิกใช้รูปแบบเดียวกับทั้งเว็บ (เรื่อง พ.ศ./ค.ศ. ข้อ 4 ใน handoff ยังรอผู้ใช้เลือก)

- [ ] **Step 1:** implement → `npx ng build` ผ่าน
- [ ] **Step 2:** Commit `feat(web): printable withdrawal document`

### Task 9: ทดสอบในเบราว์เซอร์ + เอกสาร

**Files:** `docs/spec-v2.2-it-inventory.md` (หัวข้อ D17 + endpoint ใหม่), `CLAUDE.md` (Business rules: เบิก = คำขอ + อนุมัติ, ตาราง Roles เพิ่มแถว "อนุมัติคำขอเบิก ✅ ✅ ❌", Domain model เพิ่ม `WithdrawalRequest`), `docs/status.md`, `docs/handoff.md`

- [ ] **Step 1:** Playwright ตาม handoff §5 บน DB ทดสอบ (BE 3001 / FE 4300, `seedBasics()`): user ส่งคำขอพร้อมเซ็น → staff เห็นป้าย 1 → อนุมัติลดจำนวน + เลือก S/N + เซ็น → stock ลด → history กดพิมพ์ → ใบเบิกมีลายเซ็น 2 รูป · staff อนุมัติคำขอตัวเองไม่ได้ · ลายเซ็นบนจอขนาดมือถือ (`page.setViewportSize({width: 390, height: 844})`) วาดได้โดยหน้าไม่เลื่อน
- [ ] **Step 2:** `npm test` (BE), `npm test -- --watch=false` + `npx ng build` (FE) ผ่าน รายงานจำนวนข้อ
- [ ] **Step 3:** อัปเดตเอกสาร → Commit `docs: D17 withdrawal approval`
