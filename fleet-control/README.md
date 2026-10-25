# Fleet Studio

**Online-status update:** Sync reads the status of every discovered cloud device automatically. Existing `detailDeviceIds` lists no longer restrict reading, and account identity comes from connector configuration. See [updating another computer](docs/AUTOMATIC-STATUS.md). Write permissions remain separate and unchanged.

A runnable Thai/English workspace for screen fleets, with a compact editor inspired by Figma’s panel layout. This is a new application—not the discarded mockup and not a skin injected into Xiaohui.

**Current release: local acceptance build. Real Xiaohui / physical-screen acceptance is still pending.**

## Open it on this computer

1. Double-click **Start Fleet Studio.cmd** in this folder.
2. Your browser opens **http://127.0.0.1:4178**.
3. Create your own owner account. This password belongs to Fleet Studio, not Xiaohui.
4. Build programs and upload files immediately. No real screen is connected automatically.
5. For a safe rehearsal, open **Settings → Start training workspace**. Training is clearly marked everywhere and affects only simulated players.

To stop the app and background worker, double-click **Stop Fleet Studio.cmd**. Your data stays saved.

The email is a local sign-in identifier; this app does not send signup or verification emails.

On this machine, Node.js and dependencies are already installed. On another Windows machine, install Node.js 24 first. The launcher installs missing packages and builds the interface. Do not expose the first-run owner-creation page to the public internet.

## เปิดใช้งาน

1. ดับเบิลคลิก **Start Fleet Studio.cmd**
2. เปิด **http://127.0.0.1:4178** แล้วสร้างบัญชีเจ้าของของคุณเอง
3. กด **ภาษาไทย** ที่แถบซ้ายเพื่อเปลี่ยนภาษา
4. สร้างโปรแกรมและอัปโหลดสื่อได้เลย ระบบยังไม่เชื่อมต่อหรือสั่งจอจริงโดยอัตโนมัติ
5. ทดลองได้ที่ **ตั้งค่า → เริ่มพื้นที่ฝึกใช้งาน** ซึ่งใช้จอจำลองเท่านั้น
6. ใช้ **Stop Fleet Studio.cmd** เพื่อปิดระบบ ข้อมูลที่บันทึกไว้จะไม่หาย

## What works locally

- Real accounts, session cookies and owner/editor/operator/reviewer/viewer permissions.
- Durable database, media files, program revisions, audit history and a separate background worker.
- Groups/subgroups, device moves and renames through queued operations in training mode.
- Screen search, filtering, exact bulk selection and hover/focus settings with observation timestamps.
- Image/video/audio/PDF uploads, content-type checks, duplicate detection, media review and folders.
- Program editor: screen layouts, layers, text, images, videos, media ordering, geometry, visibility, locking, undo/redo, preview and saved revisions.
- Clear program content without deleting the program, dimensions, shared files, playback or power schedules.
- Separate library archive/restore and confirmed removal from selected screens.
- Weekly power schedules, overnight periods, timezone-aware next events, overlap validation and per-target results.
- Playlists, binding targets, playback-schedule data, program review and optional second-person publish approval.
- Append/replace publish jobs with frozen targets/content versions, idempotency, leases, unknown-result handling and automatic pause after repeated failures.
- A Playwright connector framework with encrypted login state, account checking, commissioned selector recipes, complete paginated fleet reads and read-back assertions.

Training verifies this application’s logic. It does **not** establish Xiaohui compatibility or physical playback. Advanced widgets and program types retain editable draft data, but their actual player rendering is not implemented/validated here. See **docs/STATUS.md** for the precise boundary.

## The sequence you requested

**Build the application → connect the test fleet → test each function.**

The local build and automated rehearsal are available now. The next integration step needs the dedicated test account/player and observed Xiaohui controls. We have not borrowed your existing browser session, invented selectors, sent live power commands or published to a real screen.

Use a separate clean data directory for the real fleet; do not turn training records into real devices. Follow **docs/CONNECT-TEST-FLEET.md** when ready.

## For development

```powershell
npm ci
npm run build
npm start
```

Run `npm run worker` in a second terminal. Open port 4178. For hot frontend development, run `npx vite` separately and use port 5173; set `PUBLIC_ORIGIN=http://127.0.0.1:5173` for API write-origin checks during that development session.

```powershell
npx playwright install chromium
npm test
npm run test:browser
npm audit
```

Browser tests use a fresh, temporary workspace on port 4179 and a real local worker. They never open Xiaohui. Do not point these tests at a real fleet.

## Where information is stored

- `.data/postgres`: embedded PostgreSQL database (PGlite). No Docker is required locally.
- `.data/uploads`: original media bytes.
- `.data/trash`: recoverable bytes of unreferenced files removed from the library.
- `.data/secrets`: local worker credential and authentication encryption key. Keep private.
- `.data/xiaohui-auth.enc`: encrypted dedicated browser session, only after you explicitly connect.
- `.data/runtime`: owned application process records and logs.
- `backups`: stopped-workspace backups, created only when you run the backup command.

The JSON export in Settings is for inspection, **not** a full restore backup. See **docs/OPERATIONS.md** before backup, migration, hosting or production rollout.

## Architecture

```text
Thai/English browser UI
        │ authenticated requests
        ▼
API + durable PostgreSQL data + uploaded files
        │ frozen jobs / protected worker API
        ▼
One serialized background worker per account
        ├── training provider (simulated screens only)
        └── Playwright → Xiaohui → read-back checks (commissioning required)
```

The web interface never contains Xiaohui passwords or reusable cookies. A completed cloud job is not automatically proof that a physical screen displayed the expected pixels.

This cannot be deployed as only a static Sites page: the database, private files and persistent Chromium worker need a running backend. Container deployment files are included as a starting point, but a production host has not been provisioned or tested.
