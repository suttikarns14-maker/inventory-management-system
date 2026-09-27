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

**Front-end** (ตอนนี้ใช้ข้อมูลจำลอง ไม่ต้องมี back-end):

```bash
cd frontend
npm install
npm start       # เปิด http://localhost:4200
```

รายละเอียดและบัญชีทดสอบอยู่ใน [frontend/README.md](frontend/README.md)

**Back-end:** ยังไม่มี จะทำใน Part 2
