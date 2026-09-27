# Spec Review: ระบบฐานข้อมูลคลังวัสดุ

> **สถานะ:** ข้อที่ตัดสินใจแล้วถูกแก้ไว้ใน [implementation-spec-v2.1.md](implementation-spec-v2.1.md) ส่วนข้อที่ยังรอการตัดสินใจอยู่ใน §10 ของไฟล์นั้น

**เอกสารที่ตรวจ:**
- `srs_document.html`: Software Requirement Specification (SRS)
- `full_stack_implementation_design_specification.md`: Design Spec v2.0.0

**วันที่ตรวจ:** 2026-09-28

ระดับความสำคัญ:
- 🔴 **Critical:** ต้องแก้ก่อนเขียนโค้ด เพราะทำให้ข้อมูลผิดหรือมีช่องโหว่
- 🟠 **Major:** เอกสารขัดกันหรือขาดข้อมูลที่ใช้ตัดสินใจออกแบบ
- 🟡 **Minor:** ควรปรับให้ถูกต้องหรือตรงกับเวอร์ชันปัจจุบัน

---

## สรุปภาพรวม

โครงสร้างโดยรวมใช้ได้ดี ทั้งการแยก layer, การใช้ DB transaction และรูปแบบ response ที่เป็นมาตรฐาน แต่มี **ปัญหาความถูกต้องของยอดสต็อก 4 จุด** ซึ่งเป็นหัวใจของระบบ ต้องแก้ก่อนเริ่ม นอกจากนี้ทั้งสองเอกสาร**ขัดกันเองหลายจุด** และ**ขาด endpoint ที่หน้าเว็บต้องใช้** (users, categories และการแก้รายการที่บันทึกผิด)

| ระดับ | จำนวน |
|---|---|
| 🔴 Critical | 7 |
| 🟠 Major | 12 |
| 🟡 Minor | 9 |

---

## 🔴 Critical

### C1. Race condition ตอนเบิกจ่ายทำให้สต็อกติดลบได้
- **ที่มา:** Design Spec §2.4 `TransactionService.createTransaction`
- **ปัญหา:** โค้ดอ่านยอดด้วย `findUnique` ตรวจ แล้วค่อย `increment` ภายหลัง PostgreSQL ใช้ isolation ระดับ READ COMMITTED เป็นค่าเริ่มต้น ถ้ามีคำขอ 2 รายการเข้ามาพร้อมกัน ทั้งคู่จะเห็นยอดเดิมและผ่านการตรวจ ผลคือยอดติดลบ
- **แก้:** ตรวจและหักในคำสั่งเดียว แล้วเช็กจำนวนแถวที่ถูกอัปเดต
  ```ts
  const { count } = await tx.material.updateMany({
    where: { id: item.materialId, currentQuantity: { gte: item.quantity } },
    data: { currentQuantity: { decrement: item.quantity } },
  });
  if (count === 0) throw new AppError(400, 'INSUFFICIENT_STOCK', '...');
  ```
  และเพิ่ม DB constraint `CHECK (current_quantity >= 0)` (ผ่าน migration SQL) เป็นด่านสุดท้าย

### C2. จำนวนติดลบหรือเป็นศูนย์ใช้เลี่ยงกฎได้
- **ที่มา:** Design Spec §2.4 และ SRS Story 2.1 ไม่ได้กำหนด validation ของ `quantity`
- **ปัญหา:** ถ้าส่ง `quantity: -50` ในรายการ OUT ยอดจะ**เพิ่ม**ขึ้น 50 และผ่านการตรวจ `currentQuantity < quantity` ได้ทุกครั้ง
- **แก้:** ใน Zod DTO กำหนด `quantity: z.number().int().positive()` และเพิ่ม `CHECK (quantity > 0)` ในตาราง `stock_transaction_items`

### C3. วัสดุเดียวกันซ้ำหลายบรรทัดในรายการเดียวผ่านการตรวจได้
- **ที่มา:** Design Spec §2.4 ขั้นตอนที่ 1
- **ปัญหา:** โค้ดตรวจแต่ละบรรทัดกับยอดเดิม ถ้ามียอด 10 แล้วใส่วัสดุเดียวกัน 2 บรรทัด บรรทัดละ 6 ทั้งสองบรรทัดจะผ่าน
- **แก้:** ให้ DTO ปฏิเสธ `materialId` ที่ซ้ำกัน หรือรวมจำนวนก่อน ถ้าใช้วิธีตามข้อ C1 ปัญหานี้จะหายไปเองด้วย

