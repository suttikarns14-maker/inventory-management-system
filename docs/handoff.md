# ส่งต่องานสำหรับ session ถัดไป

> **วิธีใช้:** เริ่ม session ใหม่แล้วพิมพ์ว่า "อ่าน docs/handoff.md แล้วทำต่อ" · ไฟล์นี้สรุปแค่สิ่งที่ `CLAUDE.md` และ `docs/status.md` ไม่ได้บอก ไม่ต้องย้อนอ่านประวัติแชทเก่า
> **อัปเดตล่าสุด:** 2026-11-03 (D17 คำขอเบิก + D18 รับคืน merge เข้า `develop` และ push แล้ว)

## 1. สถานะตอนนี้

- **งานล่าสุด (2026-11-03): D18 รับคืนวัสดุ merge เข้า `develop` และ push แล้ว** (branch `feat/stock-return`) · STAFF/ADMIN กด "รับคืน" ที่แถวใบเบิกในหน้าประวัติ · migration `20261103000000_stock_returns` **รันกับ DB จริงแล้ว** (สำรองที่ `backups/before-stock-returns-20261103-002612.sql`) · แผนงานและการตัดสินใจ: `docs/superpowers/plans/2026-11-02-stock-return.md`
- **D17 (2026-11-02) merge เข้า `develop` พร้อม D18 แล้ว** · การเบิกทุกครั้งเป็นคำขอที่ผู้เบิกเซ็น → STAFF/ADMIN คนอื่นอนุมัติพร้อมเซ็น → ตัดสต็อก · ใบเบิกพิมพ์/PDF จากหน้าประวัติ · migration `20261102120000_withdrawal_requests` **รันกับ DB จริงแล้ว** (สำรองที่ `backups/before-withdrawal-requests-20261102-155427.sql`) · แผนงาน: `docs/superpowers/plans/2026-11-02-withdrawal-approval.md`
- **ก่อนใช้ D17 จริง ต้องมีบัญชี STAFF อย่างน้อย 1 คน** เพราะ Admin อนุมัติคำขอของตัวเองไม่ได้ (ตอนนี้ยังมีแค่ `Admin`)
- ทุก branch merge เข้า `develop` และ push แล้ว · `main` ยังเป็นรุ่น Part 1
- **งานที่เสร็จใน session 2026-10-26 (ช่วงหลัง):**
  - **Dashboard ครบทุกข้อในข้อเสนอแล้ว** (รอบ 1–3): จัดซื้อตามปีงบ/อายุสต็อก, แนวโน้มเบิกรายเดือน, รายการเบิกล่าสุด, การเบิกแยกตามหน่วยงานที่ใช้, สต็อกแยกตามสถานที่เก็บ (กดชื่อสถานที่แล้วกางรายการวัสดุ), ปุ่ม "ส่งออก Excel" (7 ชีต) · หน้าประวัติมีตัวกรอง "หน่วยงานที่ใช้"
  - **D16: เลิกสถานะวัสดุ ใช้งาน/ปิดใช้งาน ทั้งระบบ** (ผู้ใช้สับสน) · ลบคอลัมน์ `materials.status` ด้วย migration `20261026230000_drop_material_status` (รันกับ DB จริงแล้ว) · KPI "วัสดุที่ใช้งานอยู่" เปลี่ยนเป็น "วัสดุทั้งหมด" (`totalMaterials`)
