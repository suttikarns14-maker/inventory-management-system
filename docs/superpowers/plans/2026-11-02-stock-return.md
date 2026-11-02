# รับคืนวัสดุ (D18) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** STAFF/ADMIN บันทึก "รับคืน" ของที่ผู้ใช้นำมาคืนจากใบเบิกเดิม (คืนบางส่วนได้ คืนหลายครั้งได้) สต็อกเพิ่มทันที และ Dashboard นับยอดใช้สุทธิ

**Architecture:** รับคืน = `StockTransaction` type `IN` ที่มี `returnOfId` ชี้ใบเบิก (OUT) เดิม ผ่าน `applyTransaction(..., outer tx)` ตัวเดิม ภายใน `$transaction` ที่ล็อกแถวใบเบิกเดิม (`SELECT … FOR UPDATE`) ก่อนตรวจยอดคืนสะสม การยกเลิก (reverse) ใช้ล็อกเดียวกัน ไม่มีตารางใหม่

**Tech Stack:** Express 5, Prisma 7, Zod 4, Vitest + Supertest · Angular 22 zoneless, Reactive Forms, Angular Material (MatDialog)

**Spec:** ข้อตกลงในแชท 2026-11-02 (บันทึกเป็น D18 ใน Task 4):
- STAFF/ADMIN บันทึกตอนรับของจริง ขั้นตอนเดียว ไม่มีคำขอคืน
- รับเฉพาะของสภาพดี ของเสียไม่รับคืน (ไม่มีช่องสภาพ)
- ไม่ต้องเซ็น · ไม่จำกัดเวลา
- คืนบางส่วนได้ ยอดคืนสะสมห้ามเกินที่เบิก · ต้องใส่เหตุผล
- ใบเบิกที่มีรับคืน (ที่ยังไม่ถูกยกเลิก) ห้ามยกเลิก ต้องยกเลิกรายการรับคืนก่อน

## Global Constraints

- กติกาใน `CLAUDE.md` ยังใช้ทั้งหมด: สต็อกเปลี่ยนใน `$transaction` เดียว, เปลี่ยนสถานะชิ้นแบบมีเงื่อนไข, ห้ามแก้/ลบรายการเดิม
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย · โค้ด/commit ภาษาอังกฤษ · branch `feat/stock-return` แตกจาก `feat/withdrawal-approval`
- migration เขียนมือ (`migrate diff`) · ห้าม `migrate reset` · deploy เข้า DB จริงหลัง backup
- ห้ามเพิ่ม dependency · mock API ไม่อัปเดต (แก้แค่ให้ compile)
- รายการรับคืน: `type = IN`, `unitPrice = null`, `createdBy` = เจ้าหน้าที่ที่รับ, คัดลอก `requesterId`/`requesterName`/หน่วยงานที่เบิก/ที่ใช้ จากใบเบิกเดิม (USER เห็นในประวัติของตัวเอง และสถิติหน่วยงานถูก), `note` = `คืนจาก TXN-…: <เหตุผล>`

## Review Focus

1. **รับคืนพร้อมกันสองคนจากใบเดียว** → ยอดคืนสะสมไม่เกินที่เบิก (ล็อกแถวใบเบิกเดิม) (Task 1)
2. **รับคืนพร้อมกับ ADMIN ยกเลิกใบเบิกเดิม** → สำเร็จได้อย่างเดียว ไม่มีสต็อกบวกซ้ำ (Task 1)
3. **ยกเลิกรายการรับคืน** → S/N กลับเป็น ISSUED (ไม่ใช่ VOID) สต็อกลด และคืนชิ้นนั้นใหม่ได้ (Task 1)
4. **S/N ที่ไม่อยู่ในใบเบิกนี้ / คืนไปแล้ว** → 400 `UNIT_NOT_AVAILABLE` ไม่มีอะไรเปลี่ยน (Task 1)
5. **Dashboard หลังคืน** → topWithdrawn / byDepartment / reorder ใช้ยอดสุทธิ, รับคืนไม่ถูกนับเป็นราคาซื้อล่าสุด (Task 2)

---

### Task 1: BE รับคืน + ยกเลิกแบบปลอดภัย

