# Sign-in and sync on Supabase: design

## Why
Sign-in does not work on the live site today: our own server was never put online.
The owner chose Supabase (free tier) for sign-in and the shop's data, because it gives
Google sign-in and a ready-made dashboard for browsing users and tables.

## What the owner decided
- **Supabase** for sign-in and the shop's data, instead of our own Hono/Cloudflare server.
- Sign-in methods: **Google account**, **phone/email + password**, **phone OTP by SMS**.
- "Analyze user data" means **per-shop sales analysis**: each shop owner sees deeper reports on their own sales.

## How it works

### Sign-in (Supabase Auth)
- "Continue with Google" (OAuth), email + password, and phone + one-time SMS code.
- Supabase stores passwords (bcrypt) and issues the session; the app keeps the session and
  refreshes it. Password reset by email replaces our recovery codes.
- A new shop is created the first time an owner signs in. Staff are added by the owner by
  email or phone; when that person signs in, they join the shop with the staff role.

### The shop's data (Supabase Postgres)
- The same tables as today (shops, members, devices, products, bills, purchase orders,
  invoices, customers, delivery orders, ops), with Row Level Security: a user can only ever
  read or change rows of the shop they belong to.
- The app keeps working offline exactly as now: changes are saved on the phone first and sent
  later. One database function, `stokd_sync`, applies a batch of changes exactly once and returns
  what changed since the device's cursor, the same rules as today's server, rewritten for Postgres.
- Customer order links call two public functions (menu and order) that check the customer's
  secret code, as today.

### Per-shop sales analysis (new Reports page)
- Monthly and weekly sales totals, best-selling products, best customers (by phone), payment mix
  (cash / UPI / card), sales by hour of day and day of week, and growth versus the previous period.
- Computed by database views over the shop's full history (the phone keeps only 60 days of bills),
  with the last 60 days also available offline.

## What the owner has to set up (accounts only they can create)
1. A free Supabase project; send the Project URL and the "anon public" key (safe to share).
2. Google sign-in: a Google Cloud OAuth client, with its ID and secret pasted into Supabase.
3. SMS codes: an SMS provider account (Twilio, MessageBird or Vonage) connected in Supabase.
   This costs money per message, and SMS to Indian numbers needs DLT registration.
4. Running the database setup script in Supabase's SQL editor (provided).

## Trade-offs
- Supabase's free project pauses after a week without use; the first visit after that wakes it.
- The Cloudflare server code stays in the repository until the Supabase version works, then is removed.

## Order of work
1. Database: tables, security rules, `stokd_sync` and the public order functions (SQL script).
2. App: Supabase sign-in screens (Google, email/phone + password, SMS code) and the sync engine
   talking to `stokd_sync`; staff membership.
3. Reports page for per-shop sales analysis.
4. Tests against a local Postgres, then switch the live site.