- **งานก่อนหน้า (2026-10-20 ถึง 26):** import `IT_Inventory.xlsx` ฉบับใหม่ · หน่วยงานที่เบิกเลือกได้ทั้ง MAIN/SUB · ทุกวัสดุเป็นรายชิ้นพร้อม S/N ชั่วคราว (D15) · การ์ด KPI กดได้ + ตัวกรอง "เฉพาะของหมด"
- **DB จริง** (หลัง import 2026-10-25): วัสดุ 169 (SERIAL ทั้งหมด) · ชิ้น 4,676 (อยู่ในคลัง 3,175 · เบิกแล้ว 1,501) · S/N ชั่วคราว 2,102 · รายการรับเข้า 7 · รายการเบิก 406 (มีหน่วยงานครบ) · หน่วยงาน 289 · มูลค่าคลัง ≈ 2.35 ล้านบาท
- **ไฟล์สำรอง** (`backend/backups/`, ไม่ขึ้น Git): `before-wipe-20261020-225729.sql` (ข้อมูลชุดเก่า) · `before-import-20261025-235618.sql` (DB ว่าง มีแค่ Admin) · `before-drop-material-status-20261026-230512.sql` (ก่อนลบคอลัมน์ status) · `before-withdrawal-requests-20261102-155427.sql` · `before-stock-returns-20261103-002612.sql`
- **ย้ายเครื่อง (2026-11-01):** กู้ DB จาก `backups/move-20261101-223402.sql` ลงเครื่องใหม่แล้ว ได้ตัวเลขตรงกับข้างบน (วัสดุ 169 · ชิ้น 4,676 · รายการ 413 · ผู้ใช้ 1) · migration ครบ 3 ตัว (`migrate status` = up to date) · ตอนนี้ migration ครบ 5 ตัว
- **server:** Claude เปิด BE (3000) และ FE (4200) ไว้เบื้องหลังใน session นี้ · Docker Desktop เปิดอยู่
- **บัญชีในระบบ:** มีแค่ `Admin` รหัสผ่านอยู่ใน `backend/.env` (`SEED_ADMIN_PASSWORD`) **ห้ามพิมพ์ค่านี้ในแชท โค้ด หรือเอกสาร**

## 2. งานที่รออยู่ (เรียงตามความสำคัญ)

| # | งาน | รายละเอียด |
|---|---|---|
| 1 | **เคลียร์ข้อมูล** (ผู้ใช้ทำเองผ่านหน้าเว็บ) | จุดสั่งซื้อเป็นค่าเริ่มต้น 5 ทั้ง 169 วัสดุ · หน่วยนับเป็น "ชิ้น" ทั้งหมด · S/N ชั่วคราว 2,102 ตัว (แก้เมื่อรู้ S/N จริง ไม่แก้ก็เบิกได้) · ไม่มีราคา 434 แถว (มูลค่าคลังต่ำกว่าจริง) · 25 ชิ้นไม่มีสถานที่เก็บ |
| 0 | **เรื่องเล็กจาก review D17/D18** (ทำเมื่อผู้ใช้สั่ง) | D18: ปุ่ม "รับคืน" ยังแสดงเมื่อคืนครบแล้ว · ADMIN เห็นปุ่มยกเลิกบนใบเบิกที่มีรับคืน (กดแล้วได้ 409 `HAS_RETURNS`) · เหตุผลเป็นช่องว่างล้วนกดบันทึกแล้วเงียบ · การ์ด Dashboard แสดงยอดสุทธิแต่หน้าประวัติที่ลิงก์ไปแสดงยอดเบิกเต็ม · D17: ตัวเลขบนเมนูนับคำขอของตัวเองด้วย · คำขอที่ OUT ถูกยกเลิกยังแสดง "อนุมัติแล้ว" · ตรวจลายเซ็นแค่ prefix PNG · body limit 512kb ทุก endpoint |
| 2 | ปุ่มใช้ S/N ชั่วคราวหยิบได้ทีละ 100 | ย้ายไปอยู่หน้าอนุมัติแล้ว (ปุ่ม "ใช้ S/N ชั่วคราวอีก N ชิ้น") · ยังติดเพดาน 100 ต่อครั้งของ API ถ้าอนุมัติเกิน 100 ชิ้นต้องกดซ้ำ |
| 3 | ทดสอบในเบราว์เซอร์ | หน้ารับเข้า (`-`) ยังไม่ได้ทดสอบ · หน้าต่างรับคืนยังไม่ได้ลองบนจอมือถือ · ยังไม่ได้ลองรับคืนและพิมพ์ใบเบิกกับ DB จริง · D17 ทดสอบแล้ว 13 ข้อ, D18 8 ข้อ (บน DB ทดสอบ) |
| 4 | วันที่ ค.ศ. / พ.ศ. ปนกัน | กราฟรายเดือนใช้ พ.ศ. (ต.ค. 69) แต่วันที่ทั้งเว็บเป็น ค.ศ. (22 ต.ค. 2026) · แจ้งผู้ใช้แล้ว ยังไม่ได้สั่งให้เปลี่ยน |
| 5 | **เปลี่ยนรหัสผ่าน Admin / DB** (S3) | ผู้ใช้ให้ละไว้ก่อนเพราะยังอยู่ในขั้นทดสอบ · ต้องทำก่อนใช้งานจริง |
| 6 | **ลด token** | ผู้ใช้ยังไม่ได้ตัดสินใจ: ปิด plugin ponytail/superpowers เฉพาะโปรเจกต์นี้ และย่อ `CLAUDE.md` โดยคงภาษาไทยไว้ |
| 7 | **merge `develop` → `main`** | ทำเมื่อผู้ใช้สั่งเท่านั้น · ถ้าเครื่องปลายทางมี DB อยู่แล้ว ต้องรัน `npm run db:migrate` (มี migration ลบคอลัมน์ status, คำขอเบิก, รับคืน) |

