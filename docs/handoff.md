# ส่งต่องานสำหรับ session ถัดไป

> **วิธีใช้:** เริ่ม session ใหม่แล้วพิมพ์ว่า "อ่าน docs/handoff.md แล้วทำต่อ" · ไฟล์นี้สรุปแค่สิ่งที่ `CLAUDE.md` และ `docs/status.md` ไม่ได้บอก ไม่ต้องย้อนอ่านประวัติแชทเก่า
> **อัปเดตล่าสุด:** 2026-10-26

## 1. สถานะตอนนี้

- **ทุก branch merge เข้า `develop` แล้ว** (ในเครื่อง) **ยังไม่ push:** `develop` นำหน้า `origin/develop` 13 commit (รวม merge handoff นี้) · `main` ยังเป็นรุ่น Part 1
- **งานที่เสร็จใน session 2026-10-20 ถึง 2026-10-26:**
  - ลบข้อมูลเดิมใน DB จริง (เก็บบัญชี Admin) แล้ว **import `IT_Inventory.xlsx` ฉบับใหม่** (2026-10-25)
  - หน่วยงานที่เบิกเลือกได้ทั้ง MAIN และ SUB (BE, FE, import และเอกสาร)
  - **ทุกวัสดุเป็นรายชิ้น (SERIAL)** (D15 ฉบับใหม่): ชิ้นที่ไม่มี S/N หรือ S/N ซ้ำได้ S/N ชั่วคราว · รับเข้าหน้าเว็บใส่ `-` ระบบสร้าง `<รหัสวัสดุ>-TEMP-SN-NN` ต่อเลขจากที่มีอยู่ · ปุ่มในหน้าเบิก "ไม่ระบุ S/N: ใช้ S/N ชั่วคราว" หยิบเฉพาะ S/N ชั่วคราว (ครั้งละไม่เกิน 100)
  - การ์ด KPI 5 ใบบน Dashboard กดได้: ไปหน้ารายการ หรือเลื่อนไปที่ตารางที่ตรงกัน · ตัวกรองวัสดุใหม่ `outOfStock=true` ("เฉพาะของหมด")
- **DB จริง** (หลัง import 2026-10-25): วัสดุ 169 (SERIAL ทั้งหมด) · ชิ้น 4,676 (อยู่ในคลัง 3,175 · เบิกแล้ว 1,501) · S/N ชั่วคราว 2,102 · รายการรับเข้า 7 · รายการเบิก 406 (มีหน่วยงานครบ) · หน่วยงาน 289
- **ไฟล์สำรอง** (`backend/backups/`, ไม่ขึ้น Git): `before-wipe-20261020-225729.sql` (ข้อมูลชุดเก่า) · `before-import-20261025-235618.sql` (DB ว่าง มีแค่ Admin)
- **บัญชีในระบบ:** มีแค่ `Admin` รหัสผ่านอยู่ใน `backend/.env` (`SEED_ADMIN_PASSWORD`) **ห้ามพิมพ์ค่านี้ในแชท โค้ด หรือเอกสาร**

## 2. งานที่รออยู่ (เรียงตามความสำคัญ)

