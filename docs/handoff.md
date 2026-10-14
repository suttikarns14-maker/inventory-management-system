# ส่งต่องานสำหรับ session ถัดไป

> **วิธีใช้:** เริ่ม session ใหม่แล้วพิมพ์ว่า "อ่าน docs/handoff.md แล้วทำต่อ" · ไฟล์นี้สรุปแค่สิ่งที่ `CLAUDE.md` และ `docs/status.md` ไม่ได้บอก ไม่ต้องย้อนอ่านประวัติแชทเก่า
> **อัปเดตล่าสุด:** 2026-10-14

## 1. สถานะตอนนี้

- **Part 1–3 เสร็จแล้ว** และ merge เข้า `develop` แล้ว ส่วน `main` ยังเป็นรุ่น Part 1
- **DB จริงมีข้อมูลจริงแล้ว** (import `IT_Inventory.xlsx` เมื่อ 2026-10-13): วัสดุ 168 · S/N 2,629 (ชั่วคราว 62) · รายการ 410 · ตรวจเทียบ Excel แล้วไม่ตรง 0
- **สำรองก่อน import:** `backend/backups/before-import-20261013-230811.sql` (ไม่ขึ้น Git)
- **Dashboard ล่าสุด:** การ์ด 3 ใบเลื่อนในกรอบสูง 8 แถว และแสดง รหัส · ยี่ห้อ · รุ่น ใต้ชื่อวัสดุ
- **บัญชีในระบบ:** มีแค่ `Admin` รหัสผ่านอยู่ใน `backend/.env` (`SEED_ADMIN_PASSWORD`) **ห้ามพิมพ์ค่านี้ในแชท โค้ด หรือเอกสาร**

## 2. งานที่รออยู่ (เรียงตามความสำคัญ)

| # | งาน | รายละเอียด |
|---|---|---|
| 1 | **เปลี่ยนรหัสผ่าน Admin** (S3) | ค่าเดิมเคยหลุดใน history ของ Git (`develop`, `feat/backend`, `feat/username-login`) ผู้ใช้ต้องเปลี่ยนเองที่ จัดการผู้ใช้ → ปุ่มกุญแจ |
| 2 | **ข้อเสนอ Dashboard** (P4) | [dashboard-proposals.md](dashboard-proposals.md) รอผู้ใช้เลือกข้อและตอบ Q1–Q3 แนะนำเริ่มข้อ 1, 2, 8 |
| 3 | **ลด token** | ผู้ใช้ยังไม่ได้ตัดสินใจ: ปิด plugin ponytail/superpowers เฉพาะโปรเจกต์นี้ (`.claude/settings.json`) และย่อ `CLAUDE.md` **โดยคงภาษาไทยไว้** |
| 4 | **merge `develop` → `main`** | ทำเมื่อผู้ใช้สั่งเท่านั้น |
| 5 | **ข้อมูลที่ควรเคลียร์** | S/N ชั่วคราว 62 ตัว · จุดสั่งซื้อเป็นค่าเริ่มต้น 5 ทั้งหมด · หน่วยนับเป็น "ชิ้น" ทั้งหมด · รายการเบิกเก่า 96 รายการที่หน่วยงานไม่ได้จับคู่ (ชื่อเดิมอยู่ในหมายเหตุ) |

## 3. วิธีทำงานที่ผู้ใช้ต้องการ

- **ภาษา:** คุยและเขียนเอกสารเป็นภาษาไทย ส่วนโค้ดและ commit message เป็นภาษาอังกฤษ
- **ขั้นตอน:** เสนอก่อนทำงานใหญ่ ถ้าผู้ใช้พิมพ์ว่า "แค่เสนอ" ห้ามลงมือ
- **merge/push:** ทำเมื่อผู้ใช้สั่ง ทำงานใน branch `feat/` `fix/` `chore/` ที่แตกจาก `develop` เสมอ
- **ผู้ใช้ชอบ:** สรุปเป็นตาราง, บอกผลทดสอบเป็นตัวเลข, บอกตรงๆ เมื่อมีอะไรผิดพลาด
- **ข้อมูลจริง:** `docs/*.xlsx` และ `backend/backups/` มีข้อมูลองค์กร ห้าม commit (อยู่ใน `.gitignore` แล้ว)

