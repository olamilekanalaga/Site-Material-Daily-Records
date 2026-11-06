-- Additive two-page logging upgrade. Existing deliveries/evidence/history are retained.
-- Run after 202611050001_delivery_pilot.sql as the migration owner.
begin;
create table public.traffic_marshals (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 site_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 150),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(company_id,site_id,id), unique(company_id,site_id,name),
 foreign key(company_id,site_id) references public.sites(company_id,id)
);
create index traffic_marshals_site on public.traffic_marshals(company_id,site_id,active);
alter table public.traffic_marshals enable row level security;
revoke all on public.traffic_marshals from anon,authenticated;
grant select on public.traffic_marshals to authenticated;
create policy marshal_read on public.traffic_marshals for select to authenticated
 using(public.app_can_site(company_id,site_id));
create trigger audit_changes after insert or update or delete on public.traffic_marshals
 for each row execute function public.app_audit();
-- Existing assigned employees supply real workspace names; no fictional people are
-- inserted into unrelated companies. Explicit demo provisioning adds its two cards.
insert into public.traffic_marshals(company_id,site_id,name)
 select distinct m.company_id,a.site_id,left(trim(p.name),150)
 from public.company_memberships m
 join public.site_assignments a on a.company_id=m.company_id and a.user_id=m.user_id
 join public.user_profiles p on p.id=m.user_id
 where m.role='gate' and length(trim(p.name))>0
 on conflict(company_id,site_id,name) do nothing;

alter table public.delivery_records
 add column marshal_id uuid,
 add column marshal_name text check(marshal_name is null or length(trim(marshal_name)) between 1 and 150),
 add column supplier_name text check(supplier_name is null or length(trim(supplier_name)) between 1 and 200),
 add column capture_mode text not null default 'legacy' check(capture_mode in ('legacy','simple')),
 add constraint delivery_marshal_site_fk foreign key(company_id,site_id,marshal_id)
 references public.traffic_marshals(company_id,site_id,id),
 add constraint simple_delivery_fields check(capture_mode<>'simple' or
 (marshal_id is not null and marshal_name is not null and supplier_name is not null));

-- Gate accounts only read their own records; assigned supervisors retain site visibility.
create function public.app_can_read_delivery(p_id uuid) returns boolean
 language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from delivery_records d where d.id=p_id
 and app_can_site(d.company_id,d.site_id)
 and (app_role()<>'gate' or d.created_by=auth.uid()))
$$;
revoke all on function public.app_can_read_delivery(uuid) from public,anon,authenticated;
grant execute on function public.app_can_read_delivery(uuid) to authenticated;
alter policy delivery_read on public.delivery_records using(public.app_can_read_delivery(id));
alter policy evidence_read on public.delivery_evidence using(public.app_can_read_delivery(delivery_id));
alter policy review_read on public.delivery_reviews using(public.app_can_read_delivery(delivery_id));
-- Gate staff do not need audit snapshots. Authorship alone is insufficient after
-- a supervisor is reassigned to gate because old snapshots may concern others.
alter policy audit_read on public.audit_events using(public.app_can_audit(company_id,site_id,action)
 and public.app_role()<>'gate');
alter policy notification_read on public.notifications using(user_id=auth.uid()
 and public.app_can_site(company_id,site_id)
 and (delivery_id is null or public.app_can_read_delivery(delivery_id)));
alter policy delivery_file_read on storage.objects using(bucket_id='delivery-evidence' and
 (public.app_storage_insert(name) or exists(select 1 from public.delivery_evidence e
 where e.storage_path=storage.objects.name and public.app_can_read_delivery(e.delivery_id))));