**Files:**
- Modify: `backend/prisma/schema.prisma` — `StockTransaction.returnOfId String? @map("return_of_id")`, relation `"Return"`: `returnOf` / `returns StockTransaction[]`, `@@index([returnOfId])`
- Create: `backend/prisma/migrations/20261102180000_stock_returns/migration.sql` — คอลัมน์ + FK + index + `CHECK (return_of_id IS NULL OR type = 'IN')`
- Modify: `backend/src/utils/app-error.ts` + `frontend/src/app/shared/models/api.ts` — ErrorCode `'HAS_RETURNS'`
- Modify: `backend/src/dtos/index.ts` — `returnSchema { note: required 1..500, items: [{ materialId, quantity int > 0, units?: [{ unitId }] }] min 1, materialId unique }`
- Modify: `backend/src/services/transaction.service.ts` — `returnable(user, id)`, `returnTransaction(user, id, input)`, `reverseTransaction` ล็อก + กัน `HAS_RETURNS`, ยกเลิกรายการรับคืนให้ S/N กลับ ISSUED
- Modify: `backend/src/controllers/index.ts`, `backend/src/routes/index.ts` — `GET /inventory/transactions/:id/return` และ `POST /inventory/transactions/:id/return` (staff guard)
- Test: `backend/test/returns.test.ts` (ใหม่)

**Interfaces (produces):**
- `GET …/:id/return` → `{ transaction: StockTransaction, lines: { materialId, code, name, unit, trackingType, issued, returned, units: { id, serialNumber }[] }[] }` (`units` = S/N ที่ยังคืนได้)
- `POST …/:id/return` → 201 `StockTransaction` (รายการรับคืน)
- `transactionSelect` เพิ่ม `returnOf: { id, referenceNo }` และ `returns` (เฉพาะที่ยังไม่ถูกยกเลิก): `{ id, referenceNo, items: { materialId, quantity }[] }`

- [ ] **Step 1: เขียน test ที่ล้มก่อน** (`returns.test.ts`, ใช้ `withdraw()` จาก helpers)
  - คืนบางส่วน QUANTITY: เบิก 5 คืน 2 → 201, สต็อก +2, รายการใหม่ type IN, `returnOf.referenceNo` = ใบเดิม, ใบเดิม `returns` มี 1
  - คืนรวมเกิน: คืน 2 แล้วคืน 4 → 400 `VALIDATION_ERROR` field `items.0.quantity`
  - SERIAL: คืน 1 จาก 2 ชิ้น → ชิ้นนั้น IN_STOCK, `GET …/return` เหลือ units 1 ชิ้น
  - S/N ของใบอื่น หรือคืนซ้ำ → 400 `UNIT_NOT_AVAILABLE`; `units.length !== quantity` → 400
  - คืนจากรายการ IN / ใบที่ถูกยกเลิก / รายการยกเลิก → 400
  - USER → 403; ไม่มีเหตุผล → 400 field `note`
  - ADMIN ยกเลิกใบเบิกที่มีรับคืน → 409 `HAS_RETURNS`; ยกเลิกรายการรับคืนก่อน แล้วยกเลิกใบเบิกได้
  - ยกเลิกรายการรับคืน SERIAL → ชิ้นกลับ ISSUED, คืนชิ้นเดิมใหม่ได้
  - พร้อมกัน: คืน 3 สองครั้งพร้อมกันจากใบที่เบิก 5 → สำเร็จ 1 ครั้ง สต็อก +3
- [ ] **Step 2:** `npm test -- returns` → FAIL (404 route)
- [ ] **Step 3: schema + migration** (`migrate diff` → แก้มือเพิ่ม CHECK) → `db:migrate` บน test DB ผ่าน global-setup
- [ ] **Step 4: implement**
  - `returnTransaction`: `prisma.$transaction(async tx => { SELECT id FROM stock_transactions WHERE id = $1 FOR UPDATE; ตรวจ OUT/ไม่ใช่ reversal/ไม่ถูกยกเลิก; รวมยอดคืนเดิม (returns ที่ยังไม่ถูกยกเลิก); ตรวจ S/N อยู่ในใบเดิมและยังไม่อยู่ในรับคืนเดิม; applyTransaction(user,'IN',header,lines,null,tx) })` — สถานะ ISSUED→IN_STOCK แบบมีเงื่อนไขใน `applyTransaction` อยู่แล้ว
  - `reverseTransaction`: ห่อด้วย `$transaction` + ล็อกแถวเดียวกัน, OUT ที่มี returns ยังไม่ยกเลิก → 409 `HAS_RETURNS`, ส่ง `tx` ให้ `applyTransaction`
  - ยกเลิกรายการรับคืน (OUT reversal ของ IN ที่มี `returnOfId`): S/N IN_STOCK→ISSUED ไม่ใช่ VOID (ล็อกแถวใบเบิกต้นทางด้วย)