| # | งาน | รายละเอียด |
|---|---|---|
| 1 | **push `develop`** | รอผู้ใช้สั่ง (เคยปฏิเสธคำสั่งที่มี push รวมอยู่ด้วย จึงถามก่อนทุกครั้ง) |
| 2 | **เคลียร์ข้อมูล** (ผู้ใช้ทำเองผ่านหน้าเว็บ) | จุดสั่งซื้อเป็นค่าเริ่มต้น 5 ทั้ง 169 วัสดุ · หน่วยนับเป็น "ชิ้น" ทั้งหมด · S/N ชั่วคราว 2,102 ตัว (แก้เมื่อรู้ S/N จริง ไม่แก้ก็เบิกได้) · ไม่มีราคา 434 แถว (มูลค่าคลังต่ำกว่าจริง) |
| 3 | **Dashboard รอบ 2** (P4 ข้อ 3, 4, 5, 7) | ปีงบ/TOR, อายุสต็อก, แนวโน้มรายเดือน, รายการเบิกล่าสุด · เริ่มได้เมื่อผู้ใช้สั่ง ดู [dashboard-proposals.md](dashboard-proposals.md) |
| 4 | **Dashboard รอบ 3** (ข้อ 6, 9, 10, 11) | ข้อ 6 ทำได้แล้วเพราะหน่วยงานครบ · ข้อ 11 รอ Q3 (Excel / PDF / ทั้งคู่) |
| 5 | ปุ่มใช้ S/N ชั่วคราวหยิบได้ทีละ 100 | ถ้าผู้ใช้เบิกจำนวนมากบ่อย (เช่น เทปตีนตุ๊กแก 300) เสนอให้หยิบทั้งหมดในครั้งเดียว |
| 6 | ทดสอบในเบราว์เซอร์ | หน้าเบิก (ปุ่ม S/N ชั่วคราว), หน้ารับเข้า (`-`) และการ์ด KPI ยังไม่ได้ทดสอบในเบราว์เซอร์ (ตรวจผ่าน API และ test แล้ว) |
| 7 | **เปลี่ยนรหัสผ่าน Admin / DB** (S3) | ผู้ใช้ให้ละไว้ก่อนเพราะยังอยู่ในขั้นทดสอบ · ต้องทำก่อนใช้งานจริง |
| 8 | **ลด token** | ผู้ใช้ยังไม่ได้ตัดสินใจ: ปิด plugin ponytail/superpowers เฉพาะโปรเจกต์นี้ และย่อ `CLAUDE.md` โดยคงภาษาไทยไว้ |
| 9 | **merge `develop` → `main`** | ทำเมื่อผู้ใช้สั่งเท่านั้น |

## 3. วิธีทำงานที่ผู้ใช้ต้องการ

- **mock API:** เลิกอัปเดตแล้ว ทำที่ BE จริงอย่างเดียว
- **ภาษา:** คุยและเขียนเอกสารเป็นภาษาไทย ส่วนโค้ดและ commit message เป็นภาษาอังกฤษ
- **ขั้นตอน:** เสนอก่อนทำงานใหญ่ ถ้าผู้ใช้พิมพ์ว่า "แค่เสนอ" ห้ามลงมือ · ถามก่อนถ้าขัดกับกติกาใน `CLAUDE.md` · ถ้าคำสั่งตีความได้หลายแบบและผลต่างกันมาก ให้ถามด้วยตัวเลือก (เช่น ขอบเขต "แบบ A ทั้งหมด")
- **merge/push:** ทำเมื่อผู้ใช้สั่ง · "merge เลย" = merge ในเครื่อง ไม่ push · ทำงานใน branch `feat/` `fix/` `chore/` ที่แตกจาก `develop` เสมอ
- **ผู้ใช้ชอบ:** สรุปเป็นตาราง, บอกผลทดสอบเป็นตัวเลข, บอกตรงๆ เมื่อมีอะไรผิดพลาด
- **ผู้ใช้ไม่ถนัดเปิด database:** การแก้ข้อมูลควรทำผ่านหน้าเว็บได้ · ถ้าผู้ใช้ขอให้ import ให้ ใช้ script ชั่วคราวเรียก `previewInitialImport` / `commitInitialImport` ในนาม Admin (สำรอง DB ก่อนเสมอ)
- **ข้อมูลจริง:** `docs/*.xlsx` และ `backend/backups/` มีข้อมูลองค์กร ห้าม commit (อยู่ใน `.gitignore` แล้ว)

## 4. ข้อควรรู้เรื่องเครื่องนี้ (ประหยัดเวลาลองผิดลองถูก)

