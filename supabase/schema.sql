-- AQUA BOAT GRAND PRIX ONLINE
-- Run this file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  medals bigint not null default 10000 check (medals >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.races (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 48),
  host_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'recruiting' check (status in ('recruiting','open','running','finished')),
  max_boats int not null default 6 check (max_boats = 6),
  result_order int[],
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  boat_no int not null check (boat_no between 1 and 6),
  created_at timestamptz not null default now(),
  unique(race_id,user_id),
  unique(race_id,boat_no)
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  bet_type text not null check (bet_type in ('win','place','exacta','quinella','trifecta','trio','wide')),
  picks int[] not null,
  stake bigint not null check (stake between 1 and 10000),
  odds numeric(8,2) not null,
  payout bigint not null default 0,
  settled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists races_created_idx on public.races(created_at desc);
create index if not exists entries_race_idx on public.entries(race_id);
create index if not exists tickets_race_idx on public.tickets(race_id);

-- Create a profile and grant 10,000 free, non-transferable game medals on signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, display_name, medals)
  values(new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)), 10000)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.races enable row level security;
alter table public.entries enable row level security;
alter table public.tickets enable row level security;

create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
create policy "users update own display name" on public.profiles for update to authenticated using (auth.uid()=id) with check (auth.uid()=id);
create policy "races readable by everyone" on public.races for select to anon, authenticated using (true);
create policy "authenticated users host races" on public.races for insert to authenticated with check (auth.uid()=host_id);
create policy "entries readable by everyone" on public.entries for select to anon, authenticated using (true);
create policy "users join as themselves" on public.entries for insert to authenticated with check (auth.uid()=user_id);
create policy "users see own tickets" on public.tickets for select to authenticated using (auth.uid()=user_id);

-- Fixed demo multipliers. They are entertainment-only, not real-world odds.
create or replace function public.buy_ticket(p_race_id uuid,p_bet_type text,picks int[],p_stake bigint)
returns void language plpgsql security definer set search_path=public as $$
declare v_odds numeric;
declare v_count int;
declare v_medals bigint;
declare v_status text;
begin
  if auth.uid() is null then raise exception 'ログインしてください'; end if;
  if p_stake < 1 or p_stake > 10000 then raise exception '購入額は1〜10,000枚です'; end if;
  v_count := case when p_bet_type in ('win','place') then 1 when p_bet_type in ('exacta','quinella','wide') then 2 when p_bet_type in ('trifecta','trio') then 3 else 0 end;
  if v_count=0 or array_length(picks,1)<>v_count or (select count(distinct x) from unnest(picks) x)<>v_count or exists(select 1 from unnest(picks) x where x<1 or x>6) then raise exception '舟券の選択が正しくありません'; end if;
  v_odds := case p_bet_type when 'win' then 5 when 'place' then 2.2 when 'exacta' then 12 when 'quinella' then 6 when 'trifecta' then 45 when 'trio' then 10 when 'wide' then 3.5 end;
  select status into v_status from public.races where id=p_race_id for update;
  if v_status is null then raise exception 'レースが見つかりません'; end if;
  if v_status not in ('recruiting','open') then raise exception 'このレースの舟券受付は終了しています'; end if;
  select medals into v_medals from public.profiles where id=auth.uid() for update;
  if v_medals < p_stake then raise exception 'メダルが足りません'; end if;
  update public.profiles set medals=medals-p_stake where id=auth.uid();
  insert into public.tickets(race_id,user_id,bet_type,picks,stake,odds) values(p_race_id,auth.uid(),p_bet_type,picks,p_stake,v_odds);
end;
$$;

-- Demo-only result generator. Only the race host may run it.
create or replace function public.run_demo_race(p_race_id uuid)
returns int[] language plpgsql security definer set search_path=public as $$
declare v_host uuid; v_status text; v_order int[]; t record; v_hit boolean; v_payout bigint;
begin
  select host_id,status into v_host,v_status from public.races where id=p_race_id for update;
  if v_host is null then raise exception 'レースが見つかりません'; end if;
  if v_host<>auth.uid() then raise exception '主催者のみ結果を確定できます'; end if;
  if v_status not in ('recruiting','open') then raise exception 'このレースは開始できません'; end if;
  -- Shuffle lanes 1..6 for a demo result.
  select array_agg(n order by random()) into v_order from generate_series(1,6) n;
  update public.races set status='finished',result_order=v_order,finished_at=now() where id=p_race_id;
  for t in select * from public.tickets where race_id=p_race_id and settled=false loop
    v_hit := case
      when t.bet_type='win' then v_order[1]=t.picks[1]
      when t.bet_type='place' then t.picks[1]=any(v_order[1:2])
      when t.bet_type='exacta' then v_order[1:2]=t.picks
      when t.bet_type='quinella' then (t.picks[1]=any(v_order[1:2]) and t.picks[2]=any(v_order[1:2]))
      when t.bet_type='trifecta' then v_order[1:3]=t.picks
      when t.bet_type='trio' then (t.picks[1]=any(v_order[1:3]) and t.picks[2]=any(v_order[1:3]) and t.picks[3]=any(v_order[1:3]))
      when t.bet_type='wide' then (t.picks[1]=any(v_order[1:3]) and t.picks[2]=any(v_order[1:3]))
      else false end;
    v_payout := case when v_hit then floor(t.stake*t.odds)::bigint else 0 end;
    update public.tickets set settled=true,payout=v_payout where id=t.id;
    if v_payout>0 then update public.profiles set medals=medals+v_payout where id=t.user_id; end if;
  end loop;
  return v_order;
end;
$$;

revoke all on function public.buy_ticket(uuid,text,int[],bigint) from public;
grant execute on function public.buy_ticket(uuid,text,int[],bigint) to authenticated;
revoke all on function public.run_demo_race(uuid) from public;
grant execute on function public.run_demo_race(uuid) to authenticated;

-- Enable realtime updates for race board and entry counts.
alter publication supabase_realtime add table public.races;
alter publication supabase_realtime add table public.entries;
