-- Pin the search path of the two plain helpers too (Supabase security advisor 0011).
alter function public._clean_login(text) set search_path = public, pg_temp;
alter function public._shop_row(public.shops) set search_path = public, pg_temp;