| เรื่อง | วิธีที่ใช้ได้ |
|---|---|
| Git ใน Bash tool | ใส่ `export PATH="/c/Program Files/Git/cmd:$PATH"` ก่อนใช้ `git` |
| Docker Desktop | มักปิดอยู่ตอนเริ่ม session · เปิดด้วย PowerShell `Start-Process "C:\Users\user\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"` แล้วรอ `docker info` · container `inventory_db` เปิดเองเมื่อ Docker พร้อม (`docker start` อาจแจ้งว่าพอร์ตถูกใช้ ซึ่งหมายถึงเปิดอยู่แล้ว) · query อ่านอย่างเดียว: `docker exec inventory_db psql -U postgres -d inventory_db -c "..."` |
| heredoc ใน Bash tool | พังบ่อยเมื่อมี backtick หรือ `'` ปนอยู่ ให้ใช้ Write tool เขียนไฟล์ หรือเขียน script `.cjs` ใน scratchpad แล้วรันด้วย `node` · **ห้ามเขียน `cat > file` โดยไม่มี heredoc** (ค้างรอ stdin จนหมดเวลา เคยเกิดซ้ำใน session นี้) |
| แก้ไฟล์ด้วย script | ใช้ `s.replace(a, () => b)` **ห้าม** `s.replace(a, b)` เพราะ `$'` `$&` ในข้อความใหม่ (เช่น regex SQL `'^[0-9]+$'`) จะถูกตีความ และวางส่วนท้ายไฟล์ซ้ำเข้าไป · ตรวจ `git diff --stat` หลังแก้เสมอ |
| ไฟล์ CRLF | ไฟล์ที่ git checkout มาเป็น CRLF ถ้าแก้ด้วย script ให้ `.replaceAll('\r\n', '\n')` ก่อนค้นหาข้อความ · warning "LF will be replaced by CRLF" ตอน commit ไม่ต้องสนใจ |
| `.env` | ห้าม `grep`/`cat` ทั้งไฟล์ (จะแสดงรหัสผ่าน) ให้อ่านเฉพาะ key ที่ต้องใช้ใส่ตัวแปรโดยไม่ echo · login API ด้วยรหัส Admin: อ่าน `SEED_ADMIN_PASSWORD` ใส่ตัวแปร แล้วสร้าง JSON ด้วย `node -e` เขียนลงไฟล์ชั่วคราว ส่งด้วย `curl --data @file` แล้วลบไฟล์ |
| `prisma migrate reset` | Prisma ไม่ยอมให้ AI รันเองถ้าไม่ได้รับอนุญาต ต้องถามผู้ใช้ แล้วตั้ง env `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` เป็นข้อความที่ผู้ใช้ตอบตามตัวอักษร · ล้างข้อมูลโดยเก็บโครงสร้างใช้ `TRUNCATE ... RESTART IDENTITY` ทุกตารางยกเว้น `users` และ `_prisma_migrations` (สำรองก่อน) |
| warning ของ pg | `DeprecationWarning: Calling client.query()...` มาจากภายใน `@prisma/adapter-pg` 7.10 ไม่ใช่โค้ดเรา ไม่ต้องแก้ |
| server ทดสอบที่ Claude เปิด | `TaskStop` **ไม่ฆ่า** process ลูกของ `ng serve`/`tsx` ให้ปิดด้วย PowerShell `Get-NetTCPConnection -LocalPort 3001,4300 -State Listen \| % { Stop-Process -Id $_.OwningProcess -Force }` แล้วตรวจว่าพอร์ตว่างก่อนเปิดใหม่ |
| server ของผู้ใช้ | `cd backend && npm run dev` และ `cd frontend && npm start` (3000/4200) ทั้งคู่โหลดโค้ดใหม่เองเมื่อสลับ branch · session 2026-10-26 Claude เปิดทั้งสองตัวไว้เบื้องหลังให้ผู้ใช้ดูเว็บ |
| scratchpad | ถูกล้างระหว่าง session ไฟล์ทดสอบที่ต้องใช้ซ้ำต้องสร้างใหม่ |
| Material autocomplete + `requireSelection` | ค่าใน form control ไม่เปลี่ยนระหว่างพิมพ์ ตัวกรองต้องอ่านจาก `(input)` ของช่อง ไม่ใช่ `valueChanges` |

