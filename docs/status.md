# Project Status: ระบบฐานข้อมูลคลังวัสดุ

**อัปเดตล่าสุด:** 2026-09-27 · **ขั้นปัจจุบัน:** Part 2 เสร็จแล้ว (branch `feat/backend`) ระบบ FE + BE + DB ใช้งานได้บนเครื่อง

สัญลักษณ์: ✅ เสร็จ · 🔄 กำลังทำ · ⏳ รอยืนยัน · ⬜ ยังไม่เริ่ม

---

## 1. รอการยืนยัน

| # | เรื่อง | ข้อเสนอตอนนี้ | กระทบ | ต้องตอบก่อน |
|---|---|---|---|---|
| — | ไม่มีเรื่องที่รอยืนยัน | | | |

รายละเอียดอยู่ใน [implementation-spec-v2.1.md §10](implementation-spec-v2.1.md)

---

## 2. การตัดสินใจที่ยืนยันแล้ว

| # | เรื่อง | ผล |
|---|---|---|
| D1 | Frontend | Angular + TypeScript, Signals, Reactive Forms, Angular Material |
| D2 | ที่เก็บ token | HttpOnly cookie + ให้ front-end และ API อยู่ origin เดียวผ่าน proxy |
| D3 | STAFF เห็น Dashboard | ได้ |
| D4 | ค่าคงที่ในการแนะนำการสั่งซื้อ | ใช้ข้อมูลย้อนหลัง 90 วัน · เตือนเมื่อจะหมดใน 14 วัน · สั่งให้พอใช้ 30 วัน |
| D5 | จำนวนวัสดุ | จำนวนเต็มเสมอ |
| D6 | แก้รหัสวัสดุหลังสร้างแล้ว | ได้ (ADMIN) ถ้าไม่ซ้ำ เพื่อความยืดหยุ่น |
| D8 | Login | ใช้ username ข้อความธรรมดา (เช่น `Admin`) ไม่ใช้ email · ตัวพิมพ์เล็กใหญ่ไม่มีผล |
| S2 | หมวดหมู่ตั้งต้น | 5 หมวดเดียวกับข้อมูลจำลอง |
| S1 | Admin คนแรก | username `Admin` · รหัสผ่านใส่ใน `backend/.env` (ไม่ขึ้น Git) |
| D7 | Back-end | Node.js 24 + TypeScript + Express 5 + Prisma + Zod · PostgreSQL 16 บน Docker |
| — | สิทธิ์ของแต่ละ role | ADMIN ทำได้ทุกอย่าง · STAFF รับเข้า เบิกจ่าย และเพิ่มวัสดุ · USER เบิกได้อย่างเดียว |
| — | Dashboard | ควรสั่งซื้อ / เบิกมากที่สุด / ไม่เคยเบิก (ไม่มีมูลค่าคลัง) |
| — | ลำดับงาน | Part 1 = FE + mock API บนเครื่อง · Part 2 = BE จริง + ต่อระบบ |
| — | UI | ให้ผู้พัฒนาเลือกตามความเหมาะสม: Angular Material, ฟอนต์ Kanit |

---

## 3. Roadmap

### Setup ✅
- [x] ตรวจสเปกเดิม ([spec-review.md](spec-review.md)) และเขียน [implementation-spec-v2.1.md](implementation-spec-v2.1.md)
- [x] ตัดสินใจ stack, สิทธิ์ และ Dashboard
- [x] CLAUDE.md, README.md, .gitignore, โครง `backend/`
- [x] Commit + push branch `chore/project-setup`

