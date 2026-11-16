# stokd Launch Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give stokd real accounts and multi-device sync on a free backend, keep it offline-first, and slim and update the frontend toolchain.

**Architecture:** A Hono API (`server/`) on SQLite, behind a two-method database adapter so the same code runs on Cloudflare D1 and on `node:sqlite`. The web app gets a framework-free store engine (`src/store/`) that applies changes locally, queues them in an outbox and syncs through `POST /api/sync`. React reads the engine through `useSyncExternalStore`.

**Tech Stack:** Node 24, Hono 4, zod 4, `node:sqlite`, Cloudflare Workers + D1 (wrangler 4), React 18, Vite 8, Vitest, Testing Library, fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-11-16-launch-backend-design.md`

## Global Constraints

- Free only: no paid service, no SMS or email provider, no API key required to run.
- The app must work fully offline, and without any account ("local mode"), exactly as today.
- Server code may use only what both runtimes have: Web Crypto, `fetch` types, Hono. No Node-only APIs outside `server/src/node.js` and `server/src/db/node.js`.
- All SQL writes go through `db.batch()`; no read-then-write logic between statements (D1 has no interactive transactions).
- Password KDF is fixed: PBKDF2-HMAC-SHA256, salt `"stokd:v1:" + login`, 600,000 rounds, 32 bytes, base64url.
- Limits: 25 ops per sync, 100 rows per `import` op, 500 rows per table per pull, 1 MB bodies, JWT 60 days.
- English, Telugu, Hindi and Marathi must have identical key sets.
- No secrets in the repo. The only secret is `JWT_SECRET`.
- `src/store/*` must not import React, i18n or `import.meta.env`.
- Run `npm test` (root) before each commit; it must be green.

## Review Focus

1. **A response is lost after the server applied the changes.** Expect: the device resends, stock is reduced once. → Task 9 test `resending after a lost response does not double count`.
2. **IndexedDB is unavailable or full** (private window, quota). Expect: the app says so and keeps working in memory. → Task 8 test `falls back to memory and reports when IndexedDB fails`.
3. **A long offline day: 300 pending sales.** Expect: sync drains in pages of 25 without losing order. → Task 9 test `drains a large outbox in order`.
4. **An older app version sends a change the server does not know.** Expect: it is rejected with a reason, the rest are accepted, and the device drops it and reports it. → Task 5 test `rejects an unknown op but applies the others`; Task 9 test `drops a rejected op and reports it`.
5. **The device clock is wrong by days.** Expect: bills still sync and appear. → Task 6 test `a bill dated in the future is still returned`.

---

## File map

```
shared/auth.js                 normalizeLogin, deriveAuthKey (web + server + tests)
server/package.json            type: module; hono, zod, @hono/node-server; wrangler (dev)
server/migrations/0001_init.sql
server/src/app.js              createApp(resolve) → Hono
server/src/config.js           readConfig(env) → Config
server/src/db/node.js          openNodeDb(path), migrate(db, dir)
server/src/db/d1.js            d1Db(binding)
server/src/auth.js             hashing, tokens, attempts, routes
server/src/ops.js              parseOp, statementsFor
server/src/sync.js             sync route: push + pull
server/src/team.js             team routes
server/src/node.js             Node entry (API + static files)
server/src/worker.js           Cloudflare entry
server/wrangler.jsonc
server/scripts/smoke.mjs       end-to-end check against any URL
server/test/*.test.js          node --test
src/store/ids.js               deviceCode, billNo, ids
src/store/ops.js               applyOp, emptyData
src/store/merge.js             mergeChanges
src/store/storage.js           openStorage, memoryStorage
src/store/legacy.js            readLegacy, clearLegacy
src/store/api.js               createApi(baseUrl, fetchImpl)
src/store/engine.js            createEngine(deps)
src/context/InventoryContext.jsx   React binding (same hook API as today) + useAccount
src/components/account/*       AccountButton, AccountModal
```

---

### Task 1: Remove dead code and unused packages

**Files:** delete every file the import audit reports unreachable from `src/main.jsx` (54 files under `src/api`, `src/services`, `src/utils`, `src/components/{analytics,auth,bills,checkout,customers,products,profile,reports,scanner}`, `src/components/common/{FileUploader,Table}.jsx`, `src/components/layout/{Sidebar,MainLayout,AuthLayout}.jsx`, `src/context/CartContext.jsx`, `src/locales/{en,hi,mr,te}/translation.json`, `src/App.jsx`, `src/PrivateRoute.jsx`), and `electron/`. Modify `package.json`, `tailwind.config.js` → `tailwind.config.cjs`, `src/index.css` (drop datepicker and legacy rules).

- [ ] Remove packages: `axios barcode-detector html5-qrcode jwt-decode react-countup react-datepicker react-qr-code recharts electron electron-builder @tailwindcss/aspect-ratio`. Add `zxing-wasm` as a direct dependency. Remove the `electron:*` scripts, `main` and `build` fields. Add `"type": "module"`.
- [ ] Verify: the audit script reports `deadFiles: 0`, `depsNotImportedFromSrc: ["vite-plugin-pwa"]`, `importedButNotDeclared: []`; `npm run build` succeeds.
- [ ] Commit.

### Task 2: Update the toolchain and add test tooling

**Files:** `package.json`, `vite.config.mjs`, `vitest.config.mjs` (new), `src/test/setup.js` (new).

- [ ] Upgrade `vite@8`, `@vitejs/plugin-react@6`, `vite-plugin-pwa@2`; take in-range updates for the rest. If Vite 8 breaks the build, fall back to `vite@7` and record why.
- [ ] Add dev packages `vitest jsdom @testing-library/react @testing-library/user-event fake-indexeddb`. `vitest.config.mjs`: two projects, `node` (`src/store/**/*.test.js`, `shared/**/*.test.js`) and `ui` (`src/**/*.test.jsx`, jsdom, setup file).
- [ ] Scripts: `"test": "npm run test:server && vitest run"`, `"test:server": "node --test server/test/"`.
- [ ] Verify: `npm run build` succeeds; `vite preview` serves Home with no console errors and the service worker registers; the barcode engine warms up (no wasm 404).
- [ ] **Toast without framer-motion.** Test first, `src/context/ToastContext.test.jsx`: `shows a message and removes it after 3 seconds` (render provider, call `showToast('Saved')`, expect text present; advance fake timers 3000 ms; expect absent) and `error toasts have role alert`. Run: passes against the current code except the role assertion (RED on that). Replace framer-motion with a CSS class `toast-in`; add `role="alert"` for errors and `role="status"` otherwise. Run: green. Remove `framer-motion`.
- [ ] Commit.

### Task 3: Server skeleton, database adapters, health

**Files:** `server/package.json`, `server/migrations/0001_init.sql`, `server/src/{app.js,config.js,db/node.js,db/d1.js}`, `server/test/{helpers.js,health.test.js,db.test.js}`.

**Interfaces (produces):**
- `Stmt = { sql: string, args?: unknown[] }`; `Db = { batch(stmts: Stmt[]): Promise<{ rows: object[], changes: number }[]>, query(sql, args?): Promise<object[]> }`
- `openNodeDb(path: string): Db & { exec(sql): void, close(): void }`; `migrate(db, dir): string[]` (names applied)
- `d1Db(binding): Db`
- `Config = { jwtSecret: string, allowedOrigins: string[], signupCode: string|null, version: string }`; `readConfig(env): Config` (throws if `JWT_SECRET` is missing or shorter than 32 chars)
- `createApp(resolve: (c) => { db: Db, config: Config, now: () => number, ip: string }): Hono`
- `helpers.js`: `makeApp(overrides?) → { app, db, config, clock }`, `call(app, method, path, { body, token }) → { status, json }`

- [ ] Tests first: `health returns ok and the version`; `unknown routes return a JSON 404`; `a failing statement rolls the whole batch back` (insert + invalid SQL, expect first insert absent); `migrate applies each file once`; `undefined arguments are stored as NULL`.
- [ ] Run `node --test server/test/`: fails (modules missing). Implement. Run: green.
- [ ] Commit.

### Task 4: Accounts

**Files:** `shared/auth.js`, `shared/auth.test.js`, `server/src/auth.js`, `server/test/auth.test.js`; modify `server/src/app.js`.

**Interfaces (produces):**
- `normalizeLogin(raw: string): string | null`: trims and lowercases; an email must match `x@y.z`; a phone is reduced to digits and, if longer than 10 and starting `91`, to its last 10; anything else (or fewer than 10 digits) is `null`.
- `deriveAuthKey(login: string, password: string, iterations = 600000): Promise<string>` (43 base64url chars)
- Server: `hashAuthKey(authKey, salt?) → Promise<{ salt, hash }>`, `verifyAuthKey(authKey, salt, hash) → Promise<boolean>`, `signToken({ userId, shopId, tokenVersion }, secret, now) → Promise<string>`, `readToken(token, secret, now) → Promise<{ userId, shopId, tokenVersion, iat } | null>`, `requireUser` middleware setting `c.var.user = { id, shopId, role, name, login }`
- Routes and bodies as in the spec. `signup` body: `{ shopName, name, login, authKey, deviceId, deviceName?, signupCode? }`. Responses carry `user: { id, name, login, role }`, `shop: { id, name }`, `device: { id, no, counters }`.
- Error codes: `invalid_input` 400, `bad_credentials` 401, `unauthorized` 401, `forbidden` 403, `signup_closed` 403, `login_taken` 409, `too_many_attempts` 429.
- `helpers.js` gains `signup(app, { login?, shopName?, deviceId? }) → { token, user, shop, device, recoveryCode, authKey }` using `deriveAuthKey(login, password, 1000)`.

- [ ] Tests first (`shared/auth.test.js`): `"+91 98765 43210" and "9876543210" normalise to the same login`; `emails are lowercased`; `rejects "abc" and "12345"`; `deriveAuthKey is deterministic, 43 chars, and differs by login`.
- [ ] Tests first (`server/test/auth.test.js`): `signup creates a shop, an owner and device 1`; `the recovery code looks like XXXX-XXXX-XXXX-XXXX`; `a second signup with the same login is refused (409 login_taken)`; `login with the right key returns a token`; `login with a wrong key is refused (401 bad_credentials)`; `the 9th failed login in 15 minutes is refused (429) even with the right key, and works again after 15 minutes`; `the 6th signup from one IP in an hour is refused (429)`; `recover sets a new password, returns a new code, and the old code and old token stop working`; `changing the password needs the current one and signs other tokens out`; `signup is refused without the code when SIGNUP_CODE is set (403 signup_closed)`; `a malformed body is refused (400 invalid_input)`; `an expired token is refused (401)`; `a second device logging in gets device 2`.
- [ ] Run: red. Implement. Run: green. Commit.

### Task 5: Sync, sending changes

**Files:** `server/src/ops.js`, `server/src/sync.js`, `server/test/sync-push.test.js`.

**Interfaces (produces):**
- `parseOp(raw): { ok: true, op } | { ok: false, id: string|null, reason: string }` (zod; unknown `type` → reason `unknown_type`)
- `statementsFor(op, ctx: { shopId, userId, deviceId, role, now }): Stmt[] | { rejected: string }` (role failures → `forbidden`)
- `POST /api/sync` request `{ deviceId, since, billsSince?, counters?, ops }`; response fields `accepted: string[]`, `rejected: { id, reason }[]`.
- Op payloads (all carry `id`, `type`, `at`): `sale { bill: { id, billNo, at, total, payment, items: [{ productId, name, names?, code?, qty, price, total }] } }`; `stock.move { lines: [{ productId, delta }], reason, invoice?: { id, supplier, invoiceNo, dateText, units, count, at } }`; `product.create { product }`; `product.update { productId, patch }` (allowed keys `name names aliases code barcode category price min coverDays needsReview`); `product.delete { productId }`; `po.create { po: { id, poNo, supplier, status, items, createdAt } }`; `po.update { poId, patch }` (allowed `supplier status items`); `po.receive { poId, lines, changes }`; `po.delete { poId }`; `shop.update { name }`; `import { products?, bills?, purchaseOrders?, invoices? }`.
- Staff may not send `shop.update`, `product.delete`, `import`.
- `helpers.js` gains `sync(app, token, { deviceId, since?, ops? }) → json`, `stockOf(db, shopId, productId)`, and op builders `saleOp(lines)`, `createProductOp(fields)`.

- [ ] Tests first: `a sale reduces stock and stores the bill`; `sending the same sale twice reduces stock once`; `sales from two devices both count`; `stock can go below zero`; `stock.move adds stock and records the invoice`; `product.create adds a product; creating the same id twice keeps the first`; `product.update changes only the listed fields`; `product.delete hides the product; staff cannot delete (rejected forbidden)`; `po.receive adds stock once even when two devices receive the same order`; `po.update is ignored after the order is received`; `po.delete only removes drafts`; `import adds rows and leaves existing ones alone`; `shop.update renames the shop; staff cannot`; `rejects an unknown op but applies the others`; `more than 25 ops is refused (400)`; `a request without a token is refused (401)`; `one shop cannot change another shop's stock`.
- [ ] Run: red. Implement. Run: green. Commit.