### C4. การสร้าง `referenceNo` ชนกันได้เมื่อมีหลายคำขอพร้อมกัน
- **ที่มา:** Design Spec §2.2 (`TXN-20260927-001`) และ `generateReferenceNo()` ใน §2.4
- **ปัญหา:** ถ้าเลขรันอ่านจาก "เลขล่าสุด + 1" สองคำขอจะได้เลขเดียวกันและชน unique constraint ยังไม่ได้กำหนดด้วยว่าวันที่ใช้ timezone ไหน (UTC หรือ Asia/Bangkok)
- **แก้:** ใช้ PostgreSQL sequence หรือตาราง counter รายวันที่ใช้ `UPDATE ... RETURNING` และกำหนดให้ใช้วันที่ตามเวลา Asia/Bangkok

### C5. ไม่ได้กำหนดวิธีเก็บรหัสผ่านและนโยบาย JWT
- **ที่มา:** Design Spec §1.2 และ §2.2 (`User.password String`)
- **ปัญหา:** ไม่ระบุการ hash รหัสผ่าน, JWT secret, อายุ token, refresh token และการจำกัดจำนวนครั้งที่ login ผิด
- **แก้:** ใช้ bcrypt หรือ argon2, เก็บ `JWT_SECRET` ใน `.env`, กำหนดอายุ access token (เช่น 15 นาที ถึง 1 ชั่วโมง) และตัดสินใจเรื่อง refresh token ถ้ายังไม่ทำ refresh token ผู้ใช้จะถูก logout กลางคันตามอายุ token, เพิ่ม rate limit ที่ `/auth/login`

### C6. ที่เก็บ token ยังไม่ได้เลือก
- **ที่มา:** Design Spec §1.2 ข้อ 1 ("`localStorage` หรือ `HttpOnly Cookie`")
- **ปัญหา:** สองวิธีนี้ทำให้โค้ดต่างกันมาก ถ้าใช้ cookie จะไม่มี header `Authorization` แต่ต้องทำ CORS แบบ credentials และป้องกัน CSRF ส่วน `localStorage` เสี่ยงกับ XSS
- **แก้:** แนะนำ **HttpOnly + Secure + SameSite cookie** แล้วปรับ interceptor ในสเปกให้ตรงกัน

### C7. รหัสผ่าน DB อยู่ใน `docker-compose.yml`
- **ที่มา:** Design Spec §2.5
- **แก้:** ย้ายไปใช้ `${POSTGRES_PASSWORD}` จากไฟล์ `.env`, เพิ่ม `.env` ใน `.gitignore` และ commit แค่ `.env.example`

---

## 🟠 Major: เอกสารขัดกัน

### M1. Frontend framework ไม่ชัดเจน
- Design Spec §1.1 เขียน "React / Next.js / Vite" โครงโฟลเดอร์ `app/(auth)`, `[id]/edit` เป็นแบบ **Next.js App Router** แต่ `ProtectedRoute` ใน §1.2 ใช้ `<Navigate>` ของ **react-router** (Vite)
- **ต้องเลือก 1 อย่าง:**
  - ถ้าเลือก Next.js ให้ใช้ `middleware.ts` หรือ `redirect()` แทน `<Navigate>`
  - ถ้าเลือก Vite ให้เปลี่ยนโครงโฟลเดอร์เป็น `pages/` + router config
- **ข้อแนะนำ:** ระบบนี้เป็น dashboard ภายในที่มี back-end แยกอยู่แล้ว **Vite + React Router** เรียบง่ายกว่า เพราะไม่ต้องใช้ SSR

### M2. สิทธิ์แก้ไขวัสดุไม่ตรงกัน
- SRS Story 1.1: "**เจ้าหน้าที่คลัง**...สามารถเพิ่ม **แก้ไข**..."
- Design Spec §2.3 และ Sitemap: `PUT /materials/:id` และ `/materials/:id/edit` ให้ **Admin เท่านั้น**
- **ต้องยืนยัน:** Staff แก้ไขข้อมูลวัสดุได้หรือไม่