create or replace function public.app_delivery_json(p_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select to_jsonb(d)||jsonb_build_object(
 'evidence',coalesce((select jsonb_agg(to_jsonb(e)-'company_id'-'site_id'-'storage_path'-'created_by'-'sha256' order by e.created_at) from delivery_evidence e where e.delivery_id=d.id),'[]'::jsonb),
 'reviews',coalesce((select jsonb_agg(to_jsonb(r)-'company_id'-'site_id' order by r.created_at) from delivery_reviews r where r.delivery_id=d.id),'[]'::jsonb))
 from delivery_records d where d.id=p_id and app_can_read_delivery(d.id)
$$;
create or replace function public.app_bootstrap() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c uuid:=app_company_id(); result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if c is null then raise exception 'No company membership. Ask a company administrator to invite you.' using errcode='42501'; end if;
 select jsonb_build_object(
 'actor',(select jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'company_id',m.company_id,'role',m.role,'site_ids',coalesce((select jsonb_agg(s.id) from sites s where app_can_site(s.company_id,s.id)),'[]'::jsonb)) from user_profiles p join company_memberships m on m.user_id=p.id where p.id=auth.uid()),
 'company',(select jsonb_build_object('id',id,'name',name) from companies where id=c),
 'sites',coalesce((select jsonb_agg(to_jsonb(s) order by s.name) from sites s where app_can_site(s.company_id,s.id)),'[]'::jsonb),
 'materials',coalesce((select jsonb_agg(to_jsonb(m) order by m.name) from materials m where m.company_id=c),'[]'::jsonb),
 'suppliers',coalesce((select jsonb_agg(to_jsonb(s) order by s.name) from suppliers s where s.company_id=c),'[]'::jsonb),
 'marshals',coalesce((select jsonb_agg(to_jsonb(m) order by m.name) from traffic_marshals m where app_can_site(m.company_id,m.site_id)),'[]'::jsonb),
 'deliveries',coalesce((select jsonb_agg(app_delivery_json(d.id) order by d.arrival_at desc) from delivery_records d where app_can_read_delivery(d.id)),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select * from audit_events a where app_can_audit(a.company_id,a.site_id,a.action) and app_role()<>'gate' order by a.created_at desc limit 500) a),'[]'::jsonb),
 'historical',coalesce((select jsonb_agg(to_jsonb(h) order by h.date desc) from historical_delivery_summaries h where app_can_site(h.company_id,h.site_id)),'[]'::jsonb),
 'members',case when app_role()='company_admin' then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'company_id',m.company_id,'role',m.role,'site_ids',coalesce((select jsonb_agg(a.site_id) from site_assignments a where a.company_id=c and a.user_id=p.id),'[]'::jsonb))) from user_profiles p join company_memberships m on m.user_id=p.id where m.company_id=c),'[]'::jsonb) else '[]'::jsonb end,
 'mode','supabase') into result;
 return result;