## 3. วิธีทำงานที่ผู้ใช้ต้องการ

- **mock API:** เลิกอัปเดตแล้ว ทำที่ BE จริงอย่างเดียว
- **ภาษา:** คุยและเขียนเอกสารเป็นภาษาไทย ส่วนโค้ดและ commit message เป็นภาษาอังกฤษ
- **ขั้นตอน:** เสนอก่อนทำงานใหญ่ ถ้าผู้ใช้พิมพ์ว่า "แค่เสนอ" ห้ามลงมือ · ถามก่อนถ้าขัดกับกติกาใน `CLAUDE.md` · ถ้าคำสั่งตีความได้หลายแบบและผลต่างกันมาก ให้ถามด้วยตัวเลือก (เช่น ขอบเขต "แบบ A ทั้งหมด")
- **merge/push:** ทำเมื่อผู้ใช้สั่ง · "merge เลย" = merge ในเครื่อง ไม่ push · "merge แล้ว push" = merge เข้า `develop` แล้ว push `develop` · ทำงานใน branch `feat/` `fix/` `chore/` ที่แตกจาก `develop` เสมอ
- **ตัวเลือกที่แนะนำ:** เวลาถามด้วยตัวเลือก ผู้ใช้มักเลือกข้อ "(แนะนำ)" · ถ้ามีตัวเลขที่ซ้ำกัน ผู้ใช้ชอบรวมเป็นการ์ดเดียว
- **ผู้ใช้ชอบ:** สรุปเป็นตาราง, บอกผลทดสอบเป็นตัวเลข, บอกตรงๆ เมื่อมีอะไรผิดพลาด
- **ผู้ใช้ไม่ถนัดเปิด database:** การแก้ข้อมูลควรทำผ่านหน้าเว็บได้ · ถ้าผู้ใช้ขอให้ import ให้ ใช้ script ชั่วคราวเรียก `previewInitialImport` / `commitInitialImport` ในนาม Admin (สำรอง DB ก่อนเสมอ)
- **ข้อมูลจริง:** `docs/*.xlsx` และ `backend/backups/` มีข้อมูลองค์กร ห้าม commit (อยู่ใน `.gitignore` แล้ว)

## 4. ข้อควรรู้เรื่องเครื่องนี้ (ประหยัดเวลาลองผิดลองถูก)

