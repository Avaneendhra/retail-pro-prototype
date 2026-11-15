# stokd launch: backend, sync and tool refresh

Date: 2026-11-16 · Owner's decision: "Go, build it" (the recommended approach, without a design discussion)

## Why

stokd works today as a browser-only prototype: a shop's data lives in one browser. To launch it, a shop needs accounts, the same data on every phone and laptop, sales that are never lost or counted twice, and running costs of zero. The owner also asked for every tool in the project to be re-checked and replaced where something better exists.

## Goals

1. **Accounts.** A shop signs up. The owner can add staff logins.
2. **One shop, many devices.** Stock, bills and orders are the same everywhere, including after working offline.
3. **Free to run**, on hosting that does not sleep.
4. **No silent data loss** on the device.
5. **A smaller, current, tested codebase.**

## Not in this round

Customers and loyalty, GST invoices, online payments, email or SMS (they cost money), push notifications, live websockets (checking every 20 seconds is enough), a Play Store build, and importing data from the old Java backend (it holds none that belongs to the owner).

## What must never happen

- A sale disappears, or is counted twice, because two devices synced.
- The app stops working when the internet drops.
- Saving fails without telling anyone.
- Something needs a paid plan to keep running.

## What the audit found (2026-11-15)

- The old backend is three services: Spring Boot 3.5 (Java 17), MongoDB and a Flask analytics app. Its database, mail and hosting details are placeholders or belong to the original project. Java is not installed on the build machine.
- It has no supplier invoices, purchase orders, barcodes or short codes. Its `/api/sync/pending` writes each device's stock count as an absolute number, so the last device to sync wins.
- Free hosting for it (Render) stops after 15 idle minutes and takes about a minute to wake; its disk is wiped on restart.
- The app keeps everything in `localStorage` (about 5 MB) and swallows write errors, so saving fails silently once it is full.
- 54 of 87 source files are unreachable from `src/main.jsx`. Eight packages are installed but unused. `zxing-wasm` is used but not declared. Electron (375 MB) cannot open the current build because asset paths are absolute.
- Vite 4 is end-of-life; Vite 8 is current.

## Approaches considered

| | A. New single API (chosen) | B. Extend the Java backend | C. Firebase or Supabase |
|---|---|---|---|
| What it is | One small JavaScript service (Hono) on SQLite | Spring Boot + MongoDB, plus new endpoints | A hosted database and login service, no server of our own |
| Free hosting | Cloudflare Workers + D1: no sleeping, 100,000 requests a day | Render: sleeps after 15 minutes; needs a MongoDB Atlas account too | Firebase is generous; Supabase pauses a free project after a week idle |
| Can be built and tested here | Yes, fully (Node 24 has SQLite built in) | Only after installing Java or starting Docker | Not locally: the Firebase emulator needs Java |
| Work needed | New, but small and shaped for this app | A rewrite of sync, plus invoices, orders and codes | Security rules and vendor-specific code throughout the app |
| Lock-in | None: runs on Cloudflare or any Node host | None | High |

**A was chosen** because it is the only one that is free, never sleeps, can be verified end to end before launch, and stays portable.

## Tool decisions