end $$;
create or replace function public.save_delivery(p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c uuid:=app_company_id(); uid uuid:=auth.uid(); d delivery_records; sid uuid:=(p_input->>'site_id')::uuid;
 did uuid:=(p_input->>'id')::uuid; mat uuid:=(p_input->>'material_id')::uuid; sup uuid:=nullif(p_input->>'supplier_id','')::uuid;
 intent text:=p_input->>'intent'; st text; warnings jsonb:='[]';
begin
 if c is null or coalesce(app_role() in ('gate','company_admin'),false) is not true or app_can_site(c,sid) is not true then raise exception 'Delivery capture is not permitted' using errcode='42501'; end if;
 if intent not in ('draft','arrived','submit') or intent is null then raise exception 'Invalid intent' using errcode='22023'; end if;
 if not exists(select 1 from materials where id=mat and company_id=c and active) or (sup is not null and not exists(select 1 from suppliers where id=sup and company_id=c and active)) then raise exception 'Material or supplier is unavailable' using errcode='22023'; end if;
 if p_input ? 'version' and (jsonb_typeof(p_input->'version') is distinct from 'number' or coalesce(p_input->>'version','') !~ '^[1-9][0-9]{0,8}$') then raise exception 'A positive integer version is required' using errcode='22023'; end if;
 if nullif(p_input->>'ticket_quantity','') is not null and (nullif(p_input->>'ticket_quantity','')::numeric<=0 or nullif(p_input->>'ticket_quantity','')::numeric>1000000000 or nullif(p_input->>'ticket_quantity','')::numeric<>trunc(nullif(p_input->>'ticket_quantity','')::numeric,3)) then raise exception 'Ticket quantity must be positive, at most 1000000000 and use at most 3 decimals' using errcode='22023'; end if;
 if length(coalesce(p_input->>'vehicle',''))>30 or length(coalesce(p_input->>'ticket_number',''))>100 or length(coalesce(p_input->>'notes',''))>4000 then raise exception 'Field length exceeded' using errcode='22023'; end if;
 if (p_input->>'arrival_at')::timestamptz > now()+interval '10 minutes' then raise exception 'Arrival cannot be in the future' using errcode='22023'; end if;
 -- Serialise first submissions with the same id; retries cannot create duplicate arrivals.
 perform pg_advisory_xact_lock(hashtextextended(did::text,0));
 select * into d from delivery_records where id=did for update;
 if found then
  if d.company_id is distinct from c or d.site_id is distinct from sid or d.created_by is distinct from uid then raise exception 'Delivery does not belong to you' using errcode='42501'; end if;
  if d.capture_mode='simple' then raise exception 'Use the simple logging endpoint for this delivery' using errcode='23505'; end if;
  if not (p_input ? 'version') then return jsonb_build_object('delivery',app_delivery_json(d.id),'warnings',warnings); end if;
  if intent='submit' and d.submitted_at is not null and d.material_id=mat and d.supplier_id is not distinct from sup and d.vehicle=upper(trim(coalesce(p_input->>'vehicle',''))) and d.ticket_number=trim(coalesce(p_input->>'ticket_number','')) and d.ticket_quantity is not distinct from nullif(p_input->>'ticket_quantity','')::numeric and d.ticket_unit=p_input->>'ticket_unit' and d.arrival_at=(p_input->>'arrival_at')::timestamptz and d.notes=coalesce(p_input->>'notes','') and d.status<>'Correction Requested' then return jsonb_build_object('delivery',app_delivery_json(d.id),'warnings',warnings); end if;
  if d.version is distinct from (p_input->>'version')::integer then raise exception 'Record changed. Refresh before saving.' using errcode='40001'; end if;
  if d.status not in ('Draft','Arrived','Correction Requested') then raise exception 'Only drafts or requested corrections may be edited' using errcode='22023'; end if;
 end if;
 st:=case when d.submitted_at is not null and intent<>'submit' then 'Correction Requested' when intent='draft' then 'Draft' when intent='arrived' then 'Arrived' else 'Submitted' end;
 -- A submitted arrival stays counted even while corrections are requested.
 -- Local correction saves retain their original submitted arrival and correction status.
 if intent='submit' then
  if trim(coalesce(p_input->>'vehicle',''))='' or sup is null then warnings:=warnings||'"Missing supplier or vehicle: must be resolved before acceptance"'::jsonb; end if;
  if nullif(p_input->>'ticket_quantity','') is null then warnings:=warnings||'"Ticket quantity is missing"'::jsonb; end if;
 end if;
 insert into delivery_records(id,company_id,site_id,material_id,supplier_id,vehicle,ticket_number,ticket_quantity,ticket_unit,arrival_at,created_by,creator_name,notes,status,submitted_at)
 values(did,c,sid,mat,sup,upper(trim(coalesce(p_input->>'vehicle',''))),trim(coalesce(p_input->>'ticket_number','')),nullif(p_input->>'ticket_quantity','')::numeric,p_input->>'ticket_unit',(p_input->>'arrival_at')::timestamptz,uid,(select name from user_profiles where id=uid),coalesce(p_input->>'notes',''),st,coalesce(d.submitted_at,case when intent='submit' then now() end))
 on conflict(id) do update set material_id=excluded.material_id,supplier_id=excluded.supplier_id,vehicle=excluded.vehicle,ticket_number=excluded.ticket_number,ticket_quantity=excluded.ticket_quantity,ticket_unit=excluded.ticket_unit,arrival_at=excluded.arrival_at,notes=excluded.notes,status=excluded.status,submitted_at=coalesce(delivery_records.submitted_at,excluded.submitted_at),updated_at=now(),version=delivery_records.version+1;
 if exists(select 1 from delivery_records x where x.company_id=c and x.site_id=sid and x.id<>did and x.supplier_id=sup and lower(trim(x.ticket_number))=lower(trim(p_input->>'ticket_number')) and trim(x.ticket_number)<>'') then warnings:=warnings||'"Possible duplicate ticket for this supplier and site"'::jsonb; end if;
 if intent='submit' then
 insert into notifications(company_id,site_id,user_id,delivery_id,message)
 select c,sid,m.user_id,did,'Delivery awaiting physical verification' from company_memberships m join site_assignments a on a.user_id=m.user_id and a.company_id=m.company_id where m.company_id=c and m.role='supervisor' and a.site_id=sid;
 end if;
 return jsonb_build_object('delivery',app_delivery_json(did),'warnings',warnings);
end $$;
create or replace function public.audit_evidence_view(p_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e delivery_evidence;
begin
 select * into e from delivery_evidence where id=p_id;
 if not found or app_can_read_delivery(e.delivery_id) is not true then raise exception 'Evidence access denied' using errcode='42501'; end if;
 insert into audit_events(company_id,site_id,actor_id,actor_name,action,entity_id) values(e.company_id,e.site_id,auth.uid(),(select name from user_profiles where id=auth.uid()),'evidence.viewed',e.id::text);
 return jsonb_build_object('ok',true);
end $$;
-- A save is draft -> private image registration -> submitted. The immutable
-- capture payload and UUID make all retries safe, including a lost final response.
create function public.log_delivery(p_input jsonb) returns jsonb
 language plpgsql security definer set search_path=public,pg_temp as $$
declare
 c uuid:=app_company_id(); actor uuid:=auth.uid();
 did uuid; sid uuid; mat uuid; mid uuid; arrived timestamptz;
 intent text; supplier text; d delivery_records; m traffic_marshals;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then
  raise exception 'Delivery object required' using errcode='22023';
 end if;
 did:=(p_input->>'id')::uuid; sid:=(p_input->>'site_id')::uuid;
 mat:=(p_input->>'material_id')::uuid; mid:=(p_input->>'marshal_id')::uuid;
 intent:=p_input->>'intent'; supplier:=trim(p_input->>'supplier_name');
 if c is null or coalesce(app_role() in ('gate','company_admin'),false) is not true
 or app_can_site(c,sid) is not true then
  raise exception 'Delivery capture is not permitted' using errcode='42501';
 end if;
 if did is null or mat is null or mid is null or intent is null or intent not in ('draft','submit') then
  raise exception 'Delivery, material, marshal and intent are required' using errcode='22023';
 end if;
 if jsonb_typeof(p_input->'supplier_name') is distinct from 'string'
 or length(supplier) not between 1 and 200 then
  raise exception 'Supplier/company name is required (1-200 characters)' using errcode='22023';
 end if;
 if jsonb_typeof(p_input->'arrival_at') is distinct from 'string' then
  raise exception 'Delivery date and time are required' using errcode='22023';
 end if;
 arrived:=(p_input->>'arrival_at')::timestamptz;
 if arrived is null or not isfinite(arrived) or arrived>now()+interval '5 minutes' then
  raise exception 'Valid delivery time required; arrival cannot be in the future' using errcode='22023';
 end if;
 if p_input ? 'version' and (jsonb_typeof(p_input->'version') is distinct from 'number'
 or coalesce(p_input->>'version','') !~ '^[1-9][0-9]{0,8}$') then
  raise exception 'A positive integer version is required' using errcode='22023';
 end if;
 if not exists(select 1 from materials where id=mat and company_id=c and active) then
  raise exception 'Material is unavailable' using errcode='22023';
 end if;
 select * into m from traffic_marshals where id=mid and company_id=c and site_id=sid and active;
 if not found then raise exception 'Traffic marshal is unavailable for this site' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(did::text,0));
 select * into d from delivery_records where id=did for update;
 if found then
  if d.company_id is distinct from c or d.site_id is distinct from sid or d.created_by is distinct from actor then
   raise exception 'Delivery does not belong to you' using errcode='42501';
  end if;
  if d.capture_mode<>'simple' or d.material_id is distinct from mat or d.marshal_id is distinct from mid
  or d.supplier_name is distinct from supplier or d.arrival_at is distinct from arrived then
   raise exception 'This save ID contains different delivery details. Retry the original save.' using errcode='23505';
  end if;
  -- A completed save is immutable; old draft/final retries only return its result.
  if d.submitted_at is not null then return jsonb_build_object('delivery',app_delivery_json(did)); end if;
  if d.status<>'Draft' then raise exception 'This delivery cannot be submitted' using errcode='22023'; end if;
  if intent='draft' then return jsonb_build_object('delivery',app_delivery_json(did)); end if;
  if not (p_input ? 'version') or d.version is distinct from (p_input->>'version')::integer then
   raise exception 'Record changed. Refresh before saving.' using errcode='40001';
  end if;
  if not exists(select 1 from delivery_evidence e join storage.objects o
   on o.bucket_id='delivery-evidence' and o.name=e.storage_path
   where e.delivery_id=did) then
   raise exception 'Upload a delivery image before saving' using errcode='22023';
  end if;
  update delivery_records set status='Submitted',submitted_at=now(),updated_at=now(),version=version+1
   where id=did;
 else
  if intent<>'draft' then raise exception 'Save the draft and upload a delivery image first' using errcode='22023'; end if;
  insert into delivery_records(id,company_id,site_id,material_id,vehicle,ticket_number,ticket_quantity,ticket_unit,
   arrival_at,created_by,creator_name,notes,status,marshal_id,marshal_name,supplier_name,capture_mode)
  values(did,c,sid,mat,'','',null,'loads',arrived,actor,
   (select name from user_profiles where id=actor),'','Draft',mid,m.name,supplier,'simple');
 end if;
 return jsonb_build_object('delivery',app_delivery_json(did));
end $$;
revoke all on function public.log_delivery(jsonb) from public,anon,authenticated;
grant execute on function public.log_delivery(jsonb) to authenticated;
commit;