### Task 6: Sync, receiving changes

**Files:** modify `server/src/sync.js`; `server/test/sync-pull.test.js`.

**Interfaces (produces):** response `{ cursor: number, more: boolean, changes: { products: Product[], bills: Bill[], purchaseOrders: Po[], invoices: Invoice[] }, shop: { id, name }, user, device: { id, no, counters }, token?: string }`. Row shapes are camelCase with JSON columns parsed; products carry `deleted: true` only when deleted. `PAGE = 500`.

- [ ] Tests first: `the first sync returns every product and the cursor`; `a second sync with that cursor returns nothing`; `another device's sale comes back as one bill and the changed products only`; `a deleted product is reported once to devices that knew it and never to a new device`; `bills older than billsSince are not returned`; `a bill dated in the future is still returned`; `1,200 imported bills arrive over several pages with none lost or repeated`; `rows of another shop are never returned`; `counters sent by a device are returned at its next login`; `a token older than a day is replaced`; `an idle sync writes nothing` (assert no row in any table changed: compare `total_changes()` before and after).
- [ ] Run: red. Implement. Run: green. Commit.

### Task 7: Team, CORS and limits

**Files:** `server/src/team.js`, `server/test/team.test.js`, `server/test/limits.test.js`; modify `server/src/app.js`.