### M3. Path หน้ารายการวัสดุไม่ตรงกัน
- SRS Sitemap ใช้ `/materials/list` ส่วน SRS Story 1.1 และ Design Spec ใช้ `/materials`
- **แก้:** ใช้ `/materials` อย่างเดียว

### M4. Error code ในโค้ดไม่ตรงกับรูปแบบ response
- Design Spec §2.3 กำหนดให้ error มี `code: "INSUFFICIENT_STOCK"` แต่ §2.4 เรียก `new AppError(400, message)` โดยไม่มี code และข้อความเป็นภาษาอังกฤษ ขณะที่ตัวอย่าง response เป็นภาษาไทย
- **แก้:** ให้ `AppError(status, code, message)` รับ code ด้วย และกำหนดรายการ error code ทั้งหมดไว้ที่เดียว เช่น `VALIDATION_ERROR`, `NOT_FOUND`, `DUPLICATE_CODE`, `INSUFFICIENT_STOCK`, `UNAUTHORIZED`, `FORBIDDEN`

---

## 🟠 Major: ข้อมูลที่ขาด

### M5. ยังไม่มี endpoint ที่หน้าเว็บต้องใช้
| ใช้ที่ | Endpoint ที่ต้องเพิ่ม |
|---|---|
| `/settings/users` | `GET/POST/PUT /users`, ปิดการใช้งานผู้ใช้, reset password |
| Dropdown หมวดหมู่ใน `/materials` | `GET /categories` (และ CRUD ถ้าต้องการให้ Admin จัดการ) |
| ปุ่ม Logout | `POST /auth/logout` (จำเป็นถ้าใช้ cookie) |
| ผู้ใช้คนแรก | seed script สำหรับสร้าง Admin คนแรก เพราะยังไม่มีหน้าสมัครสมาชิก |

### M6. แก้รายการที่บันทึกผิดไม่ได้
- ไม่มีวิธียกเลิกหรือแก้ไขรายการรับเข้า/เบิกจ่ายที่บันทึกผิด
- **แนะนำ:** ห้ามลบหรือแก้รายการเดิม (เพื่อเก็บ audit trail) ให้สร้าง**รายการกลับ (reversal)** ที่อ้างถึงรายการเดิม หรือเพิ่ม type `ADJUST` สำหรับการตรวจนับสต็อก

### M7. วิธีคิด "มูลค่าคลังรวม" บน Dashboard
- SRS Epic 3 ต้องแสดงมูลค่ารวม แต่ `Material` ไม่มีราคา มีแค่ `unitPrice` (optional) ใน `StockTransactionItem`
- **ต้องเลือก:**
  - (ก) เพิ่มฟิลด์ `Material.unitCost` ซึ่งง่ายที่สุด
  - (ข) ใช้ราคารับเข้าล่าสุด
  - (ค) ใช้ต้นทุนเฉลี่ยถ่วงน้ำหนัก
  - (ง) ใช้ FIFO ซึ่งซับซ้อนที่สุด
- ควรกำหนดด้วยว่า `unitPrice` **บังคับกรอก**สำหรับรายการ IN และ**ไม่ใช้**กับรายการ OUT

### M8. สิทธิ์ของ role `USER` ยังไม่ได้กำหนด
- Schema มี 3 role แต่ API ใช้แค่ "Protected" กับ "Admin, Staff" ถ้าไม่กำหนด USER จะเบิกจ่าย (`POST /inventory/transactions`) ได้
- **แก้:** ทำตารางสิทธิ์ role × action ให้ครบ และตั้ง default role เป็นสิทธิ์ต่ำสุด (`USER`) แทน `STAFF`

### M9. วัสดุที่ `INACTIVE` ยังทำรายการได้หรือไม่
- ไม่ได้กำหนดว่าจะรับเข้าหรือเบิกวัสดุที่ปิดใช้งานได้ไหม และจะแสดงใน low-stock หรือ dashboard หรือไม่
- **แนะนำ:** ห้ามทำรายการกับวัสดุ INACTIVE และไม่นับใน low-stock กับ KPI

