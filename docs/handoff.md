# ส่งต่องานสำหรับ session ถัดไป

> **วิธีใช้:** เริ่ม session ใหม่แล้วพิมพ์ว่า "อ่าน docs/handoff.md แล้วทำต่อ" · ไฟล์นี้สรุปแค่สิ่งที่ `CLAUDE.md` และ `docs/status.md` ไม่ได้บอก ไม่ต้องย้อนอ่านประวัติแชทเก่า
> **อัปเดตล่าสุด:** 2026-10-15

## 1. สถานะตอนนี้

- **Part 1–3 เสร็จแล้ว** และ merge เข้า `develop` แล้ว ส่วน `main` ยังเป็นรุ่น Part 1
- **branch `feat/dashboard-value` ยังไม่ merge** (4 commit, test ผ่านครบ):
  - Dashboard รอบ 1 (P4 ข้อ 1, 2, 8): มูลค่าคลัง ≈ 2.33 ล้าน แยก 4 หมวด · มูลค่าของค้างสต็อก (66 วัสดุ ≈ 5.48 แสน) · การ์ดงานค้างคุณภาพข้อมูล (ลิงก์ไปหน้าที่ต้องแก้)
  - เติมหน่วยงานให้รายการเบิกเก่า (D14): ADMIN กดปุ่มรูปตึกในหน้าประวัติ เติมได้เฉพาะช่องที่ว่าง (`PATCH /inventory/transactions/:id/departments`) · ตัวกรอง `missingDepartment=true`
  - ช่องเลือกหน่วยงาน (หน้าเบิกจ่ายและหน้าต่างเติมหน่วยงาน): แสดงครบ 277 หน่วยงาน (เดิมตัดที่ 50) และกรองตามที่พิมพ์ได้แล้ว
- **DB จริง** (import `IT_Inventory.xlsx` 2026-10-13): วัสดุ 168 · S/N 2,629 · รายการ 410 · หน่วยงาน 277 (หลัก 43, ย่อย 234)
- **สำรองก่อน import:** `backend/backups/before-import-20261013-230811.sql` (ไม่ขึ้น Git)
- **บัญชีในระบบ:** มีแค่ `Admin` รหัสผ่านอยู่ใน `backend/.env` (`SEED_ADMIN_PASSWORD`) **ห้ามพิมพ์ค่านี้ในแชท โค้ด หรือเอกสาร**

## 2. งานที่รออยู่ (เรียงตามความสำคัญ)

| # | งาน | รายละเอียด |
|---|---|---|
| 1 | **เปลี่ยนรหัสผ่าน Admin** (S3) | ผู้ใช้ทำเอง: ค่าเดิมเคยหลุดใน Git history ให้เปลี่ยนที่ จัดการผู้ใช้ → ปุ่มกุญแจ |
| 2 | **เปลี่ยนรหัสผ่าน DB** (ไม่บังคับ) | session 2026-10-14 เผลอแสดง `POSTGRES_PASSWORD` ใน output ของคำสั่ง ถ้าผู้ใช้จะเปลี่ยน ช่วยทำขั้นตอนให้ (แก้ `.env` + `ALTER USER` ใน container) |
| 3 | **merge `feat/dashboard-value` → `develop`** | รอผู้ใช้สั่ง |
| 4 | **เคลียร์ข้อมูล** (ผู้ใช้ทำเองผ่านหน้าเว็บ) | เติมหน่วยงาน 101 รายการ · S/N ชั่วคราว 62 ตัว · จุดสั่งซื้อค่าเริ่มต้น 5 ทั้ง 168 วัสดุ · หน่วยนับเป็น "ชิ้น" ทั้งหมด |
| 5 | **Dashboard รอบ 2** (P4 ข้อ 3, 4, 5, 7) | ปีงบ/TOR, อายุสต็อก, แนวโน้มรายเดือน, รายการเบิกล่าสุด · ข้อมูลพร้อม เริ่มได้เมื่อผู้ใช้สั่ง ดู [dashboard-proposals.md](dashboard-proposals.md) |
| 6 | **Dashboard รอบ 3** (ข้อ 6, 9, 10, 11) | ข้อ 6 ทำหลังเติมหน่วยงานครบ · ข้อ 11 รอ Q3 (Excel / PDF / ทั้งคู่) |
| 7 | **ลด token** | ผู้ใช้ยังไม่ได้ตัดสินใจ: ปิด plugin ponytail/superpowers เฉพาะโปรเจกต์นี้ (`.claude/settings.json`) และย่อ `CLAUDE.md` **โดยคงภาษาไทยไว้** |
| 8 | **merge `develop` → `main`** | ทำเมื่อผู้ใช้สั่งเท่านั้น |

