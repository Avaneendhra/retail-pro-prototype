# Quick delivery for loyal customers: design

## Why
A shop's regular customers should be able to send an order for quick delivery
without phoning. Only customers the shop trusts can order this way.

## What the owner decided
- Orders reach the shop **both** ways: on WhatsApp now, and also inside the app
  once the online server is running.
- **Only the loyal list** can order. Anyone else who messages is marked "not on your list".
- Loyal customers are found from **frequent buyers**, **phone contacts** and
  **people living nearby**.
- Stays free: no SMS, no paid services.

## How it works

### 1. Customers page (new, in the menu)
- One list of customers: name, phone, how they were added (bill, contacts, order),
  visits in the last 30 days, distance from the shop, loyal yes/no.
- **Frequent buyers:** billing gets an optional "Customer phone" field. Anyone with
  4 or more bills in 30 days is suggested as loyal, one tap to accept.
- **Contacts:** "Add from contacts" uses the phone's contact picker (Chrome on
  Android). Elsewhere, name and number are typed in.
- **Nearby:** the shop saves its location once (Settings → "Use my current location")
  and a delivery distance (default 2 km). A customer's distance is worked out from the
  location they share when ordering (straight-line distance, haversine formula).
- Each loyal customer gets a **personal order link** with a random secret code in it,
  and a "Send link on WhatsApp" button.

### 2. Order page (what the customer opens)
- Opens without signing in, as its own simple screen: shop name, items with prices,
  + / − buttons, total, address and note, and "Share my location".
- Their name is already filled in from the link.
- **Send** opens WhatsApp to the shop's number with the order written out: items,
  quantities, total, address, a map link, distance, and the customer's code.
- **Items without the server:** the link carries the shop's in-stock items (up to 60,
  best sellers first, compressed into the link). They refresh whenever the shop sends
  the link again.
- **Items with the server:** live stock and prices load from the server.

### 3. Orders inside the app (when the server runs)
- The order page also sends the order to the server with the customer's secret code.
  The server accepts it only if the code is on that shop's loyal list.
- The app gets a "Delivery orders" list with a badge. Accepting an order turns it
  into a bill, and the stock is reduced.
- This can be tried with the local server before the Cloudflare setup is done.

## Not included
- Proving a phone number by SMS code: it costs money. WhatsApp already shows the real
  sender number, and the in-app route relies on the secret code in the link.
- Live delivery tracking, payment inside the order page, and delivery staff.

## Order of work
1. Customers list, phone on bills, frequent-buyer suggestions, contact picker, shop
   location and distance, personal links. Works today.
2. Order page and sending on WhatsApp. Works today.
3. Server: customers and orders tables, the order route, syncing, and the in-app orders list.
