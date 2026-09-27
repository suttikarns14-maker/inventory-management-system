# Backend: ระบบคลังวัสดุ

Node.js 24 + TypeScript + Express 5 + Prisma 7 + PostgreSQL 16 (Docker)

## ติดตั้งครั้งแรก

ต้องเปิด **Docker Desktop** ก่อน

```bash
cd backend
cp .env.example .env     # แล้วแก้รหัสผ่าน DB, JWT_SECRET และรหัสผ่าน Admin ในไฟล์ .env
npm install
npm run db:up            # เปิด PostgreSQL ใน Docker
npm run db:migrate       # สร้างตาราง
npm run db:seed          # สร้าง Admin คนแรก + หมวดหมู่ตั้งต้น
```

`.env` ห้าม commit เด็ดขาด (อยู่ใน `.gitignore` แล้ว)

## ใช้งานประจำวัน

```bash
npm run db:up     # ถ้า PostgreSQL ยังไม่ได้เปิด
npm run dev       # API ที่ http://localhost:3000/api/v1 (reload อัตโนมัติเมื่อแก้โค้ด)
```

จากนั้นเปิด front-end (`cd frontend && npm start`) แล้วเข้า http://localhost:4200 โดย Angular จะส่ง `/api` มาที่ port 3000 ให้เอง

## คำสั่ง

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run dev` | รัน API แบบ watch |
| `npm test` | test กับ database แยก `inventory_test` ไม่แตะข้อมูลจริง |
| `npm run typecheck` | ตรวจ TypeScript |
| `npm run build` / `npm start` | build ไป `dist/` แล้วรันแบบ production |
| `npm run db:up` | เปิด PostgreSQL (Docker) |
| `npm run db:migrate` | สร้าง/อัปเดตตารางตาม `prisma/schema.prisma` |
| `npm run db:seed` | สร้าง Admin + หมวดหมู่ (รันซ้ำได้ ไม่ทับข้อมูลเดิม) |
| `npm run db:studio` | เปิด Prisma Studio เพื่อดูหรือแก้ข้อมูลใน browser |

## ข้อมูลเก็บที่ไหน

PostgreSQL อยู่ใน container `inventory_db` และข้อมูลอยู่ใน Docker volume `backend_postgres_data` บนเครื่องนี้

- ข้อมูล**ไม่หาย**เมื่อปิดเครื่อง ปิด Docker หรือสั่ง `docker compose down`
- ข้อมูล**หาย**ถ้าสั่ง `docker compose down -v` หรือลบ volume

**สำรองข้อมูล / กู้คืน:**

```bash
docker exec inventory_db pg_dump -U postgres -d inventory_db > backup.sql
docker exec -i inventory_db psql -U postgres -d inventory_db < backup.sql
```

## โครงสร้าง

```
src/
├── app.ts / server.ts     # Express app และจุดเริ่มรัน
├── config/env.ts          # ตรวจ .env ตอนเริ่มระบบ
├── routes/index.ts        # ทุก endpoint + สิทธิ์ตาม role (สเปก §4.3, §1)
├── controllers/           # parse input ด้วย Zod แล้วส่ง response
├── services/              # business logic + DB transaction
├── dtos/                  # Zod schema ของ input ทุก endpoint
├── middlewares/           # auth (cookie JWT), role, error, rate limit
└── utils/                 # AppError, response helper, วันที่ (Asia/Bangkok)
prisma/
├── schema.prisma          # data model (สเปก §3)
├── migrations/            # รวม CHECK constraint และ unique index ของ username
└── seed.ts
test/                      # Vitest + Supertest กับ PostgreSQL จริง
```