## 4. ข้อควรรู้เรื่องเครื่องนี้ (ประหยัดเวลาลองผิดลองถูก)

| เรื่อง | วิธีที่ใช้ได้ |
|---|---|
| Git ใน Bash tool | ใส่ `export PATH="/c/Program Files/Git/cmd:$PATH"` ก่อนใช้ `git` |
| Docker Desktop | อยู่ที่ `C:\Users\user\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe` (ไม่ได้อยู่ใน Program Files) |
| heredoc ใน Bash tool | พังบ่อยเมื่อมี backtick หรือ `'` ปนอยู่ ให้ใช้ Write tool เขียนไฟล์ หรือเขียน script `.cjs` ใน scratchpad แล้วรันด้วย `node` |
| ไฟล์ CRLF | ไฟล์ที่ git checkout มาเป็น CRLF ถ้าแก้ด้วย script ให้ `.replaceAll('\r\n', '\n')` ก่อนค้นหาข้อความ |
| `prisma migrate reset` | Prisma ไม่ยอมให้ AI รันเองถ้าไม่ได้รับอนุญาต ต้องถามผู้ใช้ แล้วตั้ง env `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` เป็นข้อความที่ผู้ใช้ตอบตามตัวอักษร |
| warning ของ pg | `DeprecationWarning: Calling client.query()...` มาจากภายใน `@prisma/adapter-pg` 7.10 ไม่ใช่โค้ดเรา ไม่ต้องแก้ |
| server ที่ Claude เปิด | ปิดตามเมื่อ session จบ ถ้าผู้ใช้จะดูหน้าเว็บ: `cd backend && npm run dev` และ `cd frontend && npm start` (DB อยู่ใน Docker เปิดค้างได้) |
| scratchpad | ถูกล้างระหว่าง session ไฟล์ทดสอบที่ต้องใช้ซ้ำต้องสร้างใหม่ |

## 5. วิธีทดสอบที่ใช้มา

- **BE:** `cd backend && npm test` ใช้ DB `inventory_test` (ห้ามชี้ไป DB จริง) ตอนนี้ 40 ข้อ
- **FE:** `cd frontend && npm test -- --watch=false` (13 ข้อ) และ `npx ng build`
- **ทดสอบในเบราว์เซอร์:** ติดตั้ง `playwright-core` ใน scratchpad ใช้ `chromium.launch({ channel: 'chrome' })` (มี Chrome ในเครื่อง ไม่ต้องดาวน์โหลด browser)
  - เปิด BE ทดสอบด้วย `DATABASE_URL=<TEST_DATABASE_URL> PORT=3001 npx tsx src/server.ts`
  - เปิด FE ด้วย `ng serve --port 4300 --proxy-config <ไฟล์ที่ชี้ /api ไป 3001>` จะได้ไม่ชนกับ server ของผู้ใช้ที่ 3000/4200
  - selector ของ autocomplete ให้ใช้ `getByRole('combobox', { name })` และใช้ `fill()` แทน `click()` เพราะ label ของ Material บังช่อง
  - ข้อความ "Failed to load resource" (401/409) ใน console เป็นผลจากการทดสอบกรณี error ที่ตั้งใจไว้ ไม่ใช่บั๊ก
- **ตรวจข้อมูลจริงหลังแก้ import:** query เทียบยอดต่อวัสดุกับ Excel โดยใช้ `materialKey()` จาก `material.service.ts` (อ่านอย่างเดียว)

## 6. ประหยัด token ใน session ถัดไป

- เริ่ม session ใหม่ทุกครั้งที่จบงานหนึ่งชิ้น และใช้ `/compact` ตอนจบช่วงงานถ้าจะคุยต่อ
- ดูผลลัพธ์ของคำสั่งแค่ส่วนที่ต้องการ (`grep`, `tail`) และใช้ภาพหน้าจอเท่าที่จำเป็น
- อัปเดต `CLAUDE.md` / `status.md` ตอนจบงาน ไม่ต้องแก้บ่อยระหว่างทำ
- ใช้ `/context` และ `/cost` ดูว่าอะไรกิน token
