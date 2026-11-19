-- stokd on Supabase: the shop's data, its security rules, and the functions the app calls.
--
-- Nobody reads or writes the tables directly: Row Level Security is on with no policies,
-- and every table is revoked from the API roles. The app talks only to the stokd_* functions
-- below, which run as the table owner and always work inside the caller's own shop.
--
-- Changes from devices ("ops") are applied exactly once: an op whose id is already recorded
-- does nothing. Every row changed by an op gets the shop's new change counter (seq), so a
-- device asks only for rows with seq greater than the last one it read (its cursor).

/* ── tables ────────────────────────────────────────────────────────── */

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  location jsonb,
  radius_km real not null default 2,
  seq bigint not null default 0,
  created_at timestamptz not null default now()
);

-- People of a shop. `login` is a lower-case email or a 10-digit phone; `user_id` is filled
-- the first time that person signs in (an owner adds staff before they have an account).
create table public.members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  login text not null,
  user_id uuid,
  name text not null default '',
  role text not null check (role in ('owner', 'staff')),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (shop_id, login)
);
create unique index members_one_shop_per_user on public.members(user_id) where user_id is not null;
create index members_login on public.members(login);

create table public.devices (
  shop_id uuid not null references public.shops(id) on delete cascade,
  id text not null,
  device_no int not null,
  name text not null default '',
  counters jsonb not null default '{}',
  last_seen timestamptz not null default now(),
  primary key (shop_id, id),
  unique (shop_id, device_no)
);

create table public.products (
  shop_id uuid not null references public.shops(id) on delete cascade,
  id text not null,
  code text not null default '',
  barcode text not null default '',
  name text not null,
  names jsonb not null default '{}',
  aliases jsonb not null default '[]',
  category text not null default 'other',
  price numeric not null default 0,
  min_qty int not null default 0,
  cover_days int not null default 7,
  quantity int not null default 0,
  needs_review boolean not null default false,
  batch text not null default '',
  mfg_date text not null default '',
  expiry_date text not null default '',
  created_at bigint not null,
  created_by uuid,
  deleted boolean not null default false,
  seq bigint not null,
  primary key (shop_id, id)
);
create index products_seq on public.products(shop_id, seq);

create table public.bills (
  shop_id uuid not null references public.shops(id) on delete cascade,
  id text not null,
  bill_no text not null,
  at bigint not null,
  total numeric not null,
  payment jsonb not null default '{}',
  items jsonb not null,
  discount numeric not null default 0,
  seed boolean not null default false,
  customer jsonb,
  device_no int,
  user_id uuid,
  seq bigint not null,
  primary key (shop_id, id)
);
create index bills_seq on public.bills(shop_id, seq);
create index bills_at on public.bills(shop_id, at);

create table public.purchase_orders (
  shop_id uuid not null references public.shops(id) on delete cascade,
  id text not null,
  po_no text not null,
  supplier text not null default '',
  status text not null default 'draft' check (status in ('draft', 'sent', 'received')),
  items jsonb not null default '[]',
  changes jsonb,
  created_at bigint not null,
  received_at bigint,
  deleted boolean not null default false,
  seq bigint not null,
  primary key (shop_id, id)
);
create index purchase_orders_seq on public.purchase_orders(shop_id, seq);

create table public.invoices (
  shop_id uuid not null references public.shops(id) on delete cascade,
  id text not null,
  supplier text not null default '',
  invoice_no text not null default '',
  date_text text not null default '',
  units int not null default 0,
  line_count int not null default 0,
  at bigint not null,
  seq bigint not null,
  primary key (shop_id, id)
);
create index invoices_seq on public.invoices(shop_id, seq);

create table public.customers (
  shop_id uuid not null references public.shops(id) on delete cascade,
  id text not null,
  name text not null default '',
  phone text not null,
  code text not null,
  loyal boolean not null default true,
  source text not null default 'manual',
  location jsonb,
  created_at bigint not null,
  deleted boolean not null default false,
  seq bigint not null,
  primary key (shop_id, id)
);
create index customers_seq on public.customers(shop_id, seq);
create index customers_code on public.customers(shop_id, code);

create table public.delivery_orders (
  shop_id uuid not null references public.shops(id) on delete cascade,
  id text not null,
  customer_id text not null,
  name text not null default '',
  phone text not null default '',
  items jsonb not null,
  address text not null default '',
  note text not null default '',
  location jsonb,
  km real,
  status text not null default 'new' check (status in ('new', 'accepted', 'declined')),
  bill_id text,
  at bigint not null,
  seq bigint not null,
  primary key (shop_id, id)
);
create index delivery_orders_seq on public.delivery_orders(shop_id, seq);
create index delivery_orders_customer on public.delivery_orders(shop_id, customer_id, at);

