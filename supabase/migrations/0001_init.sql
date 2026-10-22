-- ONCE production schema for Supabase / PostgreSQL (Phase 2).
-- Mirrors src/server/db/schema.ts (the demo-mode SQLite schema) with native
-- enums, row-level security and transactional functions.
--
-- Access model:
--   * Members use the anon/authenticated key. RLS lets them read only their own
--     sensitive rows and rows explicitly shared with them.
--   * All state changes that involve money, inventory or another person
--     (accepting invitations, payments, cancellations, webhooks) run on the
--     server with the service role, inside the SECURITY DEFINER functions below
--     or the service layer in src/server/services. Clients never write those tables.
--   * Admin access is granted by membership in admin_roles, checked in SQL.

create extension if not exists "pgcrypto";

create type user_status as enum ('active', 'suspended', 'deleted');
create type gender as enum ('woman', 'man', 'nonbinary');
create type intention as enum ('long_term', 'open_to_long_term', 'see_where_it_goes', 'something_casual');
create type verification_status as enum ('unverified', 'pending', 'verified', 'failed');
create type slot_status as enum ('open', 'closed', 'cancelled');
create type invitation_status as enum ('pending', 'accepted', 'declined', 'expired', 'withdrawn', 'cancelled');
create type match_status as enum ('awaiting_commitment', 'confirmed', 'completed', 'cancelled', 'expired');
create type participant_role as enum ('inviter', 'invitee');
create type payment_status as enum ('processing', 'authorized', 'captured', 'failed', 'canceled', 'refunded', 'partially_refunded');
create type ledger_kind as enum ('authorization', 'capture', 'void', 'refund', 'failure');
create type reservation_status as enum ('held', 'secured', 'released', 'cancelled');
create type reschedule_status as enum ('pending', 'accepted', 'declined', 'withdrawn', 'expired');
create type report_kind as enum ('harassment', 'misconduct', 'safety', 'fake_profile', 'no_show', 'emergency', 'support', 'other');
create type report_status as enum ('open', 'reviewing', 'upheld', 'dismissed', 'resolved');
create type admin_role as enum ('admin', 'support');