- [ ] Tests first: `the owner adds a staff login and the staff member can sign in and sync`; `staff cannot list or add team members (403)`; `disabling a staff member stops their token`; `the owner can reset a staff password`; `the owner cannot disable or demote themselves`; `a login already in use is refused (409)`; `preflight from an allowed origin is answered with that origin`; `a request from another origin gets no CORS header`; `a body over 1 MB is refused (413)`.
- [ ] Run: red. Implement. Run: green. Commit.

### Task 8: Store data logic and storage

**Files:** `src/store/{ids,ops,merge,storage,legacy}.js` and matching `*.test.js`; `src/data/seed.js` (seed history becomes seed bills).

**Interfaces (produces):**
- `deviceCode(no: number): string` (1→`A`, 26→`Z`, 27→`AA`; 0→`''`); `billNo(code, n)`, `billId(code, n)` (`B` + billNo), `productId(code, n)`, `poId(code, n)`
- `Data = { products: Product[], bills: Bill[], purchaseOrders: Po[], invoices: Invoice[], shop: { name: string } }`; `emptyData(): Data`
- `applyOp(data: Data, op): Data` (pure; returns the same object when nothing changes)
- `mergeChanges(data: Data, changes, { billsSince }): Data`
- `Dataset = { data: Data, outbox: Op[], cursor: number, counters: { bill, po, sku }, device: { id, no } }`
- `openStorage(factory?): Promise<Storage>`, `memoryStorage(): Storage`; `Storage = { kind: 'idb'|'memory', load(id): Promise<Dataset|null>, save(id, dataset, prevBills?): Promise<void>, drop(id): Promise<void> }`
- `readLegacy(ls): Dataset | null`, `clearLegacy(ls): void`
- `seedDataset(now): Dataset` in `src/data/seed.js`

