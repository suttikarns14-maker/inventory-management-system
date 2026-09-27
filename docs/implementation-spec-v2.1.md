# Full-stack Implementation Design Specification v2.1

**Project:** ระบบฐานข้อมูลคลังวัสดุ (Inventory Management System)
**Architecture:** Decoupled Front-end / Back-end (REST, JSON)
**Stack:** Angular + TypeScript (FE) · Node.js 24 + TypeScript + Express 5 + Prisma + Zod (BE) · PostgreSQL 16 บน Docker
**Supersedes:** Design Spec v2.0.0. ปรับตาม User Stories ใน SRS, การตัดสินใจของเจ้าของโปรเจกต์ และผลตรวจใน [spec-review.md](spec-review.md)

---

## 0. สรุปการเปลี่ยนแปลงจาก v2.0.0

| หัวข้อ | v2.0.0 | v2.1 | อ้างอิง |
|---|---|---|---|
| สิทธิ์ | ADMIN/STAFF บางส่วน ไม่ได้กำหนด USER | กำหนดครบทุก role (§1) | M2, M8 |
| Dashboard | KPI มูลค่าคลังรวม | วัสดุที่ควรสั่งซื้อ, วัสดุที่เบิกมากที่สุด, วัสดุที่ไม่เคยเบิก (§6) | M7 |
| ตัดสต็อก | อ่านยอดแล้วค่อย increment (race condition) | หักแบบมีเงื่อนไขในคำสั่งเดียว + DB `CHECK` (§5.1) | C1 |
| Validation ของจำนวน | ไม่มี | ต้องเป็นจำนวนเต็มบวก และห้ามวัสดุซ้ำในรายการเดียว (§4.4) | C2, C3 |
| `referenceNo` | ไม่ได้ระบุวิธีสร้าง | ตัวนับรายวันใน DB ตามเวลา Asia/Bangkok (§5.2) | C4 |
| แก้รายการผิด | ไม่มี | รายการกลับ (reversal) โดย ADMIN (§5.3) | M6 |
| Endpoint | ไม่มี users, categories, logout | เพิ่มครบ (§4.3) | M5 |
| `/materials/low-stock` | endpoint แยก | ใช้ filter `?lowStock=true` แทน | ลดจำนวน endpoint |
| Error | `AppError(status, message)` | `AppError(status, code, message)` + รายการ code กลาง (§4.2) | M4 |
| Schema | `status` เป็น String, index `code` ซ้ำ, default role STAFF | enum, ลบ index ซ้ำ, default role USER, `isActive` (§3) | m3, m4, M8 |
| สร้างรายการสำเร็จ | 200 OK | 201 Created | m6 |
| Secrets | hardcode ใน compose | `.env` (§9) | C7 |
| Frontend | React / Next.js / Vite + TanStack Query + Zustand | **Angular** + Signals + Reactive Forms + Angular Material (§8) | M1 |
| Token | localStorage หรือ cookie | **HttpOnly cookie** + origin เดียวผ่าน proxy (§7) | C6, M12 |

---

## 1. Roles & Permissions

| การกระทำ | ADMIN | STAFF | USER |
|---|:-:|:-:|:-:|
| Login / Logout / ดูข้อมูลตัวเอง | ✅ | ✅ | ✅ |
| ดูและค้นหารายการวัสดุ | ✅ | ✅ | ✅ |
| **เพิ่ม**วัสดุ | ✅ | ✅ | ❌ |
| **แก้ไข**วัสดุ (รวมถึงเปิด/ปิดใช้งาน) | ✅ | ❌ | ❌ |
| ดูหมวดหมู่ | ✅ | ✅ | ✅ |
| เพิ่ม/แก้ไขหมวดหมู่ | ✅ | ❌ | ❌ |
| บันทึก**รับเข้า** (IN) | ✅ | ✅ | ❌ |
| บันทึก**เบิกจ่าย** (OUT) | ✅ | ✅ | ✅ |
| ยกเลิกรายการ (reversal) | ✅ | ❌ | ❌ |
| ดูประวัติรับ-จ่าย | ทั้งหมด | ทั้งหมด | **เฉพาะของตัวเอง** |
| Dashboard | ✅ | ✅ | ❌ |
| จัดการผู้ใช้ | ✅ | ❌ | ❌ |

- สิทธิ์ต้องบังคับที่ **back-end** เสมอ ส่วน front-end ซ่อนเมนูและปุ่มเพื่อ UX เท่านั้น
- หลัง login: USER ไปที่ `/inventory/transactions` ส่วน ADMIN และ STAFF ไปที่ `/dashboard`
- STAFF เห็น Dashboard ได้ เพราะเป็นผู้ดูแลการสั่งซื้อ (D3)

---

## 2. User Stories (ฉบับปรับปรุง)

> 🆕 = story ใหม่ที่ SRS เดิมไม่มี แต่หน้าเว็บใน Sitemap ต้องใช้ · ✏️ = แก้ไขจาก SRS เดิม

### Epic 0: การเข้าสู่ระบบและผู้ใช้งาน

**🆕 US-0.1 เข้าสู่ระบบ / ออกจากระบบ** (ทุก role)
- Login ด้วย email + password ถ้าผิดตอบ 401 `INVALID_CREDENTIALS` โดยไม่บอกว่าผิดที่ email หรือรหัสผ่าน
- บัญชีที่ถูกปิด (`isActive = false`) login ไม่ได้ ตอบ 403 `USER_INACTIVE`
- จำกัดการ login ผิดไว้ที่ 5 ครั้ง / 15 นาที / IP
- Token หมดอายุหรือไม่ถูกต้อง ให้กลับไปหน้า `/login` เข้าหน้าที่ไม่มีสิทธิ์ ให้ไปหน้า `/403`

**🆕 US-0.2 จัดการบัญชีผู้ใช้** (ADMIN) ที่หน้า `/settings/users`
- ดูรายชื่อ, เพิ่มผู้ใช้, แก้ชื่อหรือ role, ปิด/เปิดใช้งาน และตั้งรหัสผ่านใหม่
- **ไม่มีการลบผู้ใช้** เพราะประวัติรับ-จ่ายต้องอ้างถึงผู้ทำรายการได้เสมอ
- ADMIN ห้ามลด role หรือปิดบัญชีของตัวเอง เพื่อกันไม่ให้ระบบเหลือแต่คนที่ไม่มี ADMIN
- Admin คนแรกสร้างจาก seed script