-- users mirrors auth.users (Supabase Auth owns credentials and sessions).
create table users (
  id           uuid primary key references auth.users(id) on delete cascade,
  status       user_status not null default 'active',
  onboarded_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table neighborhoods (
  id   text primary key,
  name text not null,
  city text not null,
  lat  double precision not null,
  lng  double precision not null
);

create table profiles (
  user_id                uuid primary key references users(id) on delete cascade,
  first_name             text not null check (char_length(first_name) between 1 and 40),
  birth_date             date not null check (birth_date <= (current_date - interval '18 years')),
  gender                 gender not null,
  interested_in          gender[] not null default '{}',
  age_min                int not null default 18 check (age_min >= 18),
  age_max                int not null default 99 check (age_max >= age_min),
  bio                    text not null default '' check (char_length(bio) <= 300),
  interests              text[] not null default '{}' check (cardinality(interests) <= 3),
  intention              intention not null,
  neighborhood_id        text not null references neighborhoods(id),
  verification_status    verification_status not null default 'unverified',
  verification_is_test   boolean not null default false,
  verification_ref       text,
  guidelines_accepted_at timestamptz not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index profiles_neighborhood_idx on profiles(neighborhood_id);

create table profile_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  storage_key text not null,
  mime_type   text not null,
  position    int not null,
  created_at  timestamptz not null default now(),
  unique (user_id, position)
);

create table user_preferences (
  user_id              uuid primary key references users(id) on delete cascade,
  preferred_categories text[] not null default '{}',
  preferred_days       text[] not null default '{}',
  preferred_times      text[] not null default '{}',
  budget_max_cents     int not null default 5000 check (budget_max_cents > 0),
  travel_radius_km     int not null default 8 check (travel_radius_km between 1 and 100),
  dietary_notes        text,   -- private: shared only with the venue
  accessibility_notes  text,   -- private: shared only with the venue
  email_notifications  boolean not null default true,
  updated_at           timestamptz not null default now()
);

create table venues (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  venue_type          text not null,
  neighborhood_id     text not null references neighborhoods(id),
  address             text not null,
  accessibility_notes text not null default '',
  dietary_options     text not null default '',
  is_demo             boolean not null default false,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table date_experiences (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  title              text not null,
  category           text not null,
  venue_id           uuid not null references venues(id),
  description        text not null,
  atmosphere         text not null,
  includes           text[] not null default '{}',
  duration_minutes   int not null check (duration_minutes > 0),
  total_price_cents  int not null check (total_price_cents > 0 and total_price_cents % 2 = 0),
  indoor             boolean not null default true,
  dress_code         text not null default '',
  arrival_notes      text not null default '',
  cancellation_hours int not null default 24 check (cancellation_hours between 1 and 168),
  is_demo            boolean not null default false,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index experiences_category_idx on date_experiences(category) where active;

create table availability_slots (
  id             uuid primary key default gen_random_uuid(),
  experience_id  uuid not null references date_experiences(id) on delete cascade,
  starts_at      timestamptz not null,
  capacity       int not null default 1 check (capacity >= 0),
  reserved_count int not null default 0 check (reserved_count >= 0),
  status         slot_status not null default 'open',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (experience_id, starts_at),
  check (reserved_count <= capacity)
);
create index slots_discovery_idx on availability_slots(starts_at) where status = 'open';

create table date_invitations (
  id                uuid primary key default gen_random_uuid(),
  slot_id           uuid not null references availability_slots(id),
  from_user_id      uuid not null references users(id),
  to_user_id        uuid not null references users(id),
  status            invitation_status not null default 'pending',
  is_repeat         boolean not null default false,
  previous_match_id uuid,
  expires_at        timestamptz not null,
  responded_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);
create unique index invitations_one_pending on date_invitations(slot_id, from_user_id, to_user_id) where status = 'pending';
create index invitations_to_idx on date_invitations(to_user_id, status);
create index invitations_from_idx on date_invitations(from_user_id, status);

create table matches (
  id                    uuid primary key default gen_random_uuid(),
  invitation_id         uuid not null unique references date_invitations(id),
  slot_id               uuid not null references availability_slots(id),
  experience_id         uuid not null references date_experiences(id),
  status                match_status not null default 'awaiting_commitment',
  terms_hash            text not null,
  total_price_cents     int not null,
  share_cents           int not null,
  fee_cents             int not null,
  late_refund_pct       int not null,
  cancellation_deadline timestamptz not null,
  commitment_expires_at timestamptz not null,
  confirmed_at          timestamptz,
  cancelled_at          timestamptz,
  cancelled_by          uuid references users(id),
  cancel_reason         text,
  completed_at          timestamptz,
  finalizing_at         timestamptz,
  is_test               boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (share_cents * 2 = total_price_cents)
);
create index matches_status_idx on matches(status);

create table match_participants (
  match_id                uuid not null references matches(id) on delete cascade,
  user_id                 uuid not null references users(id),
  role                    participant_role not null,
  details_confirmed_hash  text,
  details_confirmed_at    timestamptz,
  attendance_confirmed_at timestamptz,
  primary key (match_id, user_id),
  unique (match_id, role) -- with two roles, at most two participants
);
create index participants_user_idx on match_participants(user_id);

create table payment_intents (
  id                       uuid primary key default gen_random_uuid(),
  match_id                 uuid not null references matches(id),
  user_id                  uuid not null references users(id),
  provider                 text not null,
  provider_ref             text unique,
  amount_cents             int not null check (amount_cents > 0),
  share_cents              int not null,
  fee_cents                int not null,
  currency                 text not null default 'usd',
  status                   payment_status not null,
  idempotency_key          text not null unique,
  failure_reason           text,
  refunded_cents           int not null default 0,
  authorization_expires_at timestamptz,
  is_test                  boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (amount_cents = share_cents + fee_cents),
  check (refunded_cents <= amount_cents)
);
create unique index payment_intents_one_live on payment_intents(match_id, user_id)
  where status in ('processing', 'authorized', 'captured', 'refunded', 'partially_refunded');

create table payment_transactions (
  id                uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references payment_intents(id),
  kind              ledger_kind not null,
  amount_cents      int not null,
  provider_event_id text not null unique,
  is_test           boolean not null default false,
  created_at        timestamptz not null default now()
);

create table provider_events (
  id           text primary key,
  provider     text not null,
  type         text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

create table reservations (
  id                uuid primary key default gen_random_uuid(),
  match_id          uuid not null unique references matches(id),
  slot_id           uuid not null references availability_slots(id),
  status            reservation_status not null,
  provider          text not null,
  provider_ref      text,
  confirmation_code text,
  hold_expires_at   timestamptz,
  is_test           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table reschedule_requests (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references matches(id),
  requested_by uuid not null references users(id),
  new_slot_id  uuid not null references availability_slots(id),
  status       reschedule_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);
create unique index reschedule_one_pending on reschedule_requests(match_id) where status = 'pending';

create table attendance_confirmations (
  match_id       uuid not null references matches(id),
  user_id        uuid not null references users(id),
  attended       boolean not null,
  other_attended boolean not null,
  created_at     timestamptz not null default now(),
  primary key (match_id, user_id)
);

create table post_date_feedback (
  match_id          uuid not null references matches(id),
  user_id           uuid not null references users(id),
  felt_safe         boolean not null,
  open_to_another   boolean not null,
  experience_rating int check (experience_rating between 1 and 5),
  venue_rating      int check (venue_rating between 1 and 5),
  comment           text,
  created_at        timestamptz not null default now(),
  primary key (match_id, user_id)
);

create table reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references users(id),
  reported_user_id uuid references users(id),
  match_id         uuid references matches(id),
  kind             report_kind not null,
  details          text not null default '',
  status           report_status not null default 'open',
  resolution_note  text,
  resolved_by      uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index reports_status_idx on reports(status, created_at);

create table blocks (
  blocker_id uuid not null references users(id),
  blocked_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null,
  link       text,
  dedupe_key text unique,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, created_at desc);

create table admin_roles (
  user_id    uuid primary key references users(id) on delete cascade,
  role       admin_role not null,
  granted_by uuid,
  created_at timestamptz not null default now()
);

create table audit_events (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create table platform_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_roles where user_id = auth.uid() and role = 'admin');
$$;

create function is_participant(m uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from match_participants where match_id = m and user_id = auth.uid());
$$;

create function blocked_between(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table users enable row level security;
alter table profiles enable row level security;
alter table profile_photos enable row level security;
alter table user_preferences enable row level security;
alter table venues enable row level security;
alter table date_experiences enable row level security;
alter table availability_slots enable row level security;
alter table neighborhoods enable row level security;
alter table date_invitations enable row level security;
alter table matches enable row level security;
alter table match_participants enable row level security;
alter table payment_intents enable row level security;
alter table payment_transactions enable row level security;
alter table provider_events enable row level security;
alter table reservations enable row level security;
alter table reschedule_requests enable row level security;
alter table attendance_confirmations enable row level security;
alter table post_date_feedback enable row level security;
alter table reports enable row level security;
alter table blocks enable row level security;
alter table notifications enable row level security;
alter table admin_roles enable row level security;
alter table audit_events enable row level security;
alter table platform_settings enable row level security;

-- Own account
create policy users_self on users for select using (id = auth.uid() or is_admin());

-- Profiles: members don't read the profiles table directly. The public subset is
-- served through the public_profiles view below (no birth date, no preferences).
create policy profiles_self on profiles for select using (user_id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_self_insert on profiles for insert with check (user_id = auth.uid());

create policy photos_read on profile_photos for select using (auth.uid() is not null and not blocked_between(auth.uid(), user_id));
create policy photos_write on profile_photos for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Preferences, including private dietary/accessibility notes: owner only.
create policy prefs_self on user_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Catalog: readable by members; writable by admins only.
create policy catalog_read_venues on venues for select using (auth.uid() is not null);
create policy catalog_read_experiences on date_experiences for select using (auth.uid() is not null);
create policy catalog_read_slots on availability_slots for select using (auth.uid() is not null);
create policy catalog_read_hoods on neighborhoods for select using (true);
create policy catalog_admin_venues on venues for all using (is_admin()) with check (is_admin());
create policy catalog_admin_experiences on date_experiences for all using (is_admin()) with check (is_admin());
create policy catalog_admin_slots on availability_slots for all using (is_admin()) with check (is_admin());

-- Invitations: sender and recipient only. Created/answered via server functions.
create policy invitations_parties on date_invitations for select using (from_user_id = auth.uid() or to_user_id = auth.uid() or is_admin());

-- Matches and their details: participants only.
create policy matches_participants on matches for select using (is_participant(id) or is_admin());
create policy participants_read on match_participants for select using (is_participant(match_id) or is_admin());
create policy reservations_read on reservations for select using (is_participant(match_id) or is_admin());
create policy reschedule_read on reschedule_requests for select using (is_participant(match_id) or is_admin());

-- Payments: each person sees only their own. Never the other participant's.
create policy payments_own on payment_intents for select using (user_id = auth.uid() or is_admin());
create policy ledger_admin on payment_transactions for select using (is_admin());
create policy provider_events_admin on provider_events for select using (is_admin());

-- Feedback and attendance answers are private to their author (and trust & safety).
create policy attendance_own on attendance_confirmations for select using (user_id = auth.uid() or is_admin());
create policy feedback_own on post_date_feedback for select using (user_id = auth.uid() or is_admin());

-- Reports: the reporter can see what they filed; the reported person never can.
create policy reports_own on reports for select using (reporter_id = auth.uid() or is_admin());
create policy reports_insert on reports for insert with check (reporter_id = auth.uid());
create policy reports_admin_update on reports for update using (is_admin()) with check (is_admin());

create policy blocks_own on blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy notifications_own on notifications for select using (user_id = auth.uid());
create policy notifications_mark_read on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy admin_roles_admin on admin_roles for select using (is_admin());
create policy audit_admin on audit_events for select using (is_admin());
create policy settings_read on platform_settings for select using (true);
create policy settings_admin on platform_settings for all using (is_admin()) with check (is_admin());

-- Public profile subset. Age is derived; birth date, preferences and location stay private.
create view public_profiles with (security_barrier = true) as
  select p.user_id, p.first_name, date_part('year', age(p.birth_date))::int as age, n.name as neighborhood,
         p.bio, p.interests, p.intention, (p.verification_status = 'verified') as verified, p.verification_is_test
    from profiles p join users u on u.id = p.user_id join neighborhoods n on n.id = p.neighborhood_id
   where u.status = 'active' and u.onboarded_at is not null and not blocked_between(auth.uid(), p.user_id);
grant select on public_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Transactional operations (called by the server with the user's identity).
-- The same race guards as src/server/services/dates.ts: conditional updates
-- so concurrent accepts can't create two matches and slots can't be oversold.
-- ---------------------------------------------------------------------------

create function accept_invitation(p_invitation uuid, p_fee_cents int, p_late_pct int, p_terms_hash text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv date_invitations;
  slot availability_slots;
  exp date_experiences;
  new_match uuid;
begin
  update date_invitations set status = 'accepted', responded_at = now(), updated_at = now()
   where id = p_invitation and to_user_id = auth.uid() and status = 'pending' and expires_at > now()
   returning * into inv;
  if not found then raise exception 'invitation is not pending'; end if;
  if blocked_between(inv.from_user_id, inv.to_user_id) then raise exception 'unavailable'; end if;

  update availability_slots set reserved_count = reserved_count + 1, updated_at = now()
   where id = inv.slot_id and status = 'open' and reserved_count < capacity
   returning * into slot;
  if not found then raise exception 'slot is full'; end if;

  select * into exp from date_experiences where id = slot.experience_id;
  insert into matches (invitation_id, slot_id, experience_id, terms_hash, total_price_cents, share_cents, fee_cents, late_refund_pct,
                       cancellation_deadline, commitment_expires_at)
  values (inv.id, slot.id, exp.id, p_terms_hash, exp.total_price_cents, exp.total_price_cents / 2, p_fee_cents, p_late_pct,
          slot.starts_at - make_interval(hours => exp.cancellation_hours),
          least(now() + interval '24 hours', slot.starts_at - interval '4 hours'))
  returning id into new_match;
  insert into match_participants (match_id, user_id, role) values (new_match, inv.from_user_id, 'inviter'), (new_match, inv.to_user_id, 'invitee');
  insert into reservations (match_id, slot_id, status, provider, hold_expires_at)
  values (new_match, slot.id, 'held', 'pending', least(now() + interval '24 hours', slot.starts_at - interval '4 hours'));
  insert into audit_events (actor_id, action, entity_type, entity_id) values (auth.uid(), 'invitation.accepted', 'match', new_match::text);
  return new_match;
end $$;
revoke all on function accept_invitation from public;
grant execute on function accept_invitation to authenticated;