- [ ] Tests first (`ids`, `ops`, `merge`): `device 1 is A, 26 is Z, 27 is AA`; `local bills are numbered 1025, account bills A1025`; `a sale reduces each product and puts the bill first`; `applying the same sale twice changes nothing the second time`; `stock.move with an unknown product is ignored`; `product.update changes only the patch fields`; `po.receive adds stock once`; `import skips ids that already exist`; `merge replaces rows by id, removes deleted products, keeps bills newest first and drops bills older than billsSince`.
- [ ] Tests first (`storage`, with `fake-indexeddb`): `a saved dataset loads back identical`; `saving again writes only changed bills` (count `put` calls through a wrapped factory); `drop removes it`; `falls back to memory and reports when IndexedDB fails` (factory whose `open` errors → `kind === 'memory'`).
- [ ] Tests first (`legacy`): `old sr2 keys become a dataset: products kept, bills kept, history lines grouped into one seed bill per day, counters taken from sr2_meta`; `returns null when there is nothing to migrate`.
- [ ] Run `vitest run`: red. Implement. Run: green. Commit.

### Task 9: Store engine

**Files:** `src/store/api.js`, `src/store/engine.js`, `src/store/engine.test.js`.

**Interfaces:**
- Consumes: Task 8 modules; server `createApp`, `openNodeDb`, `migrate` (tests only).
- `createApi(baseUrl: string, fetchImpl = fetch) → { health(), signup(body), login(body), recover(body), changePassword(token, body), sync(token, body), team.list(token), team.add(token, body), team.update(token, id, body) }`; failures throw `ApiError { status, code, message }`; network failures throw `ApiError { status: 0, code: 'network' }`.
- `createEngine({ storage, api, sessionStore, now, makeId, seed, deviceName }) → Engine`
- `Engine = { start(): Promise<void>, getSnapshot(): Snapshot, subscribe(fn): () => void, dispatch(type, payload): Op, takeNumber(kind: 'bill'|'po'|'sku'): { n, code }, signUp({ shopName, name, login, password, keepDeviceData }): Promise<{ recoveryCode }>, signIn({ login, password }): Promise<void>, recover({ login, recoveryCode, password }): Promise<{ recoveryCode }>, signOut(): Promise<void>, syncNow(): Promise<void>, resetLocal(): Promise<void>, stop(): void }`
- `Snapshot = { ready: boolean, mode: 'local'|'account', data: Data, account: { user, shop, device } | null, storage: 'idb'|'memory', sync: { status: 'off'|'idle'|'syncing'|'offline'|'error'|'auth', pending: number, lastSyncAt: number|null, error: string|null, rejected: { id, type, reason }[] } }`
- `sessionStore = { get(): Session|null, set(Session|null) }` (localStorage in the app, an object in tests)
- Timers are injected: the engine never calls `setInterval` itself; `engine.tick()` is called by the React layer every 20 s and on `online`/`visibilitychange`. `dispatch` schedules a sync through an injected `defer(fn, ms)`.