### Epic 1: การจัดการข้อมูลหลักวัสดุ

**✏️ US-1.1 เพิ่มและจัดการรายการวัสดุ**
- **ทุก role:** ดู ค้นหา (จาก `code` และ `name` ไม่สนตัวพิมพ์เล็กใหญ่) กรองตามหมวดหมู่หรือสต็อกต่ำ เรียงลำดับ และแบ่งหน้า
- **ADMIN, STAFF:** เพิ่มวัสดุได้ `code` ห้ามซ้ำ ถ้าซ้ำตอบ 409 `DUPLICATE_CODE`
- **ADMIN:** แก้ไขวัสดุ และเปิด/ปิดใช้งาน (`ACTIVE` / `INACTIVE`) ได้
- **ห้าม**กำหนดหรือแก้ `currentQuantity` ในฟอร์มวัสดุ ยอดเริ่มต้นต้องบันทึกผ่านรายการรับเข้า (IN) เพื่อให้มีประวัติ
- Validation: `code`, `name`, `unit` ห้ามว่าง, `categoryId` ต้องมีอยู่จริง, `minStock` เป็นจำนวนเต็ม `>= 0`
- Badge **สีแดง "เตือนสต็อกต่ำ"** เมื่อ `currentQuantity <= minStock` นอกนั้นเป็นสีเขียว

**🆕 US-1.2 จัดการหมวดหมู่วัสดุ** (ADMIN) ที่หน้า `/settings/categories`
- เพิ่มหรือแก้ชื่อและคำอธิบาย โดยชื่อห้ามซ้ำ ยังไม่มีการลบ เพราะมีวัสดุอ้างถึงอยู่

### Epic 2: การรับเข้าและเบิกจ่ายวัสดุ

**✏️ US-2.1 รับเข้าและเบิกจ่ายพร้อมตัดสต็อกอัตโนมัติ**
- **IN:** ADMIN, STAFF · **OUT:** ทุก role โดย USER จะเห็นเฉพาะโหมดเบิกจ่าย
- เพิ่มวัสดุได้หลายรายการในครั้งเดียว วัสดุหนึ่งตัวมีได้บรรทัดเดียว และจำนวนต้องเป็นจำนวนเต็มบวก
- ทำรายการกับวัสดุ `INACTIVE` ไม่ได้
- **Front-end:** โหมด OUT ถ้าจำนวน > ยอดคงเหลือ ให้แสดงข้อความเตือนสีแดงใต้ช่อง และปิดปุ่ม "ยืนยันรายการ"
- **Back-end:** ตรวจซ้ำเสมอ ถ้าไม่พอตอบ 400 `INSUFFICIENT_STOCK` พร้อมชื่อวัสดุ และ rollback ทั้งรายการ
- สำเร็จแล้วแสดง toast พร้อมเลขอ้างอิง (`TXN-YYYYMMDD-NNN`) และ reset ฟอร์ม
- **ประวัติ (`/inventory/history`):** กรองตามช่วงวันที่, ประเภท, วัสดุ และผู้ทำรายการได้ โดย USER เห็นเฉพาะรายการของตัวเอง

**🆕 US-2.2 ยกเลิกรายการที่บันทึกผิด** (ADMIN)
- **ห้ามลบหรือแก้รายการเดิม** ให้สร้าง "รายการกลับ" ที่มีประเภทตรงข้ามและจำนวนเท่าเดิม แล้วอ้างถึงรายการเดิม โดยต้องระบุเหตุผล
- ยกเลิกรายการเดิมได้ครั้งเดียว และยกเลิกรายการที่เป็นรายการกลับอยู่แล้วไม่ได้
- ถ้ายกเลิกรายการ IN แล้วทำให้สต็อกติดลบ (เพราะเบิกไปแล้ว) ต้องปฏิเสธด้วย `INSUFFICIENT_STOCK`
- ในหน้าประวัติ รายการเดิมจะมีป้าย "ยกเลิกแล้ว" และรายการกลับจะลิงก์ไปหาต้นฉบับ

### Epic 3: Dashboard และการแจ้งเตือน

**✏️ US-3.1 Dashboard ช่วยตัดสินใจสั่งซื้อ** (ADMIN, STAFF)
> **As a** ผู้บริหารคลังหรือหัวหน้างาน **I want to** เห็นว่าวัสดุตัวไหนต้องสั่งซื้อ ตัวไหนใช้มากที่สุด และตัวไหนไม่เคยถูกใช้ **So that** วางแผนสั่งซื้อได้ทันเวลาและไม่ซื้อของที่ไม่ได้ใช้มาเก็บไว้

- **KPI cards:** วัสดุที่ใช้งานอยู่, ต้องสั่งซื้อ, หมดสต็อก, ไม่เคยเบิก และจำนวนครั้งที่เบิกในเดือนนี้
- **ตาราง "ควรสั่งซื้อ"** เรียงตามความเร่งด่วน แสดงยอดคงเหลือ, จุดสั่งซื้อ, อัตราการใช้ต่อวัน, จำนวนวันที่เหลือโดยประมาณ และ**จำนวนแนะนำให้สั่ง** (สูตรใน §6)
- **อันดับวัสดุที่เบิกมากที่สุด** (Top 10) เลือกช่วงเวลาได้ (30 / 90 / 365 วัน) และสลับการเรียงระหว่าง "จำนวนที่เบิก" กับ "จำนวนครั้งที่เบิก" ได้
- **วัสดุที่ไม่เคยเบิก**: เลือกได้ระหว่าง "ไม่เคยเบิกเลย" หรือ "ไม่ได้เบิกเกิน N วัน" แสดงยอดคงค้างและวันที่เบิกล่าสุด
- ไม่นับรายการที่ถูกยกเลิกแล้ว และไม่นับวัสดุ `INACTIVE`
- ~~มูลค่าคลังรวม~~: ตัดออกจากขอบเขต

---

