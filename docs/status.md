# Project Status: ระบบฐานข้อมูลคลังวัสดุ

**อัปเดตล่าสุด:** 2026-09-27 · **ขั้นปัจจุบัน:** Part 1 เสร็จแล้ว รอเริ่ม Part 2

สัญลักษณ์: ✅ เสร็จ · 🔄 กำลังทำ · ⏳ รอยืนยัน · ⬜ ยังไม่เริ่ม

---

## 1. รอการยืนยัน

| # | เรื่อง | ข้อเสนอตอนนี้ | กระทบ | ต้องตอบก่อน |
|---|---|---|---|---|
| S2 | หมวดหมู่ตั้งต้นใน seed | 5 หมวดเดียวกับข้อมูลจำลอง (สำนักงาน, ไฟฟ้า, ทำความสะอาด, คอมพิวเตอร์, ซ่อมบำรุง) | `prisma/seed.ts` | Part 2 |

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

### Part 2: Back-end + ต่อระบบ ⬜
- [ ] Docker Compose + `.env.example` + Prisma schema และ migration (รวม `CHECK` constraints)
- [ ] Seed ข้อมูล: Admin คนแรกจาก `.env` + หมวดหมู่ตั้งต้น (S2)
- [ ] Express app: error handling, auth (cookie), role middleware
- [ ] API: auth, users, categories, materials, inventory (รวม reverse), dashboard
- [ ] Test ฝั่ง BE: เบิกเกินยอด, เบิกพร้อมกัน, จำนวนติดลบ, วัสดุซ้ำ, สิทธิ์แต่ละ role, ยกเลิกซ้ำ
- [ ] ปิด mock ใน FE (`USE_MOCK_API = false`) แล้วต่อ BE จริงผ่าน `proxy.conf.json` (ตั้งไว้แล้ว) และทดสอบทุกหน้าอีกครั้ง
- [ ] Response ของ BE ต้องตรงกับ `frontend/src/app/shared/models/` (สเปก §4.3.1)

### ส่งมอบ ⬜
- [ ] วิธีติดตั้งและรันใน README
- [ ] เตรียมย้ายขึ้น server (reverse proxy, `Secure` cookie, backup DB)

---

## 4. ข้อสังเกต

- Part 1 ไม่ต้องใช้ Docker ส่วน Part 2 ต้องเปิด Docker Desktop ก่อน
- เอกสารต้นฉบับ (SRS และ Design Spec v2.0.0) ไม่ได้เก็บไว้ในโปรเจกต์ ใช้ spec v2.1 เป็นสเปกหลัก