- [ ] Tests first: `in local mode a sale is saved and is still there after a restart`; `signing up and keeping device data uploads products and bills, and a second device sees them`; `signing up empty gives an empty shop on every device`; `a sale on device A shows on device B with the same stock on both`; `two devices selling offline converge to the right stock`; `a change made offline survives a restart and is sent once`; `resending after a lost response does not double count`; `drains a large outbox in order` (300 sales, 25 per request); `drops a rejected op and reports it`; `a 401 sets status auth and keeps the outbox`; `signing out keeps unsent changes and signing back in uploads them`; `bill numbers continue after signing out and in`; `signing in on a device does not touch its local-mode data`.
- [ ] Run: red. Implement. Run: green. Commit.

### Task 10: React binding

**Files:** rewrite `src/context/InventoryContext.jsx`; `src/context/InventoryContext.test.jsx`; modify `src/main.jsx`, `src/components/{billing/Billing,inventory/AddStock,inventory/Inventory,invoice/SupplierInvoice,orders/PurchaseOrders,dashboard/Dashboard,layout/SettingsModal}.jsx`, `src/lib/settings.js`.

**Interfaces (produces):**
- `InventoryProvider({ engine?, children })` (creates the real engine when none is passed)
- `useInventory()` keeps today's fields (`products, sales, bills, purchaseOrders, stats, lowStockProducts, totalInventoryValue, nextBillNo, byId, findByBarcode, findByCode, checkout, receiveStock, revertStock, addProduct, updateProduct, createPO, updatePO, deletePO, receivePO, resetDemo`) and adds `invoices`, `shopName`, `setShopName`, `mode`.
- `useAccount()` → `{ ready, mode, account, sync, storage, apiAvailable, signUp, signIn, recover, signOut, syncNow, team }`
- `sales` is derived from `bills` (`{ id, billId, productId, productName, qty, price, total, date }` per item).

