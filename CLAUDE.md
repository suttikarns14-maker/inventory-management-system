# CLAUDE.md

ระบบฐานข้อมูลคลังวัสดุ (Inventory Management System): เว็บสำหรับจัดการข้อมูลวัสดุ บันทึกรับเข้า/เบิกจ่าย และแจ้งเตือนสต็อกต่ำ

**สเปกหลัก: [docs/implementation-spec-v2.1.md](docs/implementation-spec-v2.1.md)** (ใช้แทน v2.0.0 และปรับตาม User Stories แล้ว) ผลการตรวจสเปกเดิมอยู่ที่ [docs/spec-review.md](docs/spec-review.md) ถ้าสเปกกับไฟล์นี้ขัดกัน ให้ถามผู้ใช้ก่อน

## Status

ความคืบหน้าและเรื่องที่รอยืนยันอยู่ที่ [docs/status.md](docs/status.md) ทำงานข้อไหนเสร็จแล้วให้อัปเดตไฟล์นั้นด้วย

ยังไม่มีโค้ด `backend/` มีแค่โครงโฟลเดอร์ (`.gitkeep`) ส่วน `frontend/` จะสร้างด้วย Angular CLI ใน Part 1 ตามโครงในสเปก §8.1 เมื่อมี `package.json` แล้วให้อัปเดตส่วน **Commands**

## Architecture

Decoupled front-end / back-end คุยกันผ่าน REST (JSON) ที่ `/api/v1`

```
frontend/   Angular + TypeScript, standalone components, Signals, Reactive Forms, Angular Material
backend/    Node.js 24 + TypeScript, Express 5, Prisma, Zod, JWT (HttpOnly cookie), bcryptjs
            PostgreSQL 16 รันผ่าน Docker (docker-compose)
docs/       spec v2.1 และ spec review
```

### Auth
- JWT อยู่ใน **HttpOnly cookie** และ front-end ไม่ต้องแตะ token
- front-end และ API ต้องอยู่ **origin เดียวกัน**: ตอนพัฒนาใช้ Angular `proxy.conf.json` ส่ง `/api` ไป `localhost:3000` ส่วนบน server ใช้ reverse proxy จึง**ไม่ต้องตั้ง CORS**

### Frontend (`frontend/src/app/`)
- `core/auth`: `AuthService` (เก็บ `user` เป็น signal และโหลดจาก `/auth/me` ตอนเปิดแอปผ่าน `provideAppInitializer`), `authGuard` (ตรวจ `route.data.roles`) และ `authInterceptor` (redirect ไป `/login` เมื่อได้ 401) ส่วน `core/layout` เก็บ shell
- `shared/`: components, models และ utils ที่ใช้มากกว่า 1 feature
- `features/<name>/`: component และ service ของแต่ละ feature (auth, dashboard, materials, inventory, settings, errors)
- ทุกหน้าใช้ `loadComponent` (lazy load), `OnPush` และ control flow แบบใหม่ (`@if`, `@for`)
- ไม่มี global cache: แต่ละหน้าโหลดข้อมูลใหม่ตอนเปิด **ห้ามเพิ่ม TanStack Query, NgRx หรือ chart library** ถ้าไม่ได้คุยกันก่อน
- Forms ใช้ Reactive Forms ส่วน error จาก server ประเภท `VALIDATION_ERROR` ให้ map `details` ไปที่ control ด้วย `setErrors({ server })`

### Backend (`backend/src/`)
Layered architecture: `routes → middlewares → controllers → services → Prisma`
- controllers รับ request และ map response เท่านั้น ไม่มี business logic
- services เก็บ business logic และ DB transaction ทั้งหมด
- `dtos/` ใช้ Zod schema ตรวจ input ผ่าน `validate.middleware.ts`
- error ให้ throw `AppError(status, code, message)` (`utils/app-error.ts`) แล้วให้ `error.middleware.ts` แปลงเป็น response (รายการ code อยู่ในสเปก §4.2)
- Prisma schema อยู่ที่ `backend/prisma/schema.prisma`

## Domain model

`User` (role: ADMIN | STAFF | USER, `isActive`), `Category`, `Material` (code unique, `currentQuantity`, `minStock`, `location`, `status` enum ACTIVE/INACTIVE), `StockTransaction` (type IN/OUT, `referenceNo` unique เช่น `TXN-20260927-001`, `reversalOfId` ใช้ยกเลิกรายการ), `StockTransactionItem` (quantity, `unitPrice` Decimal(10,2) ใช้เฉพาะ IN), `ReferenceCounter` (ตัวนับเลขอ้างอิงรายวัน) ดู schema เต็มในสเปก §3

## Roles