-- Every op a device has sent: recording it first is what makes sending it twice harmless.
create table public.ops (
  shop_id uuid not null references public.shops(id) on delete cascade,
  id text not null,
  type text not null,
  user_id uuid,
  device_id text,
  at bigint not null,
  received_at timestamptz not null default now(),
  primary key (shop_id, id)
);

do $$
declare t text;
begin
  foreach t in array array['shops','members','devices','products','bills','purchase_orders','invoices','customers','delivery_orders','ops'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

/* ── helpers (not callable from the app) ───────────────────────────── */

-- The signed-in person's email (lower case) and phone (last 10 digits) from their token.
create or replace function public._my_logins() returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select array_remove(array[
    nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''),
    nullif(right(regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g'), 10), '')
  ], null)
$$;

-- The caller's membership; an invitation (added by an owner) is claimed on first sign-in.
create or replace function public._me() returns public.members
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me public.members;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthorized'; end if;
  select * into me from public.members where user_id = uid;
  if found then
    if me.disabled then raise exception 'forbidden'; end if;
    return me;
  end if;
  update public.members set user_id = uid
   where ctid = (select ctid from public.members
                  where user_id is null and not disabled and login = any(public._my_logins())
                  order by created_at limit 1)
  returning * into me;
  return me; -- all fields null when this person belongs to no shop yet
end $$;

-- Normalise a login typed by an owner: an email, or an Indian mobile number.
create or replace function public._clean_login(raw text) returns text
language plpgsql immutable as $$
declare
  s text := lower(trim(coalesce(raw, '')));
  digits text := regexp_replace(s, '\D', '', 'g');
begin
  if s ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return s; end if;
  if length(digits) >= 10 then return right(digits, 10); end if;
  raise exception 'invalid_input';
end $$;

create or replace function public._shop_row(s public.shops) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone, 'location', s.location, 'radiusKm', s.radius_km)
$$;

-- Registers the device (giving it the shop's next number) and returns it.
create or replace function public._device(p_shop uuid, p_device text, p_name text) returns public.devices
language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.devices;
begin
  if p_device is null or length(p_device) > 80 or p_device !~ '^[\w.:-]+$' then raise exception 'invalid_input'; end if;
  insert into public.devices (shop_id, id, device_no, name)
  values (p_shop, p_device, (select coalesce(max(device_no), 0) + 1 from public.devices where shop_id = p_shop), left(coalesce(p_name, ''), 80))
  on conflict (shop_id, id) do update set last_seen = now(), name = coalesce(nullif(excluded.name, ''), public.devices.name)
  returning * into d;
  return d;
end $$;

create or replace function public._session(me public.members, d public.devices) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'user', jsonb_build_object('id', me.user_id, 'name', me.name, 'login', me.login, 'role', me.role),
    'shop', public._shop_row(s),
    'device', jsonb_build_object('id', d.id, 'no', d.device_no, 'counters', d.counters))
  from public.shops s where s.id = me.shop_id
$$;

-- Adds each line's delta to its product: stock is never set, only moved, so devices add up.
create or replace function public._move(p_shop uuid, p_lines jsonb, p_seq bigint) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.products p set quantity = p.quantity + l.delta, seq = p_seq
    from (select x ->> 'productId' as pid, sum((x ->> 'delta')::int) as delta
            from jsonb_array_elements(coalesce(p_lines, '[]')) x group by 1) l
   where p.shop_id = p_shop and p.id = l.pid and not p.deleted
$$;

create or replace function public._insert_product(p_shop uuid, p jsonb, p_at bigint, p_user uuid, p_seq bigint) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.products (shop_id, id, code, barcode, name, names, aliases, category, price, min_qty, cover_days,
                               quantity, needs_review, batch, mfg_date, expiry_date, created_at, created_by, seq)
  values (p_shop, left(p ->> 'id', 80), left(coalesce(p ->> 'code', ''), 24), left(coalesce(p ->> 'barcode', ''), 64),
          left(nullif(trim(p ->> 'name'), ''), 160), coalesce(p -> 'names', '{}'), coalesce(p -> 'aliases', '[]'),
          left(coalesce(p ->> 'category', 'other'), 40), greatest(coalesce((p ->> 'price')::numeric, 0), 0),
          coalesce((p ->> 'min')::int, 0), coalesce((p ->> 'coverDays')::int, 7), coalesce((p ->> 'quantity')::int, 0),
          coalesce((p ->> 'needsReview')::boolean, false), left(coalesce(p ->> 'batch', ''), 40),
          left(coalesce(p ->> 'mfgDate', ''), 10), left(coalesce(p ->> 'expiryDate', ''), 10),
          coalesce((p ->> 'createdAt')::bigint, p_at), p_user, p_seq)
  on conflict (shop_id, id) do nothing
$$;

create or replace function public._insert_bill(p_shop uuid, b jsonb, p_device_no int, p_user uuid, p_seq bigint) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if jsonb_typeof(b -> 'items') <> 'array' or jsonb_array_length(b -> 'items') = 0 then raise exception 'invalid_input'; end if;
  insert into public.bills (shop_id, id, bill_no, at, total, payment, items, discount, seed, customer, device_no, user_id, seq)
  values (p_shop, left(b ->> 'id', 80), left(b ->> 'billNo', 24), (b ->> 'at')::bigint, (b ->> 'total')::numeric,
          coalesce(b -> 'payment', '{}'), b -> 'items', coalesce((b ->> 'discount')::numeric, 0),
          coalesce((b ->> 'seed')::boolean, false), b -> 'customer', p_device_no, p_user, p_seq)
  on conflict (shop_id, id) do nothing;
  return found;
end $$;

create or replace function public._insert_po(p_shop uuid, o jsonb, p_seq bigint) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.purchase_orders (shop_id, id, po_no, supplier, status, items, changes, created_at, received_at, seq)
  values (p_shop, left(o ->> 'id', 80), left(o ->> 'poNo', 24), left(coalesce(o ->> 'supplier', ''), 120),
          coalesce(o ->> 'status', 'draft'), coalesce(o -> 'items', '[]'), o -> 'changes',
          (o ->> 'createdAt')::bigint, (o ->> 'receivedAt')::bigint, p_seq)
  on conflict (shop_id, id) do nothing
$$;

create or replace function public._insert_invoice(p_shop uuid, i jsonb, p_seq bigint) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.invoices (shop_id, id, supplier, invoice_no, date_text, units, line_count, at, seq)
  values (p_shop, left(i ->> 'id', 80), left(coalesce(i ->> 'supplier', ''), 120), left(coalesce(i ->> 'invoiceNo', ''), 60),
          left(coalesce(i ->> 'dateText', ''), 40), coalesce((i ->> 'units')::int, 0), coalesce((i ->> 'count')::int, 0),
          (i ->> 'at')::bigint, p_seq)
  on conflict (shop_id, id) do nothing
$$;

-- What one op does. Raises on bad data; the caller undoes the op and reports it as rejected.
create or replace function public._apply(me public.members, d public.devices, op jsonb, s bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  shop uuid := me.shop_id;
  t text := op ->> 'type';
  at bigint := (op ->> 'at')::bigint;
  x jsonb;
  patch jsonb;
begin
  if t = 'sale' then
    if public._insert_bill(shop, op -> 'bill', d.device_no, me.user_id, s) then
      perform public._move(shop, (select jsonb_agg(jsonb_build_object('productId', i ->> 'productId', 'delta', -((i ->> 'qty')::int)))
                                    from jsonb_array_elements(op -> 'bill' -> 'items') i), s);
    end if;

  elsif t = 'stock.move' then
    perform public._move(shop, op -> 'lines', s);
    if op ? 'invoice' and jsonb_typeof(op -> 'invoice') = 'object' then perform public._insert_invoice(shop, op -> 'invoice', s); end if;

  elsif t = 'product.create' then
    perform public._insert_product(shop, op -> 'product', at, me.user_id, s);

  elsif t = 'product.update' then
    patch := op -> 'patch';
    update public.products set
      name = coalesce(left(nullif(trim(patch ->> 'name'), ''), 160), name),
      names = coalesce(patch -> 'names', names),
      aliases = coalesce(patch -> 'aliases', aliases),
      code = coalesce(left(patch ->> 'code', 24), code),
      barcode = coalesce(left(patch ->> 'barcode', 64), barcode),
      category = coalesce(left(patch ->> 'category', 40), category),
      price = coalesce(greatest((patch ->> 'price')::numeric, 0), price),
      min_qty = coalesce((patch ->> 'min')::int, min_qty),
      cover_days = coalesce((patch ->> 'coverDays')::int, cover_days),
      needs_review = coalesce((patch ->> 'needsReview')::boolean, needs_review),
      batch = coalesce(left(patch ->> 'batch', 40), batch),
      mfg_date = coalesce(left(patch ->> 'mfgDate', 10), mfg_date),
      expiry_date = coalesce(left(patch ->> 'expiryDate', 10), expiry_date),
      seq = s
    where shop_id = shop and id = op ->> 'productId' and not deleted;

  elsif t = 'product.delete' then
    -- The owner can remove any product; staff only one they added themselves (undoing a wrong scan).
    update public.products set deleted = true, seq = s
     where shop_id = shop and id = op ->> 'productId' and not deleted and (me.role = 'owner' or created_by = me.user_id);

  elsif t = 'po.create' then
    perform public._insert_po(shop, op -> 'po', s);

  elsif t = 'po.update' then
    patch := op -> 'patch';
    if patch ? 'status' and patch ->> 'status' not in ('draft', 'sent') then raise exception 'invalid_input'; end if;
    update public.purchase_orders set
      supplier = coalesce(left(patch ->> 'supplier', 120), supplier),
      status = coalesce(patch ->> 'status', status),
      items = coalesce(patch -> 'items', items),
      seq = s
    where shop_id = shop and id = op ->> 'poId' and status <> 'received' and not deleted;

  elsif t = 'po.receive' then
    -- Stock first (only while the order is still open), then close the order.
    if exists (select 1 from public.purchase_orders where shop_id = shop and id = op ->> 'poId' and status <> 'received' and not deleted) then
      perform public._move(shop, op -> 'lines', s);
      update public.purchase_orders set status = 'received', received_at = at, changes = op -> 'changes', seq = s
       where shop_id = shop and id = op ->> 'poId';
    end if;

  elsif t = 'po.delete' then
    update public.purchase_orders set deleted = true, seq = s
     where shop_id = shop and id = op ->> 'poId' and status = 'draft' and not deleted;

  elsif t = 'shop.update' then
    if op ? 'phone' and coalesce(op ->> 'phone', '') !~ '^(\d{10})?$' then raise exception 'invalid_input'; end if;
    update public.shops set
      name = coalesce(left(nullif(trim(op ->> 'name'), ''), 80), name),
      phone = coalesce(op ->> 'phone', phone),
      location = case when op ? 'location' then nullif(op -> 'location', 'null'::jsonb) else location end,
      radius_km = coalesce(least(greatest((op ->> 'radiusKm')::real, 0.5), 50), radius_km)
    where id = shop;

  elsif t = 'import' then
    -- Rows this device had before it joined the shop. Imported bills never move stock.
    for x in select * from jsonb_array_elements(coalesce(op -> 'products', '[]')) loop perform public._insert_product(shop, x, at, me.user_id, s); end loop;
    for x in select * from jsonb_array_elements(coalesce(op -> 'bills', '[]')) loop perform public._insert_bill(shop, x, d.device_no, me.user_id, s); end loop;
    for x in select * from jsonb_array_elements(coalesce(op -> 'purchaseOrders', '[]')) loop perform public._insert_po(shop, x, s); end loop;
    for x in select * from jsonb_array_elements(coalesce(op -> 'invoices', '[]')) loop perform public._insert_invoice(shop, x, s); end loop;

  elsif t = 'customer.save' then
    x := op -> 'customer';
    if x ? 'phone' and coalesce(x ->> 'phone', '') !~ '^\d{10}$' then raise exception 'invalid_input'; end if;
    if x ? 'code' and coalesce(x ->> 'code', '') !~ '^[A-HJ-NP-Z2-9]{8}$' then raise exception 'invalid_input'; end if;
    update public.customers set
      name = coalesce(left(x ->> 'name', 80), name),
      phone = coalesce(x ->> 'phone', phone),
      code = coalesce(x ->> 'code', code),
      loyal = coalesce((x ->> 'loyal')::boolean, loyal),
      location = case when x ? 'location' then nullif(x -> 'location', 'null'::jsonb) else location end,
      deleted = false,
      seq = s
    where shop_id = shop and id = x ->> 'id';
    if not found and x ? 'phone' and x ? 'code' then
      insert into public.customers (shop_id, id, name, phone, code, loyal, source, location, created_at, seq)
      values (shop, left(x ->> 'id', 80), left(coalesce(x ->> 'name', ''), 80), x ->> 'phone', x ->> 'code',
              coalesce((x ->> 'loyal')::boolean, true), left(coalesce(x ->> 'source', 'manual'), 20),
              nullif(x -> 'location', 'null'::jsonb), coalesce((x ->> 'createdAt')::bigint, at), s);
    end if;

  elsif t = 'customer.delete' then
    update public.customers set deleted = true, seq = s where shop_id = shop and id = op ->> 'customerId' and not deleted;

  elsif t = 'order.update' then
    if op -> 'patch' ->> 'status' not in ('accepted', 'declined') then raise exception 'invalid_input'; end if;
    update public.delivery_orders set status = op -> 'patch' ->> 'status', bill_id = coalesce(left(op -> 'patch' ->> 'billId', 80), bill_id), seq = s
     where shop_id = shop and id = op ->> 'orderId' and status = 'new';
  end if;
end $$;

/* ── what the app calls ────────────────────────────────────────────── */

-- After signing in: the person's shop, user and this device; { needsShop: true } when they have none yet.
create or replace function public.stokd_session(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; d public.devices;
begin
  me := public._me();
  if me.shop_id is null then
    return jsonb_build_object('needsShop', true, 'logins', to_jsonb(public._my_logins()));
  end if;
  d := public._device(me.shop_id, p ->> 'deviceId', p ->> 'deviceName');
  return public._session(me, d);
end $$;

-- An owner's first sign-in: creates the shop with them as its owner.
create or replace function public.stokd_create_shop(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; shop public.shops; d public.devices; logins text[];
begin
  me := public._me();
  if me.shop_id is not null then raise exception 'already_member'; end if;
  logins := public._my_logins();
  if coalesce(array_length(logins, 1), 0) = 0 then raise exception 'invalid_input'; end if;
  insert into public.shops (name) values (left(coalesce(nullif(trim(p ->> 'shopName'), ''), 'My Store'), 80)) returning * into shop;
  insert into public.members (shop_id, login, user_id, name, role)
  values (shop.id, logins[1], auth.uid(), left(coalesce(nullif(trim(p ->> 'name'), ''), 'Owner'), 80), 'owner')
  returning * into me;
  d := public._device(shop.id, p ->> 'deviceId', p ->> 'deviceName');
  return public._session(me, d);
end $$;

-- A device sends its changes (at most 25) and receives everything that changed after its cursor.
create or replace function public.stokd_sync(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me public.members;
  d public.devices;
  shop public.shops;
  since bigint := coalesce((p ->> 'since')::bigint, 0);
  bills_since bigint := coalesce((p ->> 'billsSince')::bigint, 0);
  op jsonb;
  op_id text;
  op_type text;
  s bigint;
  n int;
  accepted jsonb := '[]';
  rejected jsonb := '[]';
  t_products jsonb; t_bills jsonb; t_pos jsonb; t_invoices jsonb; t_customers jsonb; t_orders jsonb;
  cur bigint;
  page constant int := 500;
  known constant text[] := array['sale','stock.move','product.create','product.update','product.delete','po.create','po.update',
                                 'po.receive','po.delete','shop.update','import','customer.save','customer.delete','order.update'];
begin
  me := public._me();
  if me.shop_id is null then raise exception 'no_shop'; end if;
  d := public._device(me.shop_id, p ->> 'deviceId', '');

  if p ? 'counters' then
    update public.devices set counters = jsonb_build_object(
      'bill', greatest(coalesce((counters ->> 'bill')::bigint, 0), coalesce((p -> 'counters' ->> 'bill')::bigint, 0)),
      'po', greatest(coalesce((counters ->> 'po')::bigint, 0), coalesce((p -> 'counters' ->> 'po')::bigint, 0)),
      'sku', greatest(coalesce((counters ->> 'sku')::bigint, 0), coalesce((p -> 'counters' ->> 'sku')::bigint, 0)))
    where shop_id = me.shop_id and id = d.id
    returning * into d;
  end if;

  for op in select * from jsonb_array_elements(coalesce(p -> 'ops', '[]')) limit 25 loop
    op_id := op ->> 'id';
    op_type := op ->> 'type';
    if op_id is null or length(op_id) > 80 or op_id !~ '^[\w.:-]+$' then
      rejected := rejected || jsonb_build_object('id', op_id, 'reason', 'invalid: id'); continue;
    end if;
    if accepted ? op_id then continue; end if; -- the same change twice in one request
    if op_type is null or not (op_type = any(known)) then
      rejected := rejected || jsonb_build_object('id', op_id, 'reason', 'unknown_type'); continue;
    end if;
    if op_type in ('shop.update', 'import') and me.role <> 'owner' then
      rejected := rejected || jsonb_build_object('id', op_id, 'reason', 'forbidden'); continue;
    end if;
    begin
      insert into public.ops (shop_id, id, type, user_id, device_id, at)
      values (me.shop_id, op_id, op_type, me.user_id, d.id, coalesce((op ->> 'at')::bigint, 0))
      on conflict (shop_id, id) do nothing;
      get diagnostics n = row_count;
      if n = 1 then
        update public.shops set seq = seq + 1 where id = me.shop_id returning seq into s;
        perform public._apply(me, d, op, s);
      end if;
      accepted := accepted || to_jsonb(op_id);
    exception when others then
      -- Undone together with its op record, so a corrected resend can still go through.
      rejected := rejected || jsonb_build_object('id', op_id, 'reason', left('invalid: ' || sqlerrm, 200));
    end;
  end loop;

  select * into shop from public.shops where id = me.shop_id;

  select coalesce(jsonb_agg(r order by (r ->> '_seq')::bigint, r ->> 'id'), '[]') into t_products from (
    select case when deleted then jsonb_build_object('_seq', seq, 'id', id, 'deleted', true) else jsonb_build_object(
      '_seq', seq, 'id', id, 'code', code, 'barcode', barcode, 'name', name, 'names', names, 'aliases', aliases,
      'category', category, 'price', price, 'min', min_qty, 'coverDays', cover_days, 'quantity', quantity,
      'needsReview', needs_review, 'createdAt', created_at, 'batch', batch, 'mfgDate', mfg_date, 'expiryDate', expiry_date) end r
    from public.products where shop_id = me.shop_id and seq > since and (not deleted or since > 0)
    order by seq, id limit page + 1) q;

  select coalesce(jsonb_agg(r order by (r ->> '_seq')::bigint, r ->> 'id'), '[]') into t_bills from (
    select jsonb_strip_nulls(jsonb_build_object(
      '_seq', seq, 'id', id, 'billNo', bill_no, 'at', at, 'total', total, 'payment', payment, 'items', items,
      'deviceNo', device_no, 'userId', user_id,
      'seed', case when seed then true end, 'discount', case when discount > 0 then discount end, 'customer', customer)) r
    from public.bills where shop_id = me.shop_id and seq > since and at >= bills_since
    order by seq, id limit page + 1) q;

  select coalesce(jsonb_agg(r order by (r ->> '_seq')::bigint, r ->> 'id'), '[]') into t_pos from (
    select case when deleted then jsonb_build_object('_seq', seq, 'id', id, 'deleted', true) else jsonb_strip_nulls(jsonb_build_object(
      '_seq', seq, 'id', id, 'poNo', po_no, 'supplier', supplier, 'status', status, 'items', items,
      'createdAt', created_at, 'receivedAt', received_at, 'changes', changes)) end r
    from public.purchase_orders where shop_id = me.shop_id and seq > since and (not deleted or since > 0)
    order by seq, id limit page + 1) q;

  select coalesce(jsonb_agg(r order by (r ->> '_seq')::bigint, r ->> 'id'), '[]') into t_invoices from (
    select jsonb_build_object('_seq', seq, 'id', id, 'supplier', supplier, 'invoiceNo', invoice_no, 'dateText', date_text,
      'units', units, 'count', line_count, 'at', at) r
    from public.invoices where shop_id = me.shop_id and seq > since
    order by seq, id limit page + 1) q;

  select coalesce(jsonb_agg(r order by (r ->> '_seq')::bigint, r ->> 'id'), '[]') into t_customers from (
    select case when deleted then jsonb_build_object('_seq', seq, 'id', id, 'deleted', true) else jsonb_build_object(
      '_seq', seq, 'id', id, 'name', name, 'phone', phone, 'code', code, 'loyal', loyal, 'source', source,
      'location', location, 'createdAt', created_at) end r
    from public.customers where shop_id = me.shop_id and seq > since and (not deleted or since > 0)
    order by seq, id limit page + 1) q;

  select coalesce(jsonb_agg(r order by (r ->> '_seq')::bigint, r ->> 'id'), '[]') into t_orders from (
    select jsonb_strip_nulls(jsonb_build_object('_seq', seq, 'id', id, 'customerId', customer_id, 'name', name, 'phone', phone,
      'items', items, 'address', address, 'note', note, 'location', location, 'km', km, 'status', status,
      'billId', bill_id, 'at', at)) r
    from public.delivery_orders where shop_id = me.shop_id and seq > since
    order by seq, id limit page + 1) q;

  -- Rows changed together share a seq: a table that did not fit is cut just before the first seq it could not finish.
  cur := shop.seq;
  if jsonb_array_length(t_products) > page then cur := least(cur, (t_products -> page ->> '_seq')::bigint - 1); end if;
  if jsonb_array_length(t_bills) > page then cur := least(cur, (t_bills -> page ->> '_seq')::bigint - 1); end if;
  if jsonb_array_length(t_pos) > page then cur := least(cur, (t_pos -> page ->> '_seq')::bigint - 1); end if;
  if jsonb_array_length(t_invoices) > page then cur := least(cur, (t_invoices -> page ->> '_seq')::bigint - 1); end if;
  if jsonb_array_length(t_customers) > page then cur := least(cur, (t_customers -> page ->> '_seq')::bigint - 1); end if;
  if jsonb_array_length(t_orders) > page then cur := least(cur, (t_orders -> page ->> '_seq')::bigint - 1); end if;

  return jsonb_build_object(
    'accepted', accepted,
    'rejected', rejected,
    'cursor', cur,
    'more', cur < shop.seq,
    'changes', jsonb_build_object(
      'products', (select coalesce(jsonb_agg(x - '_seq'), '[]') from jsonb_array_elements(t_products) x where (x ->> '_seq')::bigint <= cur),
      'bills', (select coalesce(jsonb_agg(x - '_seq'), '[]') from jsonb_array_elements(t_bills) x where (x ->> '_seq')::bigint <= cur),
      'purchaseOrders', (select coalesce(jsonb_agg(x - '_seq'), '[]') from jsonb_array_elements(t_pos) x where (x ->> '_seq')::bigint <= cur),
      'invoices', (select coalesce(jsonb_agg(x - '_seq'), '[]') from jsonb_array_elements(t_invoices) x where (x ->> '_seq')::bigint <= cur),
      'customers', (select coalesce(jsonb_agg(x - '_seq'), '[]') from jsonb_array_elements(t_customers) x where (x ->> '_seq')::bigint <= cur),
      'orders', (select coalesce(jsonb_agg(x - '_seq'), '[]') from jsonb_array_elements(t_orders) x where (x ->> '_seq')::bigint <= cur)),
    'shop', public._shop_row(shop),
    'user', jsonb_build_object('id', me.user_id, 'name', me.name, 'login', me.login, 'role', me.role),
    'device', jsonb_build_object('id', d.id, 'no', d.device_no, 'counters', d.counters));
end $$;

/* ── staff ─────────────────────────────────────────────────────────── */

create or replace function public._owner() returns public.members
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members;
begin
  me := public._me();
  if me.shop_id is null or me.role <> 'owner' then raise exception 'forbidden'; end if;
  return me;
end $$;

create or replace function public.stokd_team_list() returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('login', m.login, 'name', m.name, 'role', m.role, 'disabled', m.disabled,
                                               'joined', m.user_id is not null) order by m.created_at), '[]')
    from public.members m where m.shop_id = (public._owner()).shop_id
$$;

-- The owner adds a staff member by email or phone; they join the shop when they sign in with it.
create or replace function public.stokd_team_add(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := public._owner(); m public.members;
begin
  insert into public.members (shop_id, login, name, role)
  values (me.shop_id, public._clean_login(p ->> 'login'), left(coalesce(nullif(trim(p ->> 'name'), ''), 'Staff'), 80), 'staff')
  on conflict (shop_id, login) do nothing
  returning * into m;
  if m.login is null then raise exception 'already_member'; end if;
  return jsonb_build_object('login', m.login, 'name', m.name, 'role', m.role, 'disabled', m.disabled, 'joined', false);
end $$;

create or replace function public.stokd_team_update(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := public._owner(); m public.members;
begin
  update public.members set
    name = coalesce(left(nullif(trim(p ->> 'name'), ''), 80), name),
    disabled = coalesce((p ->> 'disabled')::boolean, disabled)
  where shop_id = me.shop_id and login = p ->> 'login' and role = 'staff'
  returning * into m;
  if m.login is null then raise exception 'not_found'; end if;
  return jsonb_build_object('login', m.login, 'name', m.name, 'role', m.role, 'disabled', m.disabled, 'joined', m.user_id is not null);
end $$;

/* ── reports ───────────────────────────────────────────────────────── */

-- Sales per month over the shop's whole history (devices keep only the last 60 days of bills).
create or replace function public.stokd_monthly() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members := public._me();
begin
  if me.shop_id is null then raise exception 'no_shop'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'total', total, 'bills', n) order by m), '[]') from (
    select to_char(to_timestamp(at / 1000.0) at time zone 'Asia/Kolkata', 'YYYY-MM') m, sum(total) total, count(*) filter (where not seed) n
      from public.bills where shop_id = me.shop_id group by 1) q);
end $$;

/* ── loyal customers' order links (no sign-in) ─────────────────────── */

create or replace function public._customer_for(p_shop text, p_code text) returns public.customers
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.customers;
begin
  if p_shop !~ '^[0-9a-f-]{36}$' or coalesce(p_code, '') !~ '^[A-HJ-NP-Z2-9]{8}$' then raise exception 'not_found'; end if;
  select * into c from public.customers where shop_id = p_shop::uuid and code = p_code and not deleted and loyal;
  if not found then raise exception 'not_found'; end if;
  return c;
end $$;

create or replace function public.stokd_public_menu(p_shop text, p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.customers := public._customer_for(p_shop, p_code); s public.shops;
begin
  select * into s from public.shops where id = c.shop_id;
  return jsonb_build_object(
    'shop', jsonb_build_object('name', s.name, 'phone', s.phone),
    'name', c.name,
    'items', (select coalesce(jsonb_agg(jsonb_build_array(id, name, price) order by name), '[]') from (
                select id, name, price from public.products
                 where shop_id = c.shop_id and not deleted and quantity > 0 and price > 0 order by name limit 300) q));
end $$;

-- An order from a customer's page. Prices and the phone number come from the shop's own records.
create or replace function public.stokd_public_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.customers := public._customer_for(p ->> 'shop', p ->> 'code');
  s public.shops;
  items jsonb;
  km real;
  seq_no bigint;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  order_id text;
  lat double precision := (p -> 'location' ->> 'lat')::double precision;
  lng double precision := (p -> 'location' ->> 'lng')::double precision;
begin
  if (select count(*) from public.delivery_orders where shop_id = c.shop_id and customer_id = c.id and at > now_ms - 86400000) >= 10 then
    raise exception 'too_many_orders';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('productId', pr.id, 'name', pr.name, 'qty', least(w.qty, 99), 'price', pr.price)), '[]') into items
    from (select x ->> 'productId' pid, sum((x ->> 'qty')::int) qty
            from jsonb_array_elements(coalesce(p -> 'items', '[]')) x where (x ->> 'qty')::int between 1 and 99 group by 1 limit 50) w
    join public.products pr on pr.shop_id = c.shop_id and pr.id = w.pid and not pr.deleted;
  if jsonb_array_length(items) = 0 then raise exception 'invalid_input'; end if;

  select * into s from public.shops where id = c.shop_id;
  if s.location is not null and lat is not null and lng is not null then
    km := round((2 * 6371 * asin(least(1, sqrt(
            power(sin(radians(lat - (s.location ->> 'lat')::double precision) / 2), 2) +
            cos(radians((s.location ->> 'lat')::double precision)) * cos(radians(lat)) *
            power(sin(radians(lng - (s.location ->> 'lng')::double precision) / 2), 2)))))::numeric, 2);
  end if;

  order_id := 'O' || to_hex(now_ms) || substr(md5(random()::text), 1, 8);
  update public.shops set seq = seq + 1 where id = c.shop_id returning seq into seq_no;
  insert into public.delivery_orders (shop_id, id, customer_id, name, phone, items, address, note, location, km, at, seq)
  values (c.shop_id, order_id, c.id, left(coalesce(nullif(trim(p ->> 'name'), ''), c.name), 80), c.phone, items,
          left(coalesce(p ->> 'address', ''), 300), left(coalesce(p ->> 'note', ''), 200),
          case when lat is not null and lng is not null then jsonb_build_object('lat', lat, 'lng', lng) end, km, now_ms, seq_no);
  return jsonb_build_object('ok', true, 'id', order_id);
end $$;

/* ── who may call what ─────────────────────────────────────────────── */

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.stokd_session(jsonb), public.stokd_create_shop(jsonb), public.stokd_sync(jsonb),
  public.stokd_team_list(), public.stokd_team_add(jsonb), public.stokd_team_update(jsonb), public.stokd_monthly()
  to authenticated;
grant execute on function public.stokd_public_menu(text, text), public.stokd_public_order(jsonb) to anon, authenticated;
