# Project Status: ระบบฐานข้อมูลคลังวัสดุ

**อัปเดตล่าสุด:** 2026-09-28 · **ขั้นปัจจุบัน:** Setup เสร็จแล้ว รอเริ่ม Part 1

สัญลักษณ์: ✅ เสร็จ · 🔄 กำลังทำ · ⏳ รอยืนยัน · ⬜ ยังไม่เริ่ม

---

## 1. รอการยืนยัน

| # | เรื่อง | ข้อเสนอตอนนี้ | กระทบ | ต้องตอบก่อน |
|---|---|---|---|---|
| D5 | จำนวนเป็นจำนวนเต็มเสมอไหม (มีวัสดุที่นับเป็นเมตรหรือกิโลกรัมไหม) | จำนวนเต็ม | validation ในฟอร์ม และ type ใน DB (`Int` หรือ `Decimal`) | ฟอร์มรับ-เบิกใน Part 1 |
| D6 | แก้รหัสวัสดุ (`code`) หลังสร้างแล้วได้ไหม | ได้ (ADMIN) ถ้าไม่ซ้ำ | ฟอร์มแก้ไขวัสดุ และ `PUT /materials/:id` | ฟอร์มแก้ไขวัสดุใน Part 1 |
| S1 | email ของ Admin คนแรก และหมวดหมู่ตั้งต้น | ใช้ค่าจาก `.env` และหมวดหมู่ตัวอย่าง | `prisma/seed.ts` | Part 2 |

รายละเอียดอยู่ใน [implementation-spec-v2.1.md §10](implementation-spec-v2.1.md)

---

## 2. การตัดสินใจที่ยืนยันแล้ว

| # | เรื่อง | ผล |
|---|---|---|
| D1 | Frontend | Angular + TypeScript, Signals, Reactive Forms, Angular Material |
| D2 | ที่เก็บ token | HttpOnly cookie + ให้ front-end และ API อยู่ origin เดียวผ่าน proxy |
| D3 | STAFF เห็น Dashboard | ได้ |
| D4 | ค่าคงที่ในการแนะนำการสั่งซื้อ | ใช้ข้อมูลย้อนหลัง 90 วัน · เตือนเมื่อจะหมดใน 14 วัน · สั่งให้พอใช้ 30 วัน |
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

### Part 1: Front-end + Mock API ⬜
**รอบที่ 1: โครงและตัวอย่าง** (ให้ผู้ใช้ตรวจก่อนทำรอบ 2)
- [ ] สร้างโปรเจกต์ด้วย Angular CLI + Angular Material ใน `frontend/`
- [ ] Models ตามสเปก §4 และ mock API interceptor ที่เก็บข้อมูลใน localStorage พร้อมข้อมูลตัวอย่าง
- [ ] `AuthService`, `authGuard`, `authInterceptor` และ shell/sidebar ตาม role
- [ ] หน้า Login (บัญชีทดสอบ 3 role) และหน้า 403
- [ ] หน้ารายการวัสดุ: ค้นหา, กรอง, สต็อกต่ำ, sort, แบ่งหน้า

**รอบที่ 2: หน้าที่เหลือ**
- [ ] ฟอร์มเพิ่ม/แก้ไขวัสดุ · ต้องตอบ D6 ก่อน
- [ ] ฟอร์มรับเข้า/เบิกจ่ายหลายรายการ และเตือนเมื่อเกินยอด · ต้องตอบ D5 ก่อน
- [ ] หน้าประวัติ + ยกเลิกรายการ (ADMIN)
- [ ] Dashboard: KPI, ควรสั่งซื้อ, เบิกมากที่สุด, ไม่เคยเบิก
- [ ] หน้าตั้งค่าผู้ใช้และหมวดหมู่
- [ ] ทดสอบทุกหน้าด้วยทั้ง 3 role

### Part 2: Back-end + ต่อระบบ ⬜
- [ ] Docker Compose + `.env.example` + Prisma schema และ migration (รวม `CHECK` constraints) · ต้องตอบ D5 ก่อน
- [ ] Seed ข้อมูล · ต้องตอบ S1 ก่อน
- [ ] Express app: error handling, auth (cookie), role middleware
- [ ] API: auth, users, categories, materials, inventory (รวม reverse), dashboard
- [ ] Test ฝั่ง BE: เบิกเกินยอด, เบิกพร้อมกัน, จำนวนติดลบ, วัสดุซ้ำ, สิทธิ์แต่ละ role, ยกเลิกซ้ำ
- [ ] ปิด mock ใน FE แล้วต่อ BE จริงผ่าน `proxy.conf.json` และทดสอบทุกหน้าอีกครั้ง

### ส่งมอบ ⬜
- [ ] วิธีติดตั้งและรันใน README
- [ ] เตรียมย้ายขึ้น server (reverse proxy, `Secure` cookie, backup DB)

---

## 4. ข้อสังเกต

- Part 1 ไม่ต้องใช้ Docker ส่วน Part 2 ต้องเปิด Docker Desktop ก่อน
- เอกสารต้นฉบับ (SRS และ Design Spec v2.0.0) ไม่ได้เก็บไว้ในโปรเจกต์ ใช้ spec v2.1 เป็นสเปกหลัก
