# Frontend: ระบบคลังวัสดุ

Angular 22 (standalone, zoneless, Signals) + Angular Material

## รัน

```bash
npm install     # ครั้งแรก
npm start       # http://localhost:4200
```

หน้าเว็บเรียก back-end จริงผ่าน proxy (`/api` → `localhost:3000`) จึงต้องเปิด back-end ก่อน (ดู [backend/README.md](../backend/README.md))

### โหมดข้อมูลจำลอง (ไม่ต้องมี back-end)

ตั้ง `USE_MOCK_API = true` ใน `src/app/core/mock/mock-backend.ts` แล้วหน้าเว็บจะใช้ mock API ในตัวแอป ข้อมูลเก็บใน `localStorage` ของ browser เหมาะสำหรับลองหน้าตาหรือพัฒนา UI โดยไม่ต้องเปิด Docker

| Username (mock) | สิทธิ์ |
|---|---|
| `admin` | ADMIN: ทำได้ทุกอย่าง |
| `staff` | STAFF: รับเข้า เบิกจ่าย และเพิ่มวัสดุ |
| `user` | USER: เบิกได้อย่างเดียว |

รหัสผ่านทุกบัญชีใน mock คือ `password123` หน้า login มีปุ่มกรอกให้อัตโนมัติ

ในโหมด mock ล้างข้อมูลกลับเป็นค่าเริ่มต้นได้จากเมนูชื่อผู้ใช้ มุมขวาบน → **รีเซ็ตข้อมูลตัวอย่าง**

## คำสั่ง

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm start` | dev server (proxy `/api` ไป `localhost:3000` เมื่อปิด mock) |
| `npm run build` | build production ไปที่ `dist/` |
| `npm test -- --watch=false` | unit test (Vitest) |

## Mock API

- `src/app/core/mock/`: `mock-api.ts` ตอบทุก endpoint ตามสเปก §4.3, `mock-seed.ts` สร้างข้อมูลตัวอย่าง 6 เดือน และ `mock-api.interceptor.ts` ดักคำขอ `/api/*`
- สลับ mock / back-end จริงได้ที่ `USE_MOCK_API` ใน `src/app/core/mock/mock-backend.ts` โดยหน้าเว็บไม่ต้องแก้
- `src/app/shared/models/` คือรูปแบบข้อมูลที่ API ต้องตอบ ซึ่ง back-end ต้องตอบให้ตรงกัน