### Part 1: Front-end + Mock API ✅ (branch `feat/frontend-mock`)
- [x] โปรเจกต์ Angular 22 (standalone, zoneless) + Angular Material + ฟอนต์ Kanit ใน `frontend/`
- [x] Models (API contract) ใน `shared/models/` และ mock API ครบทุก endpoint ในสเปก §4.3 พร้อมข้อมูลตัวอย่าง 6 เดือน (30 วัสดุ, 5 หมวด, 5 ผู้ใช้) เก็บใน localStorage
- [x] `AuthService`, `authGuard`, `authInterceptor` และ layout ที่แสดงเมนูตาม role
- [x] หน้า Login (บัญชีทดสอบ 3 role) และหน้า 403
- [x] หน้ารายการวัสดุ: ค้นหา, กรอง, สต็อกต่ำ, sort, แบ่งหน้า (สถานะเก็บใน URL)
- [x] ฟอร์มเพิ่ม/แก้ไขวัสดุ (แก้รหัสได้ตาม D6 และห้ามแก้ยอดคงเหลือ)
- [x] ฟอร์มรับเข้า/เบิกจ่ายหลายรายการ, เตือนเกินยอดทันที และ USER เห็นเฉพาะโหมดเบิก
- [x] หน้าประวัติ (USER เห็นเฉพาะของตัวเอง) + ยกเลิกรายการ (ADMIN)
- [x] Dashboard: KPI 5 ตัว, ควรสั่งซื้อ, เบิกมากที่สุด, ไม่ถูกเบิกใช้
- [x] หน้าตั้งค่าผู้ใช้และหมวดหมู่ (ADMIN)
- [x] Unit test ของ mock API 10 ข้อ + ทดสอบใน browser ครบ 3 role และหน้าจอมือถือ 43 ข้อ ผ่านทั้งหมด

- [x] เปลี่ยน login จาก email เป็น username (D8) · test 12 ข้อ + browser 43 ข้อ ผ่าน

**ยังไม่ได้ทำ (ตั้งใจ):** ปรับหน้าตา UI ละเอียด ทำทีหลังตามที่ตกลงไว้ · ตารางบนมือถือยังค่อนข้างแน่น

### Part 2: Back-end + ต่อระบบ ✅ (branch `feat/backend`)
- [x] 1. Database: `backend/docker-compose.yml` (PostgreSQL 16 + DB แยกสำหรับ test), `.env.example`, Prisma 7 schema + migration (`timestamptz`, `CHECK` 3 ตัว, unique `lower(username)`), seed Admin + 5 หมวดหมู่
- [x] 2. โครง BE: Express 5, error envelope ตามสเปก §4.2, Zod 4 (ข้อความไทย), helmet, JSON-only
- [x] 3. Auth + ผู้ใช้: login ด้วย username (ไม่สนตัวพิมพ์เล็กใหญ่), JWT ใน HttpOnly cookie, rate limit 5 ครั้ง/15 นาที, role guard, API จัดการผู้ใช้
- [x] 4. วัสดุ + หมวดหมู่: ค้นหา, กรอง, สต็อกต่ำ (field reference), sort, แบ่งหน้า, กันรหัส/ชื่อซ้ำ
- [x] 5. รับเข้า/เบิกจ่าย: หักสต็อกแบบมีเงื่อนไขใน DB transaction, เลขอ้างอิงรายวัน, ยกเลิกรายการ, ประวัติ
- [x] 6. Dashboard: สรุป KPI, ควรสั่งซื้อ, เบิกมากที่สุด, ไม่ถูกเบิกใช้ (ไม่นับรายการที่ยกเลิก)
- [x] 7. ต่อ FE กับ BE จริง (`USE_MOCK_API = false`)
- [x] Test BE 27 ข้อกับ PostgreSQL จริง (รวมเบิกพร้อมกัน 12 คำขอ และยกเลิกพร้อมกัน) + browser 44 ข้อกับ BE จริงครบ 3 role ผ่านทั้งหมด

**ข้อสังเกต:** `@prisma/adapter-pg` 7.10 พิมพ์ DeprecationWarning ของ pg ตอนรัน transaction เป็นปัญหาภายในไลบรารี ไม่กระทบการทำงาน รออัปเดตจาก Prisma

### ส่งมอบ ⬜
- [ ] วิธีติดตั้งและรันใน README
- [ ] เตรียมย้ายขึ้น server (reverse proxy, `Secure` cookie, backup DB)

---

## 4. ข้อสังเกต

- Part 1 ไม่ต้องใช้ Docker ส่วน Part 2 ต้องเปิด Docker Desktop ก่อน
- เอกสารต้นฉบับ (SRS และ Design Spec v2.0.0) ไม่ได้เก็บไว้ในโปรเจกต์ ใช้ spec v2.1 เป็นสเปกหลัก