- [ ] **Step 5:** `npm test` → ผ่านทั้งหมด (66 เดิม + ใหม่) · `npm run typecheck`
- [ ] **Step 6: commit** `feat(api): stock returns against a withdrawal`

### Task 2: Dashboard ยอดใช้สุทธิ

**Files:** Modify `backend/src/services/dashboard.service.ts` · Test `backend/test/dashboard.test.ts`

- [ ] **Step 1: test ที่ล้ม:** เบิก 5 คืน 2 → `topWithdrawn.totalQuantity` = 3, `byDepartment.quantity` = 3; รับคืนไม่เปลี่ยนราคาล่าสุด (`LATEST_PRICE` ใช้ `i.unit_price IS NOT NULL` อยู่แล้ว — test ยืนยัน)
- [ ] **Step 2:** รัน → FAIL (ได้ 5)
- [ ] **Step 3:** เพิ่ม fragment `NET_QTY` = `i.quantity - COALESCE(ยอดคืนที่ยังไม่ถูกยกเลิกของ t + material, 0)` ใช้แทน `i.quantity` ใน reorderSuggestions, topWithdrawn, byDepartment (นับจำนวนครั้ง/วันที่เบิกล่าสุดคงเดิม)
- [ ] **Step 4:** `npm test` ผ่าน · commit `feat(api): dashboard counts net usage after returns`

### Task 3: FE ปุ่มรับคืน + แสดงในประวัติ/ใบเบิก

**Files:**
- Modify: `frontend/src/app/shared/models/transaction.ts` — `returnOf: TransactionRef | null`, `returns: (TransactionRef & { items: { materialId: string; quantity: number }[] })[]`, `ReturnInput`, `Returnable`
- Modify: `frontend/src/app/features/inventory/inventory.service.ts` — `returnable(id)`, `returnItems(id, input)`
- Create: `frontend/src/app/features/inventory/return-dialog.{ts,html}` — MatDialog: แต่ละบรรทัด QUANTITY = ช่องจำนวน (0..issued−returned), SERIAL = checkbox S/N ที่ยังคืนได้; ช่องเหตุผล (required); ข้อความ "รับคืนเฉพาะของสภาพดี"; ปุ่มบันทึก disabled จนกว่ามีอย่างน้อย 1 ชิ้น; error server → `applyServerErrors`
- Modify: `history-page.{ts,html}` — ปุ่ม "รับคืน" (icon `assignment_return`) สำหรับ STAFF/ADMIN บนแถว OUT ที่ไม่ใช่ reversal และยังไม่ถูกยกเลิก; badge "รับคืนจาก TXN-…" บนรายการรับคืน (ประเภทแสดง "รับคืน"); badge "รับคืนแล้ว TXN-…" บนใบเบิก
- Modify: `withdrawal-document-page.html` — บรรทัด "รับคืนแล้ว: TXN-… (รายการ จำนวน)" ใต้ตาราง
- Modify: mock `toTransaction` ใส่ `returnOf: null, returns: []` ให้ compile
- Test: `return-dialog.spec.ts` — payload: บรรทัดจำนวน 0 ไม่ถูกส่ง, SERIAL ส่ง units ตามที่ติ๊กและ quantity = จำนวนที่ติ๊ก

- [ ] **Step 1:** spec ที่ล้ม → **Step 2:** implement → **Step 3:** `npm test -- --watch=false` + `npm run build` ผ่าน
- [ ] **Step 4:** Playwright บน test servers (4300→3001): staff คืน 2 จาก 5 → สต็อก/ประวัติ/ใบเบิกแสดงถูก; USER ไม่เห็นปุ่ม
- [ ] **Step 5:** commit `feat(web): return items from history`

### Task 4: เอกสาร + DB จริง

- [ ] เพิ่ม D18 ใน `docs/spec-v2.2-it-inventory.md` (endpoint, error code `HAS_RETURNS`), `docs/status.md`, `CLAUDE.md` (domain model `returnOfId`, ตาราง roles แถว "รับคืน" ADMIN/STAFF, business rule), `docs/handoff.md`
- [ ] backup DB จริง (`backend/backups/`) แล้ว `prisma migrate deploy`
- [ ] commit `docs: D18 stock returns`
- [ ] final review ทั้ง branch (subagent) → แก้ Critical/Important แบบ TDD