## 3. วิธีทำงานที่ผู้ใช้ต้องการ

- **mock API:** เลิกอัปเดตแล้ว ทำที่ BE จริงอย่างเดียว
- **ภาษา:** คุยและเขียนเอกสารเป็นภาษาไทย ส่วนโค้ดและ commit message เป็นภาษาอังกฤษ
- **ขั้นตอน:** เสนอก่อนทำงานใหญ่ ถ้าผู้ใช้พิมพ์ว่า "แค่เสนอ" ห้ามลงมือ · ถามก่อนถ้าขัดกับกติกาใน `CLAUDE.md`
- **merge/push:** ทำเมื่อผู้ใช้สั่ง ทำงานใน branch `feat/` `fix/` `chore/` ที่แตกจาก `develop` เสมอ
- **ผู้ใช้ชอบ:** สรุปเป็นตาราง, บอกผลทดสอบเป็นตัวเลข, บอกตรงๆ เมื่อมีอะไรผิดพลาด
- **ผู้ใช้ไม่ถนัดเปิด database:** การแก้ข้อมูลควรทำผ่านหน้าเว็บได้
- **ข้อมูลจริง:** `docs/*.xlsx` และ `backend/backups/` มีข้อมูลองค์กร ห้าม commit (อยู่ใน `.gitignore` แล้ว)

## 4. ข้อควรรู้เรื่องเครื่องนี้ (ประหยัดเวลาลองผิดลองถูก)

| เรื่อง | วิธีที่ใช้ได้ |
|---|---|
| Git ใน Bash tool | ใส่ `export PATH="/c/Program Files/Git/cmd:$PATH"` ก่อนใช้ `git` |
| Docker Desktop | อยู่ที่ `C:\Users\user\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe` (ไม่ได้อยู่ใน Program Files) · container ชื่อ `inventory_db` (query อ่านอย่างเดียว: `docker exec inventory_db psql -U postgres -d inventory_db -c "..."`) |
| heredoc ใน Bash tool | พังบ่อยเมื่อมี backtick หรือ `'` ปนอยู่ ให้ใช้ Write tool เขียนไฟล์ หรือเขียน script `.cjs` ใน scratchpad แล้วรันด้วย `node` · ห้ามเขียน `cat > file` โดยไม่มี heredoc (ค้างรอ stdin) |
| ไฟล์ CRLF | ไฟล์ที่ git checkout มาเป็น CRLF ถ้าแก้ด้วย script ให้ `.replaceAll('\r\n', '\n')` ก่อนค้นหาข้อความ |
| `.env` | ห้าม `grep`/`cat` ทั้งไฟล์ (จะแสดงรหัสผ่าน) ให้อ่านเฉพาะ key ที่ต้องใช้ เช่น `grep '^TEST_DATABASE_URL=' .env \| cut -d= -f2-` ใส่ตัวแปรโดยไม่ echo |
| `prisma migrate reset` | Prisma ไม่ยอมให้ AI รันเองถ้าไม่ได้รับอนุญาต ต้องถามผู้ใช้ แล้วตั้ง env `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` เป็นข้อความที่ผู้ใช้ตอบตามตัวอักษร |
| warning ของ pg | `DeprecationWarning: Calling client.query()...` มาจากภายใน `@prisma/adapter-pg` 7.10 ไม่ใช่โค้ดเรา ไม่ต้องแก้ |
| server ทดสอบที่ Claude เปิด | `TaskStop` **ไม่ฆ่า** process ลูกของ `ng serve`/`tsx` ให้ปิดด้วย PowerShell `Get-NetTCPConnection -LocalPort 3001,4300 -State Listen \| % { Stop-Process -Id $_.OwningProcess -Force }` แล้วตรวจว่าพอร์ตว่างก่อนเปิดใหม่ (เคยมี BE ต่อ DB จริงค้างอยู่ที่ 3001) |
| server ของผู้ใช้ | `cd backend && npm run dev` และ `cd frontend && npm start` (3000/4200) · DB อยู่ใน Docker เปิดค้างได้ |
| scratchpad | ถูกล้างระหว่าง session ไฟล์ทดสอบที่ต้องใช้ซ้ำต้องสร้างใหม่ |
| Material autocomplete + `requireSelection` | ค่าใน form control ไม่เปลี่ยนระหว่างพิมพ์ ตัวกรองต้องอ่านจาก `(input)` ของช่อง ไม่ใช่ `valueChanges` |

