# ระบบฐานข้อมูลคลังวัสดุ (Inventory Management System)

เว็บสำหรับจัดการข้อมูลวัสดุ บันทึกรับเข้า/เบิกจ่าย และช่วยตัดสินใจสั่งซื้อ

**Stack:** Angular + TypeScript (front-end) · Node.js + Express + Prisma (back-end) · PostgreSQL บน Docker

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [docs/status.md](docs/status.md) | ความคืบหน้าและเรื่องที่รอยืนยัน |
| [docs/implementation-spec-v2.1.md](docs/implementation-spec-v2.1.md) | สเปกหลัก: สิทธิ์, User Stories, schema, API และการออกแบบ FE/BE |
| [docs/spec-review.md](docs/spec-review.md) | ผลตรวจสเปก v2.0.0 ที่เป็นที่มาของ v2.1 |

## วิธีรัน

ต้องเปิด **Docker Desktop** ก่อน แล้วเปิด 2 terminal:

```bash
# terminal 1: database + API (ครั้งแรกดูขั้นตอนติดตั้งใน backend/README.md)
cd backend
npm run db:up
npm run dev          # http://localhost:3000/api/v1

# terminal 2: หน้าเว็บ
cd frontend
npm start            # เปิด http://localhost:4200
```

Login ด้วย Admin ที่ตั้งไว้ใน `backend/.env` (`SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`)

รายละเอียด: [backend/README.md](backend/README.md) · [frontend/README.md](frontend/README.md)