| เรื่อง | วิธีที่ใช้ได้ |
|---|---|
| Git ใน Bash tool | ใส่ `export PATH="/c/Program Files/Git/cmd:$PATH"` ก่อนใช้ `git` |
| `docker` ไม่อยู่ใน PATH (เครื่องใหม่) | Docker Desktop ติดตั้งที่ `C:\Users\Suttikarn\AppData\Local\Programs\DockerDesktop\` · ใน PowerShell ให้ใส่ `$env:Path = "C:\Users\Suttikarn\AppData\Local\Programs\DockerDesktop\resources\bin;$env:Path"` ก่อนใช้ `docker` (ต้องใส่ทุกคำสั่ง เพราะ shell state ไม่ค้าง) · `npm run db:up` ก็ต้องใช้ PATH นี้ |
| `npm` / `npx` ใน PowerShell | execution policy บล็อก `npm.ps1` (ตั้งค่าเองไม่ได้ ระบบตรวจสิทธิ์บล็อก `Set-ExecutionPolicy`) ให้ใช้ `npm.cmd` / `npx.cmd` แทน · ใน Bash tool ใช้ `npm` ได้ตามปกติ |
| `claude` CLI | ติดตั้งด้วย `npm.cmd install -g @anthropic-ai/claude-code` และลบ `%APPDATA%\npm\claude.ps1` เพื่อให้ PowerShell ใช้ `claude.cmd` (ถ้าอัปเดตแล้ว error เรื่อง script ให้ลบซ้ำ) · plugin: superpowers, ponytail (ยังไม่ได้ตั้งค่า 4 ค่า), frontend-design · MCP `chrome-devtools` ระดับ user (บน Windows ต้องเป็น `cmd /c npx ...`) |
| Docker Desktop | มักปิดอยู่ตอนเริ่ม session · เปิดด้วย PowerShell `Start-Process "C:\Users\Suttikarn\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"` แล้วรอ `docker info` · container `inventory_db` เปิดเองเมื่อ Docker พร้อม (`docker start` อาจแจ้งว่าพอร์ตถูกใช้ ซึ่งหมายถึงเปิดอยู่แล้ว) · query อ่านอย่างเดียว: `docker exec inventory_db psql -U postgres -d inventory_db -c "..."` |
| heredoc ใน Bash tool | พังบ่อยเมื่อมี backtick หรือ `'` ปนอยู่ ให้ใช้ Write tool เขียนไฟล์ หรือเขียน script `.cjs` ใน scratchpad แล้วรันด้วย `node` · **ห้ามเขียน `cat > file` โดยไม่มี heredoc** (ค้างรอ stdin จนหมดเวลา เคยเกิดซ้ำใน session นี้) |
| แก้ไฟล์ด้วย script | ใช้ `s.replace(a, () => b)` **ห้าม** `s.replace(a, b)` เพราะ `$'` `$&` ในข้อความใหม่ (เช่น regex SQL `'^[0-9]+$'`) จะถูกตีความ และวางส่วนท้ายไฟล์ซ้ำเข้าไป · ตรวจ `git diff --stat` หลังแก้เสมอ |
| ไฟล์ CRLF | ไฟล์ที่ git checkout มาเป็น CRLF ถ้าแก้ด้วย script ให้ `.replaceAll('\r\n', '\n')` ก่อนค้นหาข้อความ · warning "LF will be replaced by CRLF" ตอน commit ไม่ต้องสนใจ |
| `.env` | ห้าม `grep`/`cat` ทั้งไฟล์ (จะแสดงรหัสผ่าน) ให้อ่านเฉพาะ key ที่ต้องใช้ใส่ตัวแปรโดยไม่ echo · login API ด้วยรหัส Admin: อ่าน `SEED_ADMIN_PASSWORD` ใส่ตัวแปร แล้วสร้าง JSON ด้วย `node -e` เขียนลงไฟล์ชั่วคราว ส่งด้วย `curl --data @file` แล้วลบไฟล์ |
| สร้าง migration | `prisma migrate dev` ใช้ไม่ได้ (ไม่ใช่ terminal แบบโต้ตอบ) ให้เขียน `prisma/migrations/<timestamp>_<name>/migration.sql` เอง → `npx prisma migrate deploy` → ตรวจด้วย `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (ต้องได้ empty) → `npx prisma generate` · test DB รัน migrate deploy เองตอนเริ่ม test |
| Playwright กับหน้า zoneless | หลังคลิกให้รอ 300–500 ms หรือรอ response ก่อนอ่าน DOM ไม่งั้นได้ค่าเก่าหรือแถว "กำลังโหลด" · ดาวน์โหลดไฟล์ใช้ `page.waitForEvent('download')` |
| ไม่มี Python | เครื่องนี้ไม่มี `python` ใช้ `node` script แทน · `sed -i` ใช้ได้ใน Bash tool แต่ข้อความไทยหลายบรรทัดใช้ `.cjs` ปลอดภัยกว่า |
| `pg_dump` สำรอง DB | `docker exec inventory_db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > backups/<ชื่อ>-$(date +%Y%m%d-%H%M%S).sql` (ใน Bash tool) |
| `prisma migrate reset` | Prisma ไม่ยอมให้ AI รันเองถ้าไม่ได้รับอนุญาต ต้องถามผู้ใช้ แล้วตั้ง env `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` เป็นข้อความที่ผู้ใช้ตอบตามตัวอักษร · ล้างข้อมูลโดยเก็บโครงสร้างใช้ `TRUNCATE ... RESTART IDENTITY` ทุกตารางยกเว้น `users` และ `_prisma_migrations` (สำรองก่อน) |
| warning ของ pg | `DeprecationWarning: Calling client.query()...` มาจากภายใน `@prisma/adapter-pg` 7.10 ไม่ใช่โค้ดเรา ไม่ต้องแก้ |
| server ทดสอบที่ Claude เปิด | `TaskStop` **ไม่ฆ่า** process ลูกของ `ng serve`/`tsx` ให้ปิดด้วย PowerShell `Get-NetTCPConnection -LocalPort 3001,4300 -State Listen \| % { Stop-Process -Id $_.OwningProcess -Force }` แล้วตรวจว่าพอร์ตว่างก่อนเปิดใหม่ |
| server ของผู้ใช้ | `cd backend && npm run dev` และ `cd frontend && npm start` (3000/4200) ทั้งคู่โหลดโค้ดใหม่เองเมื่อสลับ branch · session 2026-10-26 Claude เปิดทั้งสองตัวไว้เบื้องหลังให้ผู้ใช้ดูเว็บ |
| scratchpad | ถูกล้างระหว่าง session ไฟล์ทดสอบที่ต้องใช้ซ้ำต้องสร้างใหม่ |
| Material autocomplete + `requireSelection` | ค่าใน form control ไม่เปลี่ยนระหว่างพิมพ์ ตัวกรองต้องอ่านจาก `(input)` ของช่อง ไม่ใช่ `valueChanges` |

## 5. วิธีทดสอบที่ใช้มา

- **BE:** `cd backend && npm test` ใช้ DB `inventory_test` (ห้ามชี้ไป DB จริง) ตอนนี้ **76 ข้อ** · test ที่ต้องการรายการเบิกใช้ `withdraw(username, body)` ใน `test/helpers.ts` (สร้างคำขอแล้วให้คนอื่นอนุมัติ) · รับคืนอยู่ใน `test/returns.test.ts`
- **FE:** `cd frontend && npm test -- --watch=false` (17 ข้อ: mock + ช่องเซ็นชื่อ + payload รับคืน) และ `npx ng build`
- **Playwright กับปุ่มที่ชื่อซ้ำบางส่วน:** `getByRole('link', { name: 'อนุมัติ' })` จะเจอเมนู "คำขอเบิก" ที่มีป้าย "รออนุมัติ" ด้วย ให้ใส่ `exact: true`
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