## 5. วิธีทดสอบที่ใช้มา

- **BE:** `cd backend && npm test` ใช้ DB `inventory_test` (ห้ามชี้ไป DB จริง) ตอนนี้ 42 ข้อ
- **FE:** `cd frontend && npm test -- --watch=false` (13 ข้อ เป็น test ของ mock) และ `npx ng build`
- **ทดสอบในเบราว์เซอร์:** ติดตั้ง `playwright-core` ใน scratchpad ใช้ `chromium.launch({ channel: 'chrome' })` (มี Chrome ในเครื่อง ไม่ต้องดาวน์โหลด browser)
  - **ถ้าทดสอบที่มีการเขียนข้อมูล ต้องใช้ DB ทดสอบเท่านั้น:** สร้าง fixture ด้วย script ชั่วคราวใน `backend/` ที่เรียก `seedBasics()` จาก `test/helpers.js` (บัญชี `admin`/`staff`/`user` รหัส `password123`) โดยเช็กว่า `DATABASE_URL` มี `inventory_test` แล้วลบ script ทิ้งหลังใช้
  - เปิด BE ทดสอบด้วย `DATABASE_URL=<TEST_DATABASE_URL> PORT=3001 npx tsx --env-file=.env src/server.ts`
  - เปิด FE ด้วย `ng serve --port 4300 --proxy-config <ไฟล์ที่ชี้ /api ไป 3001>` จะได้ไม่ชนกับ server ของผู้ใช้ที่ 3000/4200
  - หน้า login: ใช้ `page.locator('input').nth(0/1)` (`getByLabel` หาไม่เจอ)
  - autocomplete: ใช้ `getByRole('combobox', { name })` · ทดสอบการกรองด้วย `pressSequentially()` (พิมพ์ทีละตัวเหมือนผู้ใช้) ไม่ใช่ `fill()`
  - ข้อความ "Failed to load resource" (401) ใน console คือ `/auth/me` ก่อน login ไม่ใช่บั๊ก
- **ตรวจตัวเลขกับ DB จริง (อ่านอย่างเดียว):** เขียน script ชั่วคราวใน `backend/` ที่ import service แล้วรัน `npx tsx --env-file=.env <script>` จากนั้นลบทิ้ง

## 6. ประหยัด token ใน session ถัดไป

- เริ่ม session ใหม่ทุกครั้งที่จบงานหนึ่งชิ้น และใช้ `/compact` ตอนจบช่วงงานถ้าจะคุยต่อ
- ดูผลลัพธ์ของคำสั่งแค่ส่วนที่ต้องการ (`grep`, `tail`) และใช้ภาพหน้าจอเท่าที่จำเป็น
- อัปเดต `CLAUDE.md` / `status.md` ตอนจบงาน ไม่ต้องแก้บ่อยระหว่างทำ
- ใช้ `/context` และ `/cost` ดูว่าอะไรกิน token
