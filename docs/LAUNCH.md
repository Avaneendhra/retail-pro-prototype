# Putting stokd online

There are three ways to run stokd. All are free. Pick one.

| | Best for | What you get |
|---|---|---|
| **A. Cloudflare** (recommended) | A real launch | One web address for the app and the server. Never sleeps. Free up to 100,000 requests a day. |
| **B. Your own computer** | Trying it out, or a shop that wants its data on its own PC | Runs with one command. Reachable from that computer. |
| **C. GitHub Pages only** | A demo | The app without accounts: data stays on each device. |

---

## A. Cloudflare (about 10 minutes, once)

You need a free Cloudflare account. No card is needed. These steps must be done by you, because they sign in to your account.

1. Create the account at https://dash.cloudflare.com/sign-up and confirm your email.

2. In this folder, sign in from the terminal (a browser window opens; click **Allow**):

   ```bash
   npm --prefix server exec wrangler login
   ```

3. Create the database:

   ```bash
   npm --prefix server exec wrangler d1 create stokd
   ```

   It prints a `database_id`. Open `server/wrangler.jsonc` and replace the row of zeros with that id.

4. Set the secret that signs logins. Paste any long random text (40 or more characters) when asked, and keep a copy somewhere safe:

   ```bash
   npm --prefix server exec wrangler secret put JWT_SECRET
   ```

   (Run this from the `server` folder if it asks which Worker: `cd server` first.)

5. Build and deploy:

   ```bash
   npm run launch
   ```

   It prints your address, like `https://stokd.<your-name>.workers.dev`.

6. Check it:

   ```bash
   npm run smoke -- https://stokd.<your-name>.workers.dev
   ```

   Every line should say `ok`. The check creates one test shop called "Smoke test shop".

Open the address on your phone, tap **Sign in → Create account**, and write down the recovery code. On every other phone or computer, open the same address and sign in.

**Updating later:** run `npm run launch` again.

**Optional settings** (Cloudflare dashboard → Workers → stokd → Settings → Variables):

- `SIGNUP_CODE`: if set, only people who know this code can create a new shop. Useful once your own shop is set up.
- `ALLOWED_ORIGINS`: other web addresses allowed to use this server, separated by commas. Needed only if you also keep the GitHub Pages copy (see C).

**Limits of the free plan:** 100,000 requests a day (five devices checking every 20 seconds for 12 hours use about 11,000), a 5 GB database, and 100,000 database rows written a day.

---

## B. Your own computer

```bash
npm install
npm start
```

Open http://localhost:8787. The database is the file `server/data/stokd.db`; copy that file to back it up. The secret that signs logins is made on first run and kept in `server/data/secret`.

Other phones can only sign in if they reach this computer through an **https** address. Browsers refuse to do the password maths on plain `http://192.168…` addresses. A free tunnel such as Cloudflare Tunnel gives you an https address for a computer at home; for most shops option A is simpler.

Settings, all optional, as environment variables: `PORT`, `DATABASE_PATH`, `JWT_SECRET`, `SIGNUP_CODE`, `ALLOWED_ORIGINS` (see `.env.example`).

---

## C. GitHub Pages

```bash
npm run deploy
```

This publishes the app to https://avaneendhra.github.io/retail-pro-prototype/. On its own it has no server, so **Sign in** says cloud sync is not set up and each device keeps its own data.

To make the Pages copy use your Cloudflare server from option A:

1. Create a file named `.env` with one line: `VITE_API_URL=https://stokd.<your-name>.workers.dev`
2. In Cloudflare, set the variable `ALLOWED_ORIGINS` to `https://avaneendhra.github.io`
3. Run `npm run deploy` again.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| "Cloud sync is not set up" | The app cannot reach a server. Check the address, and the internet connection. |
| "Sign in again" on the sync button | The password was changed or the login is more than 60 days old. Sign in; nothing is lost. |
| "Offline · 3 waiting" | Normal without internet. The changes are saved on the device and go up by themselves. |
| "This browser is not saving data" | Private browsing, or the device is full. Leave private mode or free up space, then reload. |
| "stokd is already open" | Close the other tab or window of the app on this device. |
| Forgot the password | **Sign in → Forgot password**, with the recovery code. Staff: the owner resets it under **Logins for your staff**. |
| Forgot the password and lost the recovery code | The owner's account cannot be recovered. Data on a signed-in device is still there. |