## 3. Database Schema (Prisma)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  ADMIN
  STAFF
  USER
}

enum TransactionType {
  IN
  OUT
}

enum MaterialStatus {
  ACTIVE
  INACTIVE
}

model User {
  id                String             @id @default(uuid())
  email             String             @unique
  passwordHash      String             @map("password_hash")
  fullName          String             @map("full_name")
  role              Role               @default(USER)
  isActive          Boolean            @default(true) @map("is_active")
  createdAt         DateTime           @default(now()) @map("created_at")
  updatedAt         DateTime           @updatedAt @map("updated_at")
  stockTransactions StockTransaction[]

  @@map("users")
}

model Category {
  id          String     @id @default(uuid())
  name        String     @unique
  description String?
  materials   Material[]
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")

  @@map("categories")
}

model Material {
  id               String                 @id @default(uuid())
  code             String                 @unique
  name             String
  categoryId       String                 @map("category_id")
  category         Category               @relation(fields: [categoryId], references: [id])
  unit             String
  currentQuantity  Int                    @default(0) @map("current_quantity")
  minStock         Int                    @default(0) @map("min_stock")
  location         String?
  status           MaterialStatus         @default(ACTIVE)
  createdAt        DateTime               @default(now()) @map("created_at")
  updatedAt        DateTime               @updatedAt @map("updated_at")
  transactionItems StockTransactionItem[]

  @@index([categoryId])
  @@index([status])
  @@map("materials")
}

model StockTransaction {
  id           String                 @id @default(uuid())
  type         TransactionType
  referenceNo  String                 @unique @map("reference_no")
  createdById  String                 @map("created_by_id")
  createdBy    User                   @relation(fields: [createdById], references: [id])
  note         String?
  reversalOfId String?                @unique @map("reversal_of_id")
  reversalOf   StockTransaction?      @relation("Reversal", fields: [reversalOfId], references: [id])
  reversedBy   StockTransaction?      @relation("Reversal")
  createdAt    DateTime               @default(now()) @map("created_at")
  items        StockTransactionItem[]

  @@index([type, createdAt])
  @@index([createdById])
  @@map("stock_transactions")
}

model StockTransactionItem {
  id            String           @id @default(uuid())
  transactionId String           @map("transaction_id")
  transaction   StockTransaction @relation(fields: [transactionId], references: [id])
  materialId    String           @map("material_id")
  material      Material         @relation(fields: [materialId], references: [id])
  quantity      Int
  unitPrice     Decimal?         @map("unit_price") @db.Decimal(10, 2)

  @@unique([transactionId, materialId])
  @@index([materialId])
  @@map("stock_transaction_items")
}

model ReferenceCounter {
  date      String @id // YYYYMMDD ตามเวลา Asia/Bangkok
  lastValue Int    @map("last_value")

  @@map("reference_counters")
}
```

**Constraints เพิ่มเติม** ให้ใส่ใน migration SQL เพราะ Prisma schema ไม่รองรับ `CHECK`:

```sql
ALTER TABLE materials
  ADD CONSTRAINT materials_current_quantity_nonneg CHECK (current_quantity >= 0),
  ADD CONSTRAINT materials_min_stock_nonneg        CHECK (min_stock >= 0);
ALTER TABLE stock_transaction_items
  ADD CONSTRAINT items_quantity_positive CHECK (quantity > 0);
```

**หมายเหตุ**
- `@@unique([transactionId, materialId])` กันวัสดุซ้ำในรายการเดียวระดับ DB (C3)
- `reversalOfId @unique` ทำให้รายการหนึ่งถูกยกเลิกได้ครั้งเดียว
- ไม่ใช้ `onDelete: Cascade` เพราะรายการรับ-จ่ายจะไม่ถูกลบ
- `unitPrice` เป็น optional ใช้บันทึกราคาตอนรับเข้าไว้อ้างอิงเท่านั้น ไม่ได้ใช้ใน Dashboard และไม่บันทึกในรายการ OUT
- Prisma แปลง `Decimal` เป็น **string** ใน JSON ดังนั้นต้องกำหนด type ฝั่ง front-end ให้ตรงกัน

---

## 4. Back-end

### 4.1 โครงสร้าง (Layered)

**Libraries:** `express` (v5, ส่ง error จาก async handler เข้า error middleware ให้เอง), `@prisma/client` + `prisma`, `zod`, `jsonwebtoken`, `cookie-parser`, `bcryptjs`, `helmet`, `express-rate-limit` · **Dev:** `typescript`, `tsx` (รันแบบ watch), `vitest` + `supertest`

```
backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                 # สร้าง ADMIN คนแรก + หมวดหมู่ตัวอย่าง
└── src/
    ├── config/                 # env.ts (ตรวจ env ด้วย Zod), database.ts
    ├── routes/                 # auth, users, categories, materials, inventory, dashboard
    ├── middlewares/            # auth, role, validate, error, rate-limit
    ├── controllers/            # รับ request และ map response เท่านั้น
    ├── services/               # business logic + DB transaction
    ├── dtos/                   # Zod schemas
    ├── utils/                  # app-error.ts, error-codes.ts, reference-no.ts, logger.ts
    └── app.ts