- [ ] Tests first: `shows a loading state, then the app`; `tapping a quick button and paying reduces stock and shows before and after`; `a sale that takes a product to its minimum raises a low-stock toast`; `receiving a supplier invoice adds stock and records it in history`; `undo after an automatic add restores stock`; `a second tab is told the app is already open` (stub `navigator.locks.request` to report unavailable).
- [ ] Run: red. Implement. Run: green; `npm run build`; open the app and click through every page. Commit.

### Task 11: Account screens and translations

**Files:** `src/components/account/{AccountButton,AccountModal}.jsx` and tests; modify `src/components/layout/AppShell.jsx`, `src/locales/app/{en,te,hi,mr}.js`, `src/locales/app/locales.test.js`, `src/styles/pos.css`.

- [ ] Tests first: `all four languages have the same keys`; `the sign-in form reports a wrong password in words`; `creating an account shows the recovery code and will not close until it is acknowledged`; `the account button says Offline with the number of waiting changes`; `the account button says Synced after a sync`; `when the API cannot be reached the modal says cloud sync is not set up`; `the owner sees the team list and can add a staff login; staff do not see it`.
- [ ] Run: red. Implement (new `account.*` and `sync.*` strings in all four languages). Run: green. Commit.

### Task 12: Deployment

**Files:** `vite.config.mjs` (base from `BASE_PATH`), `server/src/{node.js,worker.js}`, `server/wrangler.jsonc`, `server/scripts/{smoke.mjs,cloudflare-setup.mjs}`, `.env.example`, `README.md`, `docs/LAUNCH.md`, `.gitignore`.

- [ ] `BASE_PATH` drives Vite `base` and every manifest path (default `/retail-pro-prototype/`). Scripts: `build` (Pages), `build:app` (`BASE_PATH=/`, output `server/public`), `dev:api`, `start` (Node server), `launch` (build:app → migrations → `wrangler deploy`).
- [ ] `server/src/node.js`: reads env (`PORT` 8787, `DATABASE_PATH` `server/data/stokd.db`, `JWT_SECRET`; in development it creates and stores one in `server/data/dev-secret`), runs migrations, serves `/api/*` and `server/public` with SPA fallback.
- [ ] `smoke.mjs <baseUrl>`: health → signup → sale → second device login → pull shows the sale → duplicate send → stock reduced once. Exit code 0 only if every step passes.
- [ ] Verify: `npm run start` + `node server/scripts/smoke.mjs http://localhost:8787` passes; `npx wrangler dev` + the same smoke script passes; `npm run build` (Pages) still succeeds.
- [ ] Write `docs/LAUNCH.md` (three ways to run it; the Cloudflare steps the owner must do themselves) and update `README.md`.
- [ ] Commit.

### Task 13: End-to-end check in a browser

- [ ] With the Node server running: create an account keeping device data; make a sale; open a second browser profile, sign in, confirm the sale and stock; sell on both with the server stopped; start it; confirm both show the same stock. Repeat the sale flow in Telugu. Check phone width.
- [ ] Fix anything found (test first), run `npm test`, commit, push, open a PR.