| | ADMIN | STAFF | USER |
|---|:-:|:-:|:-:|
| ดูวัสดุ | ✅ | ✅ | ✅ |
| เพิ่มวัสดุ | ✅ | ✅ | ❌ |
| แก้ไขวัสดุ / หมวดหมู่ / ผู้ใช้ | ✅ | ❌ | ❌ |
| รับเข้า (IN) | ✅ | ✅ | ❌ |
| เบิกจ่าย (OUT) | ✅ | ✅ | ✅ |
| ยกเลิกรายการ | ✅ | ❌ | ❌ |
| ดูประวัติ | ทั้งหมด | ทั้งหมด | ของตัวเอง |
| Dashboard | ✅ | ✅ | ❌ |

DB ใช้ snake_case (`@map`) ส่วนโค้ดใช้ camelCase

## API conventions

- Success: `{ "success": true, "data": ..., "meta": { page, limit, total, totalPages } }` (`meta` มีเฉพาะ endpoint ที่แบ่งหน้า)
- Error: `{ "success": false, "error": { "code": "INSUFFICIENT_STOCK", "message": "..." } }`
- `code` เป็น UPPER_SNAKE สำหรับให้โปรแกรมอ่าน ส่วน `message` ใช้แสดงผู้ใช้ (ภาษาไทยได้)

- สร้างข้อมูลสำเร็จตอบ `201` ส่วน `limit` ค่าเริ่มต้น 20 สูงสุด 100
- ตาราง endpoint ทั้งหมดอยู่ในสเปก §4.3 (auth, users, categories, materials, inventory รวม reverse, dashboard 4 ตัว)
- สต็อกต่ำเป็น filter `GET /materials?lowStock=true` ไม่มี endpoint `/materials/low-stock` แล้ว

## Business rules (ห้ามละเมิด)

- **ทำรายการสต็อกต้องทำครบในครั้งเดียว:** header, items และการปรับ `currentQuantity` ต้องอยู่ใน `prisma.$transaction` เดียวกัน ถ้าพลาดต้อง rollback ทั้งหมด
- **สต็อกห้ามติดลบ:** รายการ OUT ที่เกินยอดคงเหลือต้องถูกปฏิเสธด้วย 400 `INSUFFICIENT_STOCK` ต้องตรวจที่ back-end เสมอ การตรวจฝั่ง front-end มีไว้เพื่อ UX เท่านั้น
- **สต็อกต่ำ** คือ `currentQuantity <= minStock` ใช้เงื่อนไขนี้ทั้ง badge สีแดง, filter `lowStock=true` และ dashboard
- ห้ามแก้ `currentQuantity` ตรงๆ ผ่าน `PUT /materials/:id` ยอดต้องเปลี่ยนผ่าน transaction เท่านั้นเพื่อให้มีประวัติ
- **OUT ต้องหักแบบมีเงื่อนไข** (`updateMany where currentQuantity >= qty` แล้วเช็ก `count`) ห้ามอ่านยอดก่อนแล้วค่อย `increment` เพราะเกิด race condition ได้ และ DB มี `CHECK (current_quantity >= 0)` เป็นด่านสุดท้าย
- `quantity` ต้องเป็นจำนวนเต็มบวก และห้ามมีวัสดุซ้ำในรายการเดียว
- **ห้ามลบหรือแก้รายการรับ-จ่ายเดิม** ให้แก้ด้วยรายการกลับ (reversal) โดย ADMIN เท่านั้น
- วัสดุ `INACTIVE` ทำรายการไม่ได้ และไม่นับใน dashboard ส่วน dashboard ไม่นับรายการที่ถูกยกเลิกแล้ว
- ผู้ใช้ห้ามลบ ใช้ `isActive = false` แทน

## Pending decisions (ต้องถามผู้ใช้ก่อนเขียนส่วนที่เกี่ยวข้อง)

ดูสเปก §10: เหลือแค่ S1 (Admin คนแรกและหมวดหมู่ตั้งต้น ใช้ใน Part 2) · จำนวนเป็นจำนวนเต็มเสมอ (D5) · ADMIN แก้ `code` วัสดุได้ถ้าไม่ซ้ำ (D6)

**ลำดับงาน:** Part 1 = Angular FE ที่รันด้วย mock API (interceptor ตอบตามสเปก §4.3 ห้ามคิดรูปแบบ API ขึ้นเอง) ส่วน Part 2 = BE จริงแล้วปิด mock รายละเอียดอยู่ใน `docs/status.md`

Secrets อยู่ใน `.env` เท่านั้น ห้าม commit `.env` ให้ commit แค่ `.env.example`

## Conventions

- TypeScript strict ทั้งสองฝั่ง ห้ามใช้ `any` ถ้าไม่จำเป็นจริงๆ
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย ส่วนโค้ด ชื่อตัวแปร และ commit message เป็นภาษาอังกฤษ
- Branch: `feat/...`, `fix/...`, `chore/...` และห้าม commit ตรงไปที่ `main`

## Commands

_ยังไม่มี: เพิ่มเมื่อ scaffold `frontend/` และ `backend/` แล้ว (dev, build, test, lint, prisma migrate/seed, docker compose up)_