```

### 4.2 Response & Error

```json
{ "success": true, "data": {}, "meta": { "page": 1, "limit": 20, "total": 50, "totalPages": 3 } }
{ "success": false, "error": { "code": "INSUFFICIENT_STOCK", "message": "วัสดุ \"กระดาษ A4\" คงเหลือ 5 รีม ไม่พอเบิก 8 รีม" } }
```

- `meta` มีเฉพาะ endpoint ที่แบ่งหน้า ค่าเริ่มต้น `limit = 20` สูงสุด `100`
- `message` เป็นภาษาไทยสำหรับแสดงผู้ใช้ ส่วน `code` ใช้ให้โปรแกรมตัดสินใจ
- `VALIDATION_ERROR` แนบ `error.details: [{ field, message }]` เพื่อให้ฟอร์มแสดง error ใต้ช่องได้

```ts
// utils/app-error.ts
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}
```

| Code | HTTP | ใช้เมื่อ |
|---|---|---|
| `VALIDATION_ERROR` | 400 | input ไม่ผ่าน Zod |
| `INSUFFICIENT_STOCK` | 400 | เบิกเกินยอดคงเหลือ หรือยกเลิก IN แล้วทำให้ยอดติดลบ |
| `MATERIAL_INACTIVE` | 400 | ทำรายการกับวัสดุที่ปิดใช้งาน |
| `INVALID_CREDENTIALS` | 401 | email หรือรหัสผ่านผิด |
| `UNAUTHORIZED` | 401 | ไม่มี token, token ไม่ถูกต้อง หรือหมดอายุ |
| `USER_INACTIVE` | 403 | บัญชีถูกปิด |
| `FORBIDDEN` | 403 | role ไม่มีสิทธิ์ |
| `NOT_FOUND` | 404 | ไม่พบข้อมูล |
| `DUPLICATE_CODE` | 409 | `code` วัสดุ, ชื่อหมวดหมู่ หรือ email ซ้ำ |
| `ALREADY_REVERSED` | 409 | ยกเลิกรายการซ้ำ หรือยกเลิกรายการกลับ |
| `TOO_MANY_REQUESTS` | 429 | login ผิดเกินกำหนด |
| `INTERNAL_ERROR` | 500 | error ที่ไม่ได้คาดไว้ ห้ามส่ง stack trace ออกไป |

### 4.3 API Endpoints (`/api/v1`)

| Module | Method | Path | Role | หมายเหตุ |
|---|---|---|---|---|
| **Auth** | POST | `/auth/login` | Public | rate limited, set cookie (ดู §7) |
| | POST | `/auth/logout` | ทุก role | ล้าง cookie |
| | GET | `/auth/me` | ทุก role | |
| **Users** | GET | `/users` | ADMIN | `search`, `role`, `isActive`, `page`, `limit` |
| | POST | `/users` | ADMIN | 201 |
| | PUT | `/users/:id` | ADMIN | `fullName`, `role`, `isActive` (ห้ามแก้ตัวเอง) |
| | PUT | `/users/:id/password` | ADMIN | ตั้งรหัสผ่านใหม่ |
| **Categories** | GET | `/categories` | ทุก role | ไม่แบ่งหน้า |
| | POST | `/categories` | ADMIN | 201 |
| | PUT | `/categories/:id` | ADMIN | |
| **Materials** | GET | `/materials` | ทุก role | `search`, `categoryId`, `status` (ค่าเริ่มต้น `ACTIVE`), `lowStock=true`, `sortBy` (`code`\|`name`\|`currentQuantity`\|`updatedAt`), `sortOrder`, `page`, `limit` |
| | GET | `/materials/:id` | ทุก role | |
| | POST | `/materials` | ADMIN, STAFF | 201 · ไม่รับ `currentQuantity` |
| | PUT | `/materials/:id` | ADMIN | ไม่รับ `currentQuantity` · แก้ `code` ได้ถ้าไม่ซ้ำ (D6) โดยประวัติอ้างถึงวัสดุด้วย `id` จึงไม่กระทบ แต่จะแสดงรหัสใหม่ |
| **Inventory** | POST | `/inventory/transactions` | IN: ADMIN, STAFF · OUT: ทุก role | 201 |
| | GET | `/inventory/transactions/:id` | ทุก role | USER ดูได้เฉพาะของตัวเอง |
| | POST | `/inventory/transactions/:id/reverse` | ADMIN | body: `{ note }` (บังคับ) · 201 |
| | GET | `/inventory/history` | ทุก role | `from`, `to`, `type`, `materialId`, `createdById`, `page`, `limit` · USER ถูกบังคับเป็นของตัวเอง |
| **Dashboard** | GET | `/dashboard/summary` | ADMIN, STAFF | KPI |
| | GET | `/dashboard/reorder-suggestions` | ADMIN, STAFF | |
| | GET | `/dashboard/top-withdrawn` | ADMIN, STAFF | `from`, `to` (ค่าเริ่มต้น 30 วันล่าสุด), `sortBy` (`quantity`\|`count`), `limit` (ค่าเริ่มต้น 10) |
| | GET | `/dashboard/unused` | ADMIN, STAFF | `days` ถ้าไม่ส่งหมายถึง "ไม่เคยเบิกเลย" |

Filter สต็อกต่ำเทียบสอง column จึงใช้ field reference ของ Prisma:
`where: { currentQuantity: { lte: prisma.material.fields.minStock } }`

### 4.3.1 รูปแบบข้อมูลใน response

รูปแบบของแต่ละ entity (เช่น `Material` มี `category: { id, name }` และ `StockTransaction` มี `createdBy`, `reversalOf`, `reversedBy` และ `items[].material`) กำหนดไว้เป็น TypeScript ใน `frontend/src/app/shared/models/` ไฟล์เหล่านี้คือ **API contract** ที่ back-end ต้องตอบให้ตรงกัน ส่วน mock API ใน Part 1 ตอบตาม contract นี้แล้ว

### 4.4 DTO หลัก

```ts
// dtos/transaction.dto.ts
export const createTransactionSchema = z.object({
  type: z.enum(['IN', 'OUT']),
  note: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        materialId: z.string().uuid(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative().optional(), // ใช้เฉพาะ IN
      }),
    )
    .min(1)
    .max(100)
    .refine((items) => new Set(items.map((i) => i.materialId)).size === items.length, {
      message: 'มีวัสดุซ้ำในรายการ',
    }),
});
export type CreateTransactionDto = z.infer<typeof createTransactionSchema>;
```

---

## 5. Core Business Logic

### 5.1 บันทึกรับเข้า / เบิกจ่าย

```ts
// services/transaction.service.ts
export class TransactionService {
  async create(user: AuthUser, dto: CreateTransactionDto, reversalOfId?: string) {
    if (dto.type === 'IN' && user.role === 'USER') {
      throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์บันทึกรับเข้า');
    }

    // เรียงตาม id ให้ทุกคำขอ lock แถวในลำดับเดียวกัน เพื่อกัน deadlock
    const items = [...dto.items].sort((a, b) => a.materialId.localeCompare(b.materialId));

    return prisma.$transaction(async (tx) => {
      const materials = await tx.material.findMany({
        where: { id: { in: items.map((i) => i.materialId) } },
        select: { id: true, name: true, unit: true, status: true },
      });
      const byId = new Map(materials.map((m) => [m.id, m]));

      for (const item of items) {
        const m = byId.get(item.materialId);
        if (!m) throw new AppError(404, 'NOT_FOUND', 'ไม่พบวัสดุบางรายการ');
        if (m.status !== 'ACTIVE') {
          throw new AppError(400, 'MATERIAL_INACTIVE', `วัสดุ "${m.name}" ถูกปิดใช้งาน`);
        }
      }

      for (const item of items) {
        if (dto.type === 'IN') {
          await tx.material.update({
            where: { id: item.materialId },
            data: { currentQuantity: { increment: item.quantity } },
          });
          continue;
        }
        // ตรวจและหักในคำสั่งเดียว ปลอดภัยเมื่อมีคำขอพร้อมกัน (C1)
        const { count } = await tx.material.updateMany({
          where: { id: item.materialId, currentQuantity: { gte: item.quantity } },
          data: { currentQuantity: { decrement: item.quantity } },
        });
        if (count === 0) {
          const m = byId.get(item.materialId)!;
          const current = await tx.material.findUniqueOrThrow({
            where: { id: m.id },
            select: { currentQuantity: true },
          });
          throw new AppError(
            400,
            'INSUFFICIENT_STOCK',
            `วัสดุ "${m.name}" คงเหลือ ${current.currentQuantity} ${m.unit} ไม่พอเบิก ${item.quantity} ${m.unit}`,
          );
        }
      }

      return tx.stockTransaction.create({
        data: {
          type: dto.type,
          referenceNo: await nextReferenceNo(tx),
          createdById: user.id,
          note: dto.note,
          reversalOfId,
          items: {
            create: items.map((i) => ({
              materialId: i.materialId,
              quantity: i.quantity,
              unitPrice: dto.type === 'IN' ? i.unitPrice : undefined,
            })),
          },
        },
        include: { items: true },
      });
    });
  }
}
```

ถ้ามี error ใดๆ ใน callback ของ `$transaction` Prisma จะ rollback ทั้งหมด ทั้งยอดวัสดุ, header, items และตัวนับเลขอ้างอิง

### 5.2 เลขอ้างอิง `TXN-YYYYMMDD-NNN`

```ts
// utils/reference-no.ts
export async function nextReferenceNo(tx: Prisma.TransactionClient): Promise<string> {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })
    .format(new Date())
    .replaceAll('-', '');
  const [{ last_value }] = await tx.$queryRaw<{ last_value: number }[]>`
    INSERT INTO reference_counters (date, last_value) VALUES (${date}, 1)
    ON CONFLICT (date) DO UPDATE SET last_value = reference_counters.last_value + 1
    RETURNING last_value`;
  return `TXN-${date}-${String(last_value).padStart(3, '0')}`;
}
```

- แถวของตัวนับถูก lock จนกว่ารายการจะ commit การสร้างรายการในวันเดียวกันจึงทำทีละรายการ ซึ่งพอสำหรับคลังขนาดนี้
- ถ้าเกิน 999 รายการต่อวัน เลขจะยาวขึ้นเป็น 4 หลักเองโดยไม่ชนกัน

### 5.3 ยกเลิกรายการ (Reversal)

```ts
async reverse(admin: AuthUser, id: string, note: string) {
  const original = await prisma.stockTransaction.findUnique({
    where: { id },
    include: { items: true, reversedBy: { select: { id: true } } },
  });
  if (!original) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรายการ');
  if (original.reversedBy || original.reversalOfId) {
    throw new AppError(409, 'ALREADY_REVERSED', 'รายการนี้ถูกยกเลิกไปแล้ว หรือเป็นรายการยกเลิก');
  }
  return this.create(
    admin,
    {
      type: original.type === 'IN' ? 'OUT' : 'IN',
      note: `ยกเลิก ${original.referenceNo}: ${note}`,
      items: original.items.map((i) => ({ materialId: i.materialId, quantity: i.quantity })),
    },
    original.id, // ถ้ามีคำขอยกเลิกพร้อมกัน reversalOfId @unique จะกันไว้ (P2002 → ALREADY_REVERSED)
  );
}
```

`error.middleware.ts` ต้องแปลง Prisma error `P2002` (unique ชนกัน) เป็น `409` ตาม field เช่น `DUPLICATE_CODE` หรือ `ALREADY_REVERSED`

---

## 6. Dashboard Logic

**ทุก query:** ไม่นับรายการ OUT ที่ถูกยกเลิกแล้ว และไม่นับรายการกลับ ใช้เงื่อนไขนี้ซ้ำ:

```sql
t.reversal_of_id IS NULL
AND NOT EXISTS (SELECT 1 FROM stock_transactions r WHERE r.reversal_of_id = t.id)
```

### 6.1 `GET /dashboard/summary`
| Field | ความหมาย |
|---|---|
| `activeMaterials` | จำนวนวัสดุ `ACTIVE` |
| `reorderCount` | จำนวนวัสดุในตาราง "ควรสั่งซื้อ" (§6.2) |
| `outOfStockCount` | `ACTIVE` และ `currentQuantity = 0` |
| `neverWithdrawnCount` | `ACTIVE` และไม่เคยมีรายการ OUT |
| `withdrawalsThisMonth` | จำนวนรายการ OUT ในเดือนนี้ (Asia/Bangkok) |

### 6.2 `GET /dashboard/reorder-suggestions`

ค่าคงที่ใน `config/dashboard.ts` (D4):

| ค่าคงที่ | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `USAGE_WINDOW_DAYS` | 90 | ใช้ข้อมูลการเบิกย้อนหลังกี่วันในการคำนวณอัตราการใช้ |
| `ALERT_DAYS` | 14 | เตือนเมื่อคาดว่าของจะหมดภายในกี่วัน |
| `COVERAGE_DAYS` | 30 | สั่งซื้อให้พอใช้ต่อได้กี่วัน |

สำหรับวัสดุ `ACTIVE` แต่ละตัว:
- `avgDailyUsage` = ยอด OUT ใน `USAGE_WINDOW_DAYS` วัน ÷ `USAGE_WINDOW_DAYS`
- `daysLeft` = `currentQuantity ÷ avgDailyUsage` (เป็น `null` ถ้าไม่มีการใช้)
- **อยู่ในรายการ** เมื่อ `currentQuantity <= minStock` **หรือ** `daysLeft <= ALERT_DAYS`
- `suggestedQty` = `max(0, ceil(minStock + avgDailyUsage × COVERAGE_DAYS) − currentQuantity)`
- **เรียงลำดับ:**
  1. หมดสต็อก (`currentQuantity = 0`)
  2. `daysLeft` น้อยไปมาก โดยให้ `null` อยู่ท้าย
  3. `currentQuantity / minStock` น้อยไปมาก

ถ้า `suggestedQty = 0` แต่อยู่ในรายการ (ถึงจุดสั่งซื้อแต่ไม่มีประวัติการใช้) หน้าเว็บจะแสดงว่า "ถึงจุดสั่งซื้อ ยังไม่มีข้อมูลการใช้"

### 6.3 `GET /dashboard/top-withdrawn`

```sql
SELECT m.id, m.code, m.name, m.unit,
       SUM(i.quantity)::int        AS total_quantity,
       COUNT(DISTINCT t.id)::int   AS withdrawal_count