### M10. Query params ของประวัติและรายการวัสดุยังไม่ครบ
- `GET /inventory/history` ไม่ได้ระบุ filter ควรมีช่วงวันที่, `type`, `materialId`, `createdById` และ pagination
- `GET /materials`: UI ต้อง sort ได้ (Design Spec §1.3.1) แต่ API ไม่มี `sortBy`/`sortOrder` ควรกำหนด whitelist ของ field ที่ sort ได้
- `search` ไม่ได้ระบุว่าค้นจาก field ไหน แนะนำ `code` + `name` แบบไม่สนตัวพิมพ์เล็กใหญ่
- ควรกำหนดค่า `limit` สูงสุด (เช่น 100) เพื่อไม่ให้ดึงข้อมูลทั้งตารางในครั้งเดียว

### M11. Validation ของข้อมูลวัสดุฝั่ง back-end
- SRS กำหนด validation แค่ฝั่ง front-end (รหัสห้ามว่าง, `minStock >= 0`)
- **เพิ่ม:** `name` กับ `unit` ห้ามว่าง, `categoryId` ต้องมีอยู่จริง, ห้ามส่ง `currentQuantity` ใน create/update (ยอดเริ่มต้นให้ทำผ่านรายการ IN) และกำหนดรูปแบบของ `code`

### M12. ไม่ได้กำหนด CORS
- ระบบแยก front-end กับ back-end คนละ origin แต่สเปกไม่ได้พูดถึง CORS ต้องกำหนด allowed origin ผ่าน `.env` (และ `credentials: true` ถ้าใช้ cookie ตามข้อ C6)

---

## 🟡 Minor

| # | ที่มา | ปัญหา | แก้ |
|---|---|---|---|
| m1 | Design Spec §1.4 | `keepPreviousData: true` ถูกลบออกใน TanStack Query v5 | `placeholderData: keepPreviousData` |
| m2 | Design Spec §1.4 | `onError: (error: any)` ขัดกับหลัก type-safe | ใช้ `AxiosError<ApiErrorResponse>` |
| m3 | Design Spec §2.2 | `Material.status` เป็น `String` ขณะที่ Role/TransactionType เป็น enum | สร้าง `enum MaterialStatus { ACTIVE INACTIVE }` |
| m4 | Design Spec §2.2 | `@@index([code])` ซ้ำ เพราะ `@unique` สร้าง index ให้แล้ว | ลบออก |
| m5 | Design Spec §2.3 | Low-stock เป็นการเทียบสอง column ซึ่ง `where` ปกติของ Prisma ทำไม่ได้ | ใช้ field reference `prisma.material.fields.minStock` หรือ raw SQL |
| m6 | SRS §4.1 | สร้างรายการสำเร็จแล้วตอบ `200 OK` | ใช้ `201 Created` |
| m7 | Design Spec §2.5 | Key `version: '3.8'` ถูกยกเลิกแล้วใน Docker Compose v2 และทำให้มี warning | ลบออก |
| m8 | Design Spec §2.2 | Prisma แปลง `Decimal` เป็น **string** ใน JSON | กำหนด type ฝั่ง front-end ให้ตรง และใช้ `utils/currency.ts` แปลงค่า |
| m9 | Design Spec §1.3.2 | การเช็กสต็อกฝั่ง front-end ใช้ข้อมูลที่ cache ไว้ถึง 5 นาที ยอดอาจเก่า | refetch ยอดของวัสดุตอนเลือกเข้าฟอร์ม (back-end ยังเป็นตัวตัดสินสุดท้ายอยู่แล้ว) |

---

## คำถามที่ต้องตัดสินใจ (เรียงตามลำดับที่ต้องใช้)

1. **Frontend:** Next.js หรือ Vite + React Router (M1)
2. **ที่เก็บ token:** HttpOnly cookie หรือ localStorage (C6)
3. **สิทธิ์ของแต่ละ role:** Staff แก้ไขวัสดุได้ไหม และ USER ทำอะไรได้บ้าง (M2, M8)
4. **มูลค่าคลัง:** ใช้วิธีไหนจากตัวเลือก ก, ข, ค, ง (M7)
5. **การแก้รายการผิด:** ใช้ reversal หรือ ADJUST (M6)
6. **หน่วยนับ:** จำนวนเป็นจำนวนเต็มเสมอไหม ถ้ามีวัสดุที่นับเป็นเมตรหรือกิโลกรัมจะต้องเปลี่ยน `Int` เป็น `Decimal`

เมื่อได้คำตอบแล้ว ควรอัปเดต Design Spec เป็น v2.1 และส่วน *Known gaps* ใน `CLAUDE.md`