| Area | Before | Now | Why |
|---|---|---|---|
| Backend | Spring Boot + MongoDB + Flask (3 services) | One Hono API | One language across the project; a fraction of the moving parts |
| Database | MongoDB Atlas (not the owner's) | SQLite: Cloudflare D1, or a file on a Node server | Free, transactional, nothing to administer |
| API hosting | Render free tier | Cloudflare Workers (or any Node host) | Free and never sleeps |
| Sync | Whole records, last write wins | Idempotent changes with stock as plus/minus amounts | Two devices can sell at once without losing sales |
| Login | Spring Security + Google OAuth placeholders | Phone or email + password, with a recovery code | Free: no SMS or email service needed |
| Data on the device | `localStorage` | IndexedDB, plus a queue of unsent changes | No 5 MB limit; errors are surfaced |
| Build tool | Vite 4 | Vite 8 | Vite 4 no longer gets fixes |
| Barcode scanning | html5-qrcode | zxing-wasm (done earlier) | Reads blurred, small and tilted codes |
| Label reading | Tesseract.js | Tesseract.js (kept) | Still the lightest free on-device option; PaddleOCR via ONNX is the candidate to test next |
| Animations | framer-motion (toasts only) | CSS | Removes a large package used for one fade |
| Charts, HTTP, dates, QR | recharts, axios, react-datepicker, react-qr-code, react-countup, jwt-decode | Removed | Only used by unreachable code |
| Desktop app | Electron | Installable PWA | Electron build is broken and 375 MB; the PWA installs on desktop and phone |
| Tests | None | `node --test` for the API, Vitest for the app | Sync logic must be provable |
| UI, routing, CSS, search, languages | React 18, React Router 6, Tailwind 3, Fuse.js, i18next | Kept | Working and maintained; major upgrades add risk without user benefit |

## How it fits together

```
Phone or laptop (installable web app, works offline)
  React screens
    └─ store engine ── local copy in IndexedDB + queue of unsent changes
                         │  POST /api/sync   (HTTPS, JSON, bearer token)
                         ▼
  API (Hono)  ── accounts ── sync ── SQLite (D1 on Cloudflare, file on Node)
```

Repository layout: the web app stays at the repo root; the API lives in `server/`; code both sides need lives in `shared/`.

## Data model (SQLite)

Every table is scoped by `shop_id`.

- `shops(id, name, seq, created_at)`. `seq` is the shop's change counter.
- `users(id, shop_id, login UNIQUE, name, role 'owner'|'staff', pass_salt, pass_hash, recovery_hash, token_version, disabled, created_at)`
- `devices(shop_id, id, device_no, name, counters JSON, last_seen)`
- `products(shop_id, id, code, barcode, name, names JSON, aliases JSON, category, price, min, cover_days, quantity, needs_review, deleted, created_at, seq)`
- `bills(shop_id, id, bill_no, at, total, payment JSON, items JSON, user_id, device_no, seed, seq)`
- `purchase_orders(shop_id, id, po_no, supplier, status, items JSON, changes JSON, created_at, received_at, deleted, seq)`
- `invoices(shop_id, id, supplier, invoice_no, date_text, units, count, at, seq)`
- `ops(shop_id, id, type, payload JSON, at, received_at, user_id, device_id, applied)`: every change ever accepted; doubles as the audit log.
- `auth_attempts(key, at)`

Rows that sync carry `seq`: the shop counter at their last change. Indexes on `(shop_id, seq)`.

## API

All bodies are JSON. Errors are `{ "error": { "code", "message" } }`.

| Route | Who | Does |
|---|---|---|
| `GET /api/health` | anyone | `{ ok, version, time }` |
| `POST /api/auth/signup` | anyone | Creates shop + owner + device. Returns `token, user, shop, device, recoveryCode` |
| `POST /api/auth/login` | anyone | Returns `token, user, shop, device` |
| `POST /api/auth/recover` | anyone | `login, recoveryCode, authKey` → new password, new recovery code |
| `POST /api/auth/password` | signed in | Change own password |
| `POST /api/sync` | signed in | Send changes, receive changes (below) |
| `GET/POST /api/team`, `PATCH /api/team/:id` | owner | List, add, disable, rename, reset staff |

### Passwords

The browser stretches the password before sending it: `authKey = PBKDF2-HMAC-SHA256(password, "stokd:v1:" + login, 600,000 rounds, 32 bytes)`, base64url. The server stores `SHA-256(random 16-byte salt + authKey)` and never sees the password. This gives the strength of 600,000-round PBKDF2 while keeping server CPU near zero, which matters because Cloudflare's free plan allows 10 ms of CPU per request and a 100,000-round hash measured 14 ms.

Recovery codes are random 80-bit values shown once at sign-up; only their SHA-256 is stored.

### Tokens

HS256 JWT, 60 days, carrying user id, shop id and `token_version`. A sync response includes a fresh token once the current one is a day old. Changing a password or disabling a user bumps `token_version`, which signs every device out.

### Limits

8 failed logins per login per 15 minutes; 5 sign-ups per IP per hour; optional `SIGNUP_CODE` to close sign-ups; 1 MB bodies; 25 changes per sync request; CORS restricted to configured origins.

## Sync

A device sends **changes** ("ops") and receives **rows**.

Change types: `sale`, `stock.move`, `product.create`, `product.update`, `product.delete`, `po.create`, `po.update`, `po.receive`, `po.delete`, `shop.update`, `import`.

Every change has a unique id made on the device. The server runs each one as a single atomic batch:

1. `INSERT OR IGNORE` the change into `ops` with `applied = 0`.
2. Bump the shop's `seq`, and apply the effects, each statement guarded by "this change exists with `applied = 0`".
3. Set `applied = 1`.

Sending a change twice therefore does nothing the second time. Stock is always applied as an amount to add or subtract, never as a new total, so sales from two devices add up. Stock may go below zero: a sale that happened cannot be refused. A purchase order adds stock only if it is not already received.

`POST /api/sync` takes `{ deviceId, since, billsSince, counters, ops }` and returns `{ cursor, more, accepted, rejected, changes: { products, bills, purchaseOrders, invoices }, shop, user, device, token? }`. Rows are those with `seq > since`, at most 500 per table, cut only at whole-`seq` boundaries. Bills older than `billsSince` are never sent.

Each device has a number (1, 2, 3 …) shown as a letter (A, B, C …). Bill, order and product ids made on a device start with that letter, so two devices can never make the same id. The server remembers each device's counters so numbering continues after signing out and in.

## On the device

The store keeps three things per account: `base` (the last state the server confirmed), `outbox` (changes not yet confirmed) and a `cursor`. What the screens show is the outbox applied on top of the base. After each sync the base takes the server's rows, confirmed changes leave the outbox, and the view is rebuilt.

Without an account the app works as it does today ("local mode"): changes apply straight to the base and nothing is queued. Sample data stays available there.

Storage is IndexedDB: one small record for products, orders, outbox and counters, and one record per bill. Old `localStorage` data is moved over on first run. Bills older than 60 days are dropped from the device (the server keeps them). The Web Locks API keeps a second tab from writing over the first.

Signing up offers "keep what's on this device" (uploaded as `import` changes) or "start with an empty shop".

## Deployment

- **All in one on Cloudflare (recommended):** one Worker serves the API and the built app from the same address. `wrangler` creates the D1 database, applies migrations and deploys.
- **GitHub Pages + API:** the existing Pages site keeps working; it talks to the API when built with `VITE_API_URL`.
- **Any Node host or the shop's own PC:** `node server/src/node.js` serves both.

The only secret is `JWT_SECRET`.

## Testing

- API: `node --test` against in-memory SQLite: accounts, each change type, idempotency, two devices, paging, roles, limits.
- Store: Vitest, driving two simulated devices against the real API code in-process, including offline periods and lost responses.
- Screens: Vitest + Testing Library for sign-in, the sync indicator and the billing flow; a test that all four languages have the same keys.
- By hand in a browser: sign-up, sale, second device, offline and back.

## Known limits

- Deploying to Cloudflare needs the owner's own free account and one login in a browser.
- If two devices add the same new barcode while both are offline, two products are created. Nothing is lost, and they can be merged by hand.
- Product edits are "last change wins" per field.
- The free Cloudflare plan stops serving after 100,000 requests in a day; five devices checking every 20 seconds for 12 hours use about 11,000.