FROM stock_transaction_items i
JOIN stock_transactions t ON t.id = i.transaction_id
JOIN materials m          ON m.id = i.material_id
WHERE t.type = 'OUT' AND t.created_at >= $from AND t.created_at < $to
  AND m.status = 'ACTIVE'
  AND <exclude reversed>
GROUP BY m.id
ORDER BY <total_quantity | withdrawal_count> DESC
LIMIT $limit;
```

วัสดุแต่ละตัวใช้หน่วยต่างกัน (ชิ้น กล่อง ชุด) การเรียงด้วย "จำนวนที่เบิก" จึงเทียบข้ามหน่วยได้ไม่ตรงนัก หน้าเว็บจึงให้สลับไปเรียงด้วย "จำนวนครั้งที่เบิก" ได้ ซึ่งเทียบข้ามหน่วยได้

### 6.4 `GET /dashboard/unused`

```sql
SELECT m.id, m.code, m.name, m.unit, m.current_quantity, m.created_at, lo.last_out_at
FROM materials m
LEFT JOIN LATERAL (
  SELECT MAX(t.created_at) AS last_out_at
  FROM stock_transaction_items i
  JOIN stock_transactions t ON t.id = i.transaction_id
  WHERE i.material_id = m.id AND t.type = 'OUT' AND <exclude reversed>
) lo ON true
WHERE m.status = 'ACTIVE'
  AND (lo.last_out_at IS NULL OR ($days::int IS NOT NULL AND lo.last_out_at < now() - make_interval(days => $days::int)))