## 5. วิธีทดสอบที่ใช้มา

- **BE:** `cd backend && npm test` ใช้ DB `inventory_test` (ห้ามชี้ไป DB จริง) ตอนนี้ **44 ข้อ**
- **FE:** `cd frontend && npm test -- --watch=false` (13 ข้อ เป็น test ของ mock) และ `npx ng build`
- **ตรวจไฟล์ Excel ก่อน import (อ่านอย่างเดียว):** script ชั่วคราวใน `backend/` เรียก `previewInitialImport(admin, buffer)` แล้วพิมพ์ `summary`, `unmatched`, `issues` (DB ต้องไม่มีวัสดุ ไม่งั้นเรียกไม่ได้) · ตรวจเพิ่มเอง: หัวคอลัมน์ครบไหม (ถ้าชื่อไม่ตรง ระบบไม่ error แต่ข้อมูลคอลัมน์นั้นจะหายไปเฉยๆ เช่น "สถานะการเบิก"), S/N ซ้ำข้ามวัสดุ, แถวที่ไม่มีประเภท
- **ทดสอบในเบราว์เซอร์:** ติดตั้ง `playwright-core` ใน scratchpad ใช้ `chromium.launch({ channel: 'chrome' })` (มี Chrome ในเครื่อง ไม่ต้องดาวน์โหลด browser)
  - **ถ้าทดสอบที่มีการเขียนข้อมูล ต้องใช้ DB ทดสอบเท่านั้น:** สร้าง fixture ด้วย script ชั่วคราวใน `backend/` ที่เรียก `seedBasics()` จาก `test/helpers.js` (บัญชี `admin`/`staff`/`user` รหัส `password123`) โดยเช็กว่า `DATABASE_URL` มี `inventory_test` แล้วลบ script ทิ้งหลังใช้
  - เปิด BE ทดสอบด้วย `DATABASE_URL=<TEST_DATABASE_URL> PORT=3001 npx tsx --env-file=.env src/server.ts`
  - เปิด FE ด้วย `ng serve --port 4300 --proxy-config <ไฟล์ที่ชี้ /api ไป 3001>` จะได้ไม่ชนกับ server ของผู้ใช้ที่ 3000/4200
  - หน้า login: ใช้ `page.locator('input').nth(0/1)` (`getByLabel` หาไม่เจอ)
  - autocomplete: ใช้ `getByRole('combobox', { name })` · ทดสอบการกรองด้วย `pressSequentially()` ไม่ใช่ `fill()`
  - ข้อความ "Failed to load resource" (401) ใน console คือ `/auth/me` ก่อน login ไม่ใช่บั๊ก
- **ตรวจตัวเลขกับ DB จริง (อ่านอย่างเดียว):** เขียน script ชั่วคราวใน `backend/` ที่ import service แล้วรัน `npx tsx --env-file=.env <script>` จากนั้นลบทิ้ง หรือเรียก API ด้วย curl (ดูแถว `.env` ในข้อ 4)

## 6. ประหยัด token ใน session ถัดไป

- เริ่ม session ใหม่ทุกครั้งที่จบงานหนึ่งชิ้น และใช้ `/compact` ตอนจบช่วงงานถ้าจะคุยต่อ
- ดูผลลัพธ์ของคำสั่งแค่ส่วนที่ต้องการ (`grep`, `tail`) และใช้ภาพหน้าจอเท่าที่จำเป็น
- อัปเดต `CLAUDE.md` / `status.md` ตอนจบงาน ไม่ต้องแก้บ่อยระหว่างทำ
- ใช้ `/context` และ `/cost` ดูว่าอะไรกิน token
