begin;

create schema if not exists staff_private;
revoke all on schema staff_private from public, anon, authenticated;
grant usage on schema staff_private to supabase_auth_admin;

-- One organisation-wide default site for public registration. Operators select it once.
create table staff_private.registration_site (
  singleton boolean primary key default true check (singleton),
  company_id uuid not null,
  site_id uuid not null,
  foreign key (company_id, site_id) references public.sites(company_id, id)
);
alter table staff_private.registration_site enable row level security;
grant select on staff_private.registration_site to supabase_auth_admin;
create policy public_signup_site_lookup on staff_private.registration_site
  for select to supabase_auth_admin using (true);

create function staff_private.valid_signup_profile(metadata jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(metadata->>'requested_role' in ('gate', 'supervisor', 'site_manager')
    and metadata->>'phone' ~ '^[+]?[0-9]{7,15}$'
    and length(btrim(metadata->>'first_name')) between 1 and 59
    and length(btrim(metadata->>'last_name')) between 1 and 60, false);
$$;
revoke all on function staff_private.valid_signup_profile(jsonb) from public,anon,authenticated;
grant execute on function staff_private.valid_signup_profile(jsonb) to supabase_auth_admin;

create or replace function staff_private.before_staff_signup(event jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select case when event #>> '{user,app_metadata,provider}' = 'email'
    and event #>> '{user,is_anonymous}' = 'false'
    and staff_private.valid_signup_profile(event #> '{user,user_metadata}')
    and exists (select 1 from staff_private.registration_site)
  then '{}'::jsonb
  else '{"error":{"http_code":403,"message":"Provide a staff profile and choose a valid role."}}'::jsonb
  end;
$$;

revoke all on function staff_private.before_staff_signup(jsonb) from public,anon,authenticated;
grant execute on function staff_private.before_staff_signup(jsonb) to supabase_auth_admin;

drop trigger if exists zz_assign_confirmed_staff on auth.users;
drop function if exists staff_private.assign_confirmed_staff();

create function staff_private.assign_registered_staff() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  registration staff_private.registration_site%rowtype;
  selected_role text;
  full_name text;
begin
  if new.email_confirmed_at is null or new.is_anonymous or
    new.raw_app_meta_data->>'provider' is distinct from 'email' or
    not staff_private.valid_signup_profile(new.raw_user_meta_data) then return new; end if;
  if tg_op = 'UPDATE' then
    if old.email_confirmed_at is not null then return new; end if;
  end if;
  if exists (select 1 from public.company_memberships where user_id = new.id) then return new; end if;
  select * into registration from staff_private.registration_site;
  if not found then raise exception 'Select a default registration site first'; end if;

  selected_role := new.raw_user_meta_data->>'requested_role';
  full_name := btrim(new.raw_user_meta_data->>'first_name') || ' ' ||
    btrim(new.raw_user_meta_data->>'last_name');
  update public.user_profiles set name = full_name where id = new.id;
  insert into public.company_memberships(company_id, user_id, role)
  values (registration.company_id, new.id, selected_role);
  insert into public.site_assignments(company_id, site_id, user_id)
  values (registration.company_id, registration.site_id, new.id);
  if selected_role = 'gate' then
    insert into public.traffic_marshals(company_id, site_id, name, user_id)
    values (registration.company_id, registration.site_id, full_name, new.id)
    on conflict (company_id, site_id, name) do nothing;
    if not found then
      insert into public.traffic_marshals(company_id, site_id, name, user_id)
      values (registration.company_id, registration.site_id, left(full_name, 110) || ' (' || new.id::text || ')', new.id);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function staff_private.assign_registered_staff() from public,anon,authenticated;
create trigger zz_assign_registered_staff after insert or update of email_confirmed_at on auth.users
for each row execute function staff_private.assign_registered_staff();

-- Each member owns exactly one object. Staff roster portraits remain site-scoped.
create policy staff_own_profile_read on storage.objects for select to authenticated
using (bucket_id = 'staff-portraits' and name = 'profiles/' || (select auth.uid())::text
  and (select public.app_company_id()) is not null);
create policy staff_own_profile_insert on storage.objects for insert to authenticated
with check (bucket_id = 'staff-portraits' and name = 'profiles/' || (select auth.uid())::text
  and (select public.app_company_id()) is not null);
create policy staff_own_profile_update on storage.objects for update to authenticated
using (bucket_id = 'staff-portraits' and name = 'profiles/' || (select auth.uid())::text
  and (select public.app_company_id()) is not null)
with check (bucket_id = 'staff-portraits' and name = 'profiles/' || (select auth.uid())::text
  and (select public.app_company_id()) is not null);
create policy staff_roster_profile_read on storage.objects for select to authenticated
using (bucket_id = 'staff-portraits' and exists (
  select 1 from public.traffic_marshals m
  where m.active and storage.objects.name = 'profiles/' || m.user_id::text
    and public.app_can_site(m.company_id, m.site_id)
));

-- Retain historic reviews, with no direct staff write access to the legacy RPC.
revoke execute on function public.review_delivery(uuid,jsonb) from authenticated;

commit;