ORDER BY lo.last_out_at NULLS FIRST, m.current_quantity DESC;
```

ใช้ `prisma.$queryRaw` แบบ tagged template สำหรับ §6.3 และ §6.4 ห้ามต่อ string ของ SQL เอง ส่วน parameter ที่เป็น `null` ได้ต้อง cast type (`::int`) เพราะ Postgres อนุมาน type จาก `null` ไม่ได้

---

## 7. Authentication

**✅ ตัดสินใจแล้ว:** ใช้ HttpOnly cookie โดยให้ front-end และ API อยู่ origin เดียวกัน วิธีนี้ใช้ได้ทั้งตอนพัฒนาบนเครื่องและตอนย้ายขึ้น server โดยไม่ต้องแก้โค้ด

- **ตอนพัฒนา:** Angular dev server ใช้ `proxy.conf.json` ส่ง `/api/*` ไปที่ back-end (`http://localhost:3000`) ทำให้ browser เห็นเป็น origin เดียว **ไม่ต้องตั้ง CORS**
  ```json
  { "/api": { "target": "http://localhost:3000", "secure": false } }
  ```
- **บน server:** ใช้ reverse proxy (เช่น Nginx หรือ Caddy) เสิร์ฟไฟล์ static ของ Angular ที่ `/` และส่ง `/api` ไปที่ back-end ภายใต้ domain เดียวกัน
- **Cookie:** `HttpOnly; SameSite=Lax; Path=/api; Secure` (เปิด `Secure` เมื่อ `NODE_ENV=production`) ใช้ JWT แบบ access token อย่างเดียว อายุ 8 ชั่วโมง (1 กะทำงาน)
- **ความปลอดภัย:** `SameSite=Lax` + origin เดียว + API รับแค่ `application/json` เพียงพอสำหรับป้องกัน CSRF ในระบบภายใน
- Front-end **ไม่ต้องจัดการ token** browser ส่ง cookie ให้เองเพราะเป็น origin เดียว interceptor ทำแค่ redirect ไป `/login` เมื่อได้ 401
- `auth.middleware.ts` ตรวจ JWT แล้วโหลด user จาก DB ทุก request เพื่อให้การปิดบัญชีมีผลทันที
- **รหัสผ่าน:** hash ด้วย `bcryptjs` (cost 12) เป็น JavaScript ล้วน จึงติดตั้งบน Windows ได้โดยไม่ต้องใช้ build tools
- **Refresh token:** ยังไม่ทำ ค่อยเพิ่มเมื่อผู้ใช้บ่นว่าต้อง login บ่อย

---

## 8. Front-end (Angular)

**Stack:** Angular (เวอร์ชันล่าสุดจาก Angular CLI) + TypeScript strict, standalone components, Signals, Reactive Forms, Angular Material

| ความต้องการ | v2.0.0 (React) | v2.1 (Angular) |
|---|---|---|
| Routing + guard | React Router + `ProtectedRoute` | Angular Router + functional guard (`CanActivateFn`) |
| เรียก API | Axios + interceptor | `HttpClient` + `HttpInterceptorFn` (มีในตัว) |
| Server state / cache | TanStack Query | Service + Signals โดยแต่ละหน้าโหลดข้อมูลใหม่ตอนเปิด (ไม่ทำ global cache) |
| Client state | Zustand | `signal()` ใน service (`AuthService`) |
| Forms + validation | React Hook Form + Zod | Reactive Forms + validators ของ Angular |
| UI components | Tailwind + เขียนเอง | Angular Material: table, paginator, sort, autocomplete, snackbar, dialog |
| กราฟ Top 10 | ไม่ระบุ | แท่งแนวนอนด้วย CSS (ความกว้างเป็น %) ไม่ต้องเพิ่ม chart library |

ไม่ต้องใช้ TanStack Query เพราะข้อมูลเปลี่ยนหลังทำรายการเท่านั้น และหน้าที่เกี่ยวข้อง (รายการวัสดุ, ประวัติ, dashboard) ก็โหลดใหม่ทุกครั้งที่เปิดอยู่แล้ว ถ้าภายหลังมีปัญหาเรื่องความเร็วค่อยเพิ่ม cache

### 8.1 โครงสร้าง

```
frontend/
├── proxy.conf.json
├── public/                           # favicon, รูป
└── src/
    ├── main.ts
    ├── styles.scss                   # Material theme + ฟอนต์
    └── app/
        ├── app.config.ts             # provideRouter, provideHttpClient(withInterceptors), provideAppInitializer
        ├── app.routes.ts
        ├── core/
        │   ├── auth/                 # auth.service.ts, auth.guard.ts, auth.interceptor.ts
        │   └── layout/               # shell (sidebar ตาม role + header)
        ├── shared/
        │   ├── components/           # status-badge, stat-card, confirm-dialog
        │   ├── models/               # api.ts, user.ts, material.ts, transaction.ts, dashboard.ts
        │   └── utils/                # date.ts (Asia/Bangkok), api-error.ts
        └── features/
            ├── auth/login/
            ├── errors/forbidden/     # หน้า 403
            ├── dashboard/            # dashboard.page + reorder-table, top-withdrawn, unused-list
            ├── materials/            # material-list, material-form (ใช้ทั้งหน้าเพิ่มและแก้ไข), material.service.ts
            ├── inventory/            # transaction-form, history, inventory.service.ts
            └── settings/             # users, categories
```

- **feature-first:** แต่ละ feature มี component และ service ของตัวเอง ส่วน `shared/` เก็บเฉพาะสิ่งที่ใช้มากกว่า 1 feature
- ทุกหน้าใช้ `loadComponent` (lazy load)
- ใช้ `ChangeDetectionStrategy.OnPush` และ control flow แบบใหม่ (`@if`, `@for`)

### 8.2 Sitemap

| Path | Role | หมายเหตุ |
|---|---|---|
| `/login` | Public | |
| `/403` | Public | |
| `/dashboard` | ADMIN, STAFF | |
| `/materials` | ทุก role | ใช้ path นี้แทน `/materials/list` ใน SRS |
| `/materials/new` | ADMIN, STAFF | |
| `/materials/:id/edit` | ADMIN | |
| `/inventory/transactions` | ทุก role | USER เห็นเฉพาะโหมด OUT |
| `/inventory/history` | ทุก role | USER เห็นเฉพาะของตัวเอง, ADMIN มีปุ่ม "ยกเลิกรายการ" |
| `/settings/users` | ADMIN | |
| `/settings/categories` | ADMIN | 🆕 |
| `/` | ทุก role | redirect ตาม role: USER ไป `/inventory/transactions` ส่วน ADMIN และ STAFF ไป `/dashboard` |

### 8.3 Auth, Guard & Interceptor

```ts
// core/auth/auth.service.ts
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  readonly user = signal<User | null>(null);

  // เรียกตอนเปิดแอปผ่าน provideAppInitializer ถ้ายังไม่ login จะได้ 401 และ user เป็น null
  loadMe() {
    return firstValueFrom(this.http.get<ApiSuccess<User>>('/api/v1/auth/me'))
      .then((res) => this.user.set(res.data))
      .catch(() => this.user.set(null));
  }
  // login() / logout() ตั้งค่า user.set(...) ตามผลลัพธ์
}
```

```ts
// core/auth/auth.guard.ts
export const authGuard: CanActivateFn = (route) => {
  const user = inject(AuthService).user();
  const router = inject(Router);
  if (!user) return router.createUrlTree(['/login']);
  const roles = route.data['roles'] as Role[] | undefined;
  return !roles || roles.includes(user.role) ? true : router.createUrlTree(['/403']);
};
```

```ts
// core/auth/auth.interceptor.ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.endsWith('/auth/me') && !req.url.endsWith('/auth/login')) {
        auth.user.set(null);
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
```

```ts
// app.routes.ts (ย่อ)
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login/login.page') },
  { path: '403', loadComponent: () => import('./features/errors/forbidden/forbidden.page') },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      { path: 'dashboard', data: { roles: ['ADMIN', 'STAFF'] }, loadComponent: /* ... */ },
      { path: 'materials', loadComponent: /* ... */ },
      { path: 'materials/new', data: { roles: ['ADMIN', 'STAFF'] }, loadComponent: /* ... */ },
      { path: 'materials/:id/edit', data: { roles: ['ADMIN'] }, loadComponent: /* ... */ },
      { path: 'inventory/transactions', loadComponent: /* ... */ },
      { path: 'inventory/history', loadComponent: /* ... */ },
      { path: 'settings/users', data: { roles: ['ADMIN'] }, loadComponent: /* ... */ },
      { path: 'settings/categories', data: { roles: ['ADMIN'] }, loadComponent: /* ... */ },
      { path: '', pathMatch: 'full', redirectTo: () =>
          inject(AuthService).user()?.role === 'USER' ? '/inventory/transactions' : '/dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];
```

- เมนูใน sidebar ซ่อนตาม role โดยใช้ข้อมูล role ชุดเดียวกับ `data.roles` ของ route แต่ back-end ยังเป็นตัวบังคับสิทธิ์จริง
- Error จาก API: `shared/utils/api-error.ts` ดึง `error.message` ไปแสดงใน `MatSnackBar` ส่วน `VALIDATION_ERROR` ใช้ `error.details` ใส่ error ให้แต่ละช่องในฟอร์ม (`control.setErrors({ server: message })`)

### 8.4 Transaction Form (Reactive Forms)

- `FormGroup { type, note, items: FormArray<FormGroup{ material, quantity, unitPrice }> }`
- **Toggle IN/OUT** แสดงเฉพาะ ADMIN และ STAFF ส่วน USER ถูกกำหนดเป็น `OUT` ตายตัว
- **ค้นหาวัสดุ:** `mat-autocomplete` + `valueChanges.pipe(debounceTime(300), distinctUntilChanged(), switchMap(...))` เรียก `GET /materials?search=&status=ACTIVE&limit=10`
- ถ้าเลือกวัสดุที่อยู่ในรายการแล้ว **ให้ focus ที่บรรทัดเดิม** แทนการเพิ่มบรรทัดใหม่
- ตอนเลือกวัสดุให้เก็บ `currentQuantity` ล่าสุดจากผลค้นหาไว้ในบรรทัดนั้น
- **Validators ของ `quantity`:** `required`, `min(1)`, `pattern(/^\d+$/)` และในโหมด OUT มี validator `maxStock` ที่เทียบกับ `currentQuantity` ของบรรทัด โดยต้องเรียก `updateValueAndValidity()` ทุกบรรทัดเมื่อสลับ IN/OUT
- ถ้าเกินยอด แสดง `<mat-error>` สีแดง และปุ่ม "ยืนยันรายการ" ใช้ `[disabled]="form.invalid || saving()"`
- ช่อง `unitPrice` แสดงเฉพาะโหมด IN และไม่บังคับกรอก
- **สำเร็จ:** snackbar "บันทึกรายการสำเร็จ (TXN-...)" แล้ว reset ฟอร์ม
- **ได้ `INSUFFICIENT_STOCK` จาก server** (ยอดเปลี่ยนระหว่างกรอก): แสดง message จาก server และโหลดยอดของวัสดุในฟอร์มใหม่

### 8.5 Material List

- `mat-table` + `mat-paginator` + `mat-sort` แบบ server-side โดย map `page`, `limit`, `sortBy`, `sortOrder` ไปที่ query string
- ช่องค้นหา debounce 300ms, dropdown หมวดหมู่ และ checkbox "เฉพาะสต็อกต่ำ" (`lowStock=true`)
- เก็บ filter และหน้าปัจจุบันไว้ใน query params ของ URL เพื่อให้กดย้อนกลับหรือแชร์ลิงก์แล้วได้หน้าเดิม
- `status-badge`: สีแดง "เตือนสต็อกต่ำ" เมื่อ `currentQuantity <= minStock` นอกนั้นเป็นสีเขียว
- ปุ่ม "เพิ่ม" แสดงเฉพาะ ADMIN และ STAFF ส่วนปุ่ม "แก้ไข" แสดงเฉพาะ ADMIN

### 8.6 Dashboard UI

| Widget | ข้อมูลจาก | รายละเอียด |
|---|---|---|
| KPI cards ×5 | `/dashboard/summary` | การ์ด "ต้องสั่งซื้อ" และ "หมดสต็อก" เป็นสีแดงเมื่อมากกว่า 0 |
| ตาราง "ควรสั่งซื้อ" | `/dashboard/reorder-suggestions` | ไฮไลต์หมดสต็อกเป็นสีแดง และ `daysLeft <= 7` เป็นสีส้ม |
| อันดับเบิกมากที่สุด | `/dashboard/top-withdrawn` | แท่งแนวนอน CSS Top 10, ตัวเลือก 30/90/365 วัน, สลับจำนวน/ครั้งได้ |
| วัสดุไม่เคยเบิก | `/dashboard/unused` | ตัวเลือก "ไม่เคยเลย / 90 / 180 วัน" แสดงยอดค้างและวันที่เบิกล่าสุด |

### 8.7 Decimal และวันที่

- `unitPrice` มาจาก API เป็น **string** เพราะ Prisma Decimal ดังนั้นใน model ต้องกำหนดเป็น `string | null` และแสดงผลด้วย `DecimalPipe` หลังแปลงเป็นตัวเลข
- แสดงวันที่ด้วย `DatePipe` โดยตั้ง timezone เป็น `Asia/Bangkok` และ locale `th` ผ่าน `DATE_PIPE_DEFAULT_OPTIONS` และ `LOCALE_ID`

---

## 9. Infrastructure

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    container_name: inventory_db
    restart: unless-stopped
    env_file: .env
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

`.env.example` (commit ไฟล์นี้ได้ แต่ห้าม commit `.env`):

```dotenv
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change-me
POSTGRES_DB=inventory_db
DATABASE_URL=postgresql://postgres:change-me@localhost:5432/inventory_db
JWT_SECRET=change-me-to-a-long-random-string
JWT_EXPIRES_IN=8h
PORT=3000
NODE_ENV=development
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=change-me
```

---

## 10. การตัดสินใจ

| # | เรื่อง | ผล / ข้อเสนอ | สถานะ |
|---|---|---|---|
| D1 | Frontend framework | Angular + TypeScript | ✅ ตัดสินใจแล้ว |
| D2 | ที่เก็บ token | HttpOnly cookie + ให้ front-end และ API อยู่ origin เดียว | ✅ ตัดสินใจแล้ว |
| D7 | Back-end | Node.js + TypeScript + Express 5 + Prisma | ✅ ตัดสินใจแล้ว |
| D3 | STAFF เห็น Dashboard ได้ไหม | ได้ | ✅ ตัดสินใจแล้ว |
| D4 | ค่าคงที่ในการแนะนำการสั่งซื้อ | 90 / 14 / 30 วัน | ✅ ตัดสินใจแล้ว |
| D5 | จำนวนเป็นจำนวนเต็มเสมอไหม | จำนวนเต็มเสมอ (`Int`) | ✅ ตัดสินใจแล้ว |
| D6 | แก้ `code` วัสดุหลังสร้างแล้วได้ไหม | ได้ (ADMIN) ถ้าไม่ซ้ำ | ✅ ตัดสินใจแล้ว |

ยังไม่ได้ตัดสินใจ: S1 email ของ Admin คนแรกและหมวดหมู่ตั้งต้น (ต้องใช้ใน Part 2)

*Document Version: 2.1.0 | 2026-09-28*
