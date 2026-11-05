-- Construction delivery pilot. Apply as database owner in a Supabase project.
-- All application writes use checked, transactional RPCs. No runtime service key.
begin;
create table public.companies (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 150),
 created_at timestamptz not null default now()
);
create table public.user_profiles (
 id uuid primary key references auth.users(id) on delete cascade, name text not null, email text not null,
 created_at timestamptz not null default now()
);
create function public.on_auth_user_created() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin insert into user_profiles(id,name,email) values(new.id,left(coalesce(new.raw_user_meta_data->>'name',split_part(new.email,'@',1),'Employee'),120),coalesce(new.email,'')) on conflict(id) do nothing; return new; end $$;
create trigger create_profile after insert on auth.users for each row execute function public.on_auth_user_created();
insert into public.user_profiles(id,name,email) select id,left(coalesce(raw_user_meta_data->>'name',split_part(email,'@',1),'Employee'),120),coalesce(email,'') from auth.users on conflict(id) do nothing;
create table public.roles (id text primary key, name text not null);
insert into roles values ('company_admin','Company Administrator'),('gate','Gate Staff'),('supervisor','Supervisor'),('site_manager','Site Manager'),('project_manager','Project Manager'),('commercial','Commercial'),('director','Director'),('platform_admin','Platform Administrator');
create table public.permissions (role_id text references roles(id), permission text not null, primary key(role_id,permission));
insert into permissions values ('company_admin','company.configure'),('gate','delivery.capture'),('supervisor','delivery.verify'),('site_manager','site.report'),('project_manager','site.report'),('commercial','commercial.reconcile'),('director','company.report');
create table public.company_memberships (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), user_id uuid not null references user_profiles(id),
 role text not null references roles(id), created_at timestamptz not null default now(),
 unique(company_id,user_id), unique(user_id)
);
-- V1 employees have one company membership. This avoids ambiguous active-tenant selection.
create table public.sites (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id),
 name text not null check(length(name) between 1 and 150), timezone text not null default 'Europe/London',
 require_ticket boolean not null default false, require_photo boolean not null default false,
 created_at timestamptz not null default now(), unique(company_id,id)
);
create table public.site_assignments (
 company_id uuid not null, site_id uuid not null, user_id uuid not null,
 primary key(site_id,user_id), foreign key(company_id,site_id) references sites(company_id,id),
 foreign key(company_id,user_id) references company_memberships(company_id,user_id)
);
create table public.suppliers (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id),
 name text not null check(length(name) between 1 and 150), active boolean not null default true,
 unique(company_id,id), unique(company_id,name)
);
create table public.materials (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id),
 name text not null check(length(name) between 1 and 150), active boolean not null default true,
 unique(company_id,id), unique(company_id,name)
);
create table public.vehicles (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id),
 registration text not null, unique(company_id,id), unique(company_id,registration)
);
create table public.delivery_records (
 id uuid primary key, company_id uuid not null references companies(id), site_id uuid not null,
 material_id uuid not null, supplier_id uuid, vehicle text not null default '', ticket_number text not null default '',
 ticket_quantity numeric(14,3) check(ticket_quantity>0 and ticket_quantity<=1000000000), ticket_unit text not null default 'tonnes' check(ticket_unit in ('tonnes','m³','loads','kg')),
 arrival_at timestamptz not null, created_by uuid not null references user_profiles(id),
 creator_name text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), submitted_at timestamptz,
 status text not null default 'Draft' check(status in ('Draft','Arrived','Submitted','Under Review','Accepted','Rejected','Flagged','Correction Requested')),
 commercial_status text not null default 'Not Linked' check(commercial_status in ('Not Linked','Purchase Order Linked','Invoice Received','Matching','Matched','Discrepancy','Under Investigation','Resolved')),
 notes text not null default '' check(length(notes)<=4000), accepted_quantity numeric(14,3) check(accepted_quantity>0 and accepted_quantity<=1000000000),
 accepted_unit text check(accepted_unit in ('tonnes','m³','loads','kg')), version integer not null default 1,
 unique(company_id,id), unique(company_id,site_id,id),
 foreign key(company_id,site_id) references sites(company_id,id), foreign key(company_id,material_id) references materials(company_id,id),
 foreign key(company_id,supplier_id) references suppliers(company_id,id),
 check(status<>'Accepted' or (accepted_quantity is not null and accepted_unit is not null)),
 check(status in ('Draft','Arrived') or submitted_at is not null)
);
create index delivery_site_date on delivery_records(company_id,site_id,arrival_at);
create index delivery_queue on delivery_records(company_id,site_id,status);
create index delivery_ticket_duplicates on delivery_records(company_id,site_id,supplier_id,lower(trim(ticket_number))) where ticket_number<>'';
create table public.delivery_evidence (
 id uuid primary key, company_id uuid not null, site_id uuid not null, delivery_id uuid not null,
 kind text not null check(kind in ('ticket','vehicle','load')), name text not null check(length(name)<=200),
 mime text not null check(mime in ('image/jpeg','image/png','image/webp')), size integer not null check(size between 1 and 8388608),
 storage_path text not null unique, sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
 created_by uuid not null references user_profiles(id), created_at timestamptz not null default now(),
 foreign key(company_id,site_id,delivery_id) references delivery_records(company_id,site_id,id),
 check(storage_path=company_id::text||'/'||site_id::text||'/'||delivery_id::text||'/'||id::text)
);
create table public.delivery_reviews (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, site_id uuid not null, delivery_id uuid not null,
 reviewer_id uuid not null references user_profiles(id), reviewer_name text not null,
 decision text not null check(decision in ('Under Review','Accepted','Rejected','Flagged','Correction Requested')),
 reason text not null default '' check(length(reason)<=4000), accepted_quantity numeric(14,3) check(accepted_quantity>0 and accepted_quantity<=1000000000), accepted_unit text check(accepted_unit in ('tonnes','m³','loads','kg')),
 created_at timestamptz not null default now(), foreign key(company_id,site_id,delivery_id) references delivery_records(company_id,site_id,id)
);
create table public.historical_delivery_summaries (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, site_id uuid not null, date date not null,
 material_id uuid not null, reported_count integer not null check(reported_count>=0), source_reference text not null,
 confidence text not null check(confidence in ('Unreviewed','Uncertain','Reviewed')), notes text not null default '',
 foreign key(company_id,site_id) references sites(company_id,id), foreign key(company_id,material_id) references materials(company_id,id)
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), site_id uuid,
 actor_id uuid, actor_name text not null, action text not null, entity_id text not null,
 created_at timestamptz not null default now(), before jsonb, after jsonb,
 foreign key(company_id,site_id) references sites(company_id,id)
);
create index audit_company_created on audit_events(company_id,created_at desc);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, site_id uuid not null, user_id uuid not null references user_profiles(id),
 delivery_id uuid not null, message text not null, created_at timestamptz not null default now(), read_at timestamptz,
 foreign key(company_id,site_id,delivery_id) references delivery_records(company_id,site_id,id),
 foreign key(company_id,user_id) references company_memberships(company_id,user_id)
);
-- P1 schema foundation only. No payment authorisation or inference from arrival counts.
create table public.purchase_orders (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, site_id uuid not null, supplier_id uuid not null,
 reference text not null, currency text not null default 'GBP' check(currency ~ '^[A-Z]{3}$'), created_at timestamptz not null default now(),
 unique(company_id,id), unique(company_id,supplier_id,reference), foreign key(company_id,site_id) references sites(company_id,id), foreign key(company_id,supplier_id) references suppliers(company_id,id)
);
create table public.purchase_order_lines (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, purchase_order_id uuid not null, material_id uuid not null,
 quantity numeric(14,3) not null check(quantity>0), unit text not null check(unit in ('tonnes','m³','loads','kg')), unit_price numeric(14,4) not null check(unit_price>=0),
 unique(company_id,id), foreign key(company_id,purchase_order_id) references purchase_orders(company_id,id), foreign key(company_id,material_id) references materials(company_id,id)
);
create table public.supplier_invoices (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, site_id uuid not null, supplier_id uuid not null,
 reference text not null, invoice_date date not null, currency text not null default 'GBP' check(currency ~ '^[A-Z]{3}$'), total numeric(16,2) not null check(total>=0),
 unique(company_id,id), foreign key(company_id,site_id) references sites(company_id,id), foreign key(company_id,supplier_id) references suppliers(company_id,id)
);
create unique index supplier_invoice_no_duplicate on supplier_invoices(company_id,supplier_id,lower(trim(reference)));
create table public.invoice_lines (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, invoice_id uuid not null, material_id uuid not null,
 quantity numeric(14,3) not null check(quantity>0), unit text not null check(unit in ('tonnes','m³','loads','kg')), unit_price numeric(14,4) not null check(unit_price>=0),
 foreign key(company_id,invoice_id) references supplier_invoices(company_id,id), foreign key(company_id,material_id) references materials(company_id,id)
);
create table public.reconciliation_cases (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, site_id uuid not null, delivery_id uuid not null, invoice_id uuid, purchase_order_line_id uuid,
 status text not null default 'Not Linked' check(status in ('Not Linked','Purchase Order Linked','Invoice Received','Matching','Matched','Discrepancy','Under Investigation','Resolved')),
 notes text not null default '', created_at timestamptz not null default now(),
 foreign key(company_id,site_id,delivery_id) references delivery_records(company_id,site_id,id),
 foreign key(company_id,invoice_id) references supplier_invoices(company_id,id), foreign key(company_id,purchase_order_line_id) references purchase_order_lines(company_id,id)
);
create index evidence_delivery_created on delivery_evidence(delivery_id,created_at);
create index reviews_delivery_created on delivery_reviews(delivery_id,created_at);
create index assignment_user on site_assignments(company_id,user_id);
create index historical_site_date on historical_delivery_summaries(company_id,site_id,date);
create index notification_user_created on notifications(user_id,created_at desc);
-- Narrow helpers avoid recursive membership policies; membership never derives from JWT user metadata.
create function public.app_company_id() returns uuid language sql stable security definer set search_path=public,pg_temp as $$ select company_id from company_memberships where user_id=auth.uid() and role<>'platform_admin' limit 1 $$;
create function public.app_role() returns text language sql stable security definer set search_path=public,pg_temp as $$ select role from company_memberships where user_id=auth.uid() limit 1 $$;
create function public.app_can_site(p_company uuid,p_site uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(p_company=app_company_id() and (app_role() in ('company_admin','director') or exists(select 1 from site_assignments where company_id=p_company and site_id=p_site and user_id=auth.uid())),false)
$$;
create function public.app_can_edit_delivery(p_delivery uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from delivery_records d where d.id=p_delivery and app_can_site(d.company_id,d.site_id) and d.created_by=auth.uid() and app_role() in ('gate','company_admin') and d.status in ('Draft','Arrived','Correction Requested'))
$$;
create function public.app_can_audit(p_company uuid,p_site uuid,p_action text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_company=app_company_id() and (app_role()='company_admin' or (p_site is not null and app_can_site(p_company,p_site)
 and (p_action !~ '^(supplier_invoices|invoice_lines|reconciliation_cases)\.' or app_role() in ('commercial','director'))
 and (p_action !~ '^(purchase_orders|purchase_order_lines)\.' or app_role() in ('commercial','director','site_manager','project_manager'))))
$$;
create function public.app_audit() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb; c uuid; s uuid;
begin
 r:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 c:=(r->>'company_id')::uuid; s:=nullif(r->>'site_id','')::uuid;
 if TG_TABLE_NAME='sites' then s:=(r->>'id')::uuid; end if;
 insert into audit_events(company_id,site_id,actor_id,actor_name,action,entity_id,before,after)
 values(c,s,auth.uid(),coalesce((select name from user_profiles where id=auth.uid()),'System onboarding'),TG_TABLE_NAME||'.'||lower(TG_OP),coalesce(r->>'id',r->>'user_id'),case when TG_OP<>'INSERT' then to_jsonb(old) end,case when TG_OP<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
do $$ declare t text; begin
 foreach t in array array['sites','company_memberships','site_assignments','materials','suppliers','delivery_records','delivery_evidence','delivery_reviews','historical_delivery_summaries','purchase_orders','purchase_order_lines','supplier_invoices','invoice_lines','reconciliation_cases'] loop
 execute format('create trigger audit_changes after insert or update or delete on public.%I for each row execute function public.app_audit()',t);
 end loop;
end $$;
-- Read policies: every business row is scoped by company AND authorised site when applicable.
do $$ declare t text; begin
 foreach t in array array['companies','user_profiles','roles','permissions','company_memberships','sites','site_assignments','suppliers','materials','vehicles','delivery_records','delivery_evidence','delivery_reviews','historical_delivery_summaries','audit_events','notifications','purchase_orders','purchase_order_lines','supplier_invoices','invoice_lines','reconciliation_cases'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy company_read on companies for select to authenticated using(id=app_company_id());
create policy profile_read on user_profiles for select to authenticated using(id=auth.uid() or (app_role()='company_admin' and exists(select 1 from company_memberships m where m.user_id=user_profiles.id and m.company_id=app_company_id())));
create policy role_read on roles for select to authenticated using(true);
create policy permission_read on permissions for select to authenticated using(true);
create policy membership_read on company_memberships for select to authenticated using(company_id=app_company_id() and (user_id=auth.uid() or app_role()='company_admin'));
create policy assignment_read on site_assignments for select to authenticated using(company_id=app_company_id() and (user_id=auth.uid() or app_role()='company_admin'));
create policy site_read on sites for select to authenticated using(app_can_site(company_id,id));
create policy supplier_read on suppliers for select to authenticated using(company_id=app_company_id());
create policy material_read on materials for select to authenticated using(company_id=app_company_id());
create policy vehicle_read on vehicles for select to authenticated using(company_id=app_company_id());
create policy delivery_read on delivery_records for select to authenticated using(app_can_site(company_id,site_id));
create policy evidence_read on delivery_evidence for select to authenticated using(app_can_site(company_id,site_id));
create policy review_read on delivery_reviews for select to authenticated using(app_can_site(company_id,site_id));
create policy historical_read on historical_delivery_summaries for select to authenticated using(app_can_site(company_id,site_id));
create policy audit_read on audit_events for select to authenticated using(app_can_audit(company_id,site_id,action));
create policy notification_read on notifications for select to authenticated using(user_id=auth.uid() and app_can_site(company_id,site_id));
create policy order_read on purchase_orders for select to authenticated using(app_role() in ('company_admin','commercial','director','site_manager','project_manager') and app_can_site(company_id,site_id));
create policy order_line_read on purchase_order_lines for select to authenticated using(exists(select 1 from purchase_orders p where p.company_id=purchase_order_lines.company_id and p.id=purchase_order_id));
create policy invoice_read on supplier_invoices for select to authenticated using(app_role() in ('company_admin','commercial','director') and app_can_site(company_id,site_id));
create policy invoice_line_read on invoice_lines for select to authenticated using(exists(select 1 from supplier_invoices i where i.company_id=invoice_lines.company_id and i.id=invoice_id));
create policy reconciliation_read on reconciliation_cases for select to authenticated using(app_role() in ('company_admin','commercial','director') and app_can_site(company_id,site_id));
-- Internal serializer never exposes storage object paths in public application payloads.
create function public.app_delivery_json(p_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select to_jsonb(d)||jsonb_build_object(
 'evidence',coalesce((select jsonb_agg(to_jsonb(e)-'company_id'-'site_id'-'storage_path'-'created_by'-'sha256' order by e.created_at) from delivery_evidence e where e.delivery_id=d.id),'[]'::jsonb),
 'reviews',coalesce((select jsonb_agg(to_jsonb(r)-'company_id'-'site_id' order by r.created_at) from delivery_reviews r where r.delivery_id=d.id),'[]'::jsonb))
 from delivery_records d where d.id=p_id and app_can_site(d.company_id,d.site_id)
$$;
create function public.app_bootstrap() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
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
 'deliveries',coalesce((select jsonb_agg(app_delivery_json(d.id) order by d.arrival_at desc) from delivery_records d where app_can_site(d.company_id,d.site_id)),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select * from audit_events a where app_can_audit(a.company_id,a.site_id,a.action) order by a.created_at desc limit 500) a),'[]'::jsonb),
 'historical',coalesce((select jsonb_agg(to_jsonb(h) order by h.date desc) from historical_delivery_summaries h where app_can_site(h.company_id,h.site_id)),'[]'::jsonb),
 'members',case when app_role()='company_admin' then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'company_id',m.company_id,'role',m.role,'site_ids',coalesce((select jsonb_agg(a.site_id) from site_assignments a where a.company_id=c and a.user_id=p.id),'[]'::jsonb))) from user_profiles p join company_memberships m on m.user_id=p.id where m.company_id=c),'[]'::jsonb) else '[]'::jsonb end,
 'mode','supabase') into result;
 return result;
end $$;
create function public.save_delivery(p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
create function public.review_delivery(p_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d delivery_records; s sites; decision text:=p_input->>'decision'; reason text:=trim(coalesce(p_input->>'reason','')); q numeric:=nullif(p_input->>'accepted_quantity','')::numeric; u text:=p_input->>'accepted_unit';
begin
 select * into d from delivery_records where id=p_id for update;
 if not found or app_role() is distinct from 'supervisor' or app_can_site(d.company_id,d.site_id) is not true then raise exception 'Supervisor permission required for this site' using errcode='42501'; end if;
 if d.created_by=auth.uid() then raise exception 'You cannot verify your own delivery' using errcode='42501'; end if;
 if jsonb_typeof(p_input->'version') is distinct from 'number' or coalesce(p_input->>'version','') !~ '^[1-9][0-9]{0,8}$' then raise exception 'A positive integer version is required' using errcode='22023'; end if;
 if d.version is distinct from (p_input->>'version')::integer then raise exception 'Record changed. Refresh before reviewing.' using errcode='40001'; end if;
 if d.status not in ('Submitted','Under Review','Flagged') or decision not in ('Under Review','Accepted','Rejected','Flagged','Correction Requested') or decision is null then raise exception 'Invalid review transition' using errcode='22023'; end if;
 if decision in ('Rejected','Flagged','Correction Requested') and reason='' then raise exception 'An explanation is required' using errcode='22023'; end if;
 select * into s from sites where id=d.site_id;
 if decision='Accepted' then
  if q is null or q<=0 or q>1000000000 or q<>trunc(q,3) or u is null or u not in ('tonnes','m³','loads','kg') or u<>d.ticket_unit then raise exception 'Accepted quantity and unit are required' using errcode='22023'; end if;
  if d.supplier_id is null or trim(d.vehicle)='' or d.ticket_quantity is null then raise exception 'Resolve supplier, vehicle and ticket quantity before acceptance' using errcode='22023'; end if;
  if s.require_ticket and trim(d.ticket_number)='' then raise exception 'Site policy requires a ticket number' using errcode='22023'; end if;
  if s.require_photo and not exists(select 1 from delivery_evidence where delivery_id=d.id and kind='ticket') then raise exception 'Site policy requires a ticket photograph' using errcode='22023'; end if;
 else q:=null; u:=null; end if;
 insert into delivery_reviews(company_id,site_id,delivery_id,reviewer_id,reviewer_name,decision,reason,accepted_quantity,accepted_unit)
 values(d.company_id,d.site_id,d.id,auth.uid(),(select name from user_profiles where id=auth.uid()),decision,reason,q,u);
 update delivery_records set status=decision,accepted_quantity=q,accepted_unit=u,updated_at=now(),version=version+1 where id=p_id;
 insert into notifications(company_id,site_id,user_id,delivery_id,message) values(d.company_id,d.site_id,d.created_by,d.id,'Supervisor decision: '||decision);
 return jsonb_build_object('delivery',app_delivery_json(p_id));
end $$;
create function public.register_evidence(p_delivery_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d delivery_records; e delivery_evidence; eid uuid:=(p_input->>'id')::uuid; path text;
begin
 select * into d from delivery_records where id=p_delivery_id for update;
 if not found or app_can_edit_delivery(p_delivery_id) is not true then raise exception 'Evidence upload is not permitted' using errcode='42501'; end if;
 path:=d.company_id::text||'/'||d.site_id::text||'/'||d.id::text||'/'||eid::text;
 if p_input->>'storage_path' is distinct from path then raise exception 'Invalid evidence path' using errcode='22023'; end if;
 select * into e from delivery_evidence where id=eid;
 if found then
  if e.delivery_id is distinct from d.id or e.size is distinct from (p_input->>'size')::integer or e.mime is distinct from p_input->>'mime' or e.kind is distinct from p_input->>'kind' or e.name is distinct from left(p_input->>'name',200) or e.sha256 is distinct from p_input->>'sha256' then raise exception 'Evidence id already exists' using errcode='22023'; end if;
  return to_jsonb(e)-'company_id'-'site_id'-'storage_path'-'created_by'-'sha256';
 end if;
 if not exists(select 1 from storage.objects where bucket_id='delivery-evidence' and name=path) then raise exception 'Upload the private file before registering evidence' using errcode='22023'; end if;
 insert into delivery_evidence(id,company_id,site_id,delivery_id,kind,name,mime,size,storage_path,sha256,created_by)
 values(eid,d.company_id,d.site_id,d.id,p_input->>'kind',left(p_input->>'name',200),p_input->>'mime',(p_input->>'size')::integer,path,p_input->>'sha256',auth.uid()) returning * into e;
 return to_jsonb(e)-'company_id'-'site_id'-'storage_path'-'created_by'-'sha256';
end $$;
create function public.app_admin(p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c uuid:=app_company_id(); a text:=p_input->>'action'; sid uuid; uid uuid; rid text; ids jsonb; itemid uuid;
begin
 if c is null or app_role() is distinct from 'company_admin' then raise exception 'Company administrator required' using errcode='42501'; end if;
 if a='site' then
  if not exists(select 1 from pg_timezone_names where name=coalesce(p_input->>'timezone','Europe/London')) then raise exception 'Invalid site timezone' using errcode='22023'; end if;
  insert into sites(company_id,name,timezone,require_ticket,require_photo) values(c,trim(p_input->>'name'),coalesce(p_input->>'timezone','Europe/London'),coalesce((p_input->>'require_ticket')::boolean,false),coalesce((p_input->>'require_photo')::boolean,false)) returning id into itemid;
 elsif a='material' then
  if p_input ? 'id' then update materials set name=trim(p_input->>'name'),active=coalesce((p_input->>'active')::boolean,true) where id=(p_input->>'id')::uuid and company_id=c returning id into itemid;
  else insert into materials(company_id,name) values(c,trim(p_input->>'name')) returning id into itemid; end if;
 elsif a='supplier' then
  if p_input ? 'id' then update suppliers set name=trim(p_input->>'name'),active=coalesce((p_input->>'active')::boolean,true) where id=(p_input->>'id')::uuid and company_id=c returning id into itemid;
  else insert into suppliers(company_id,name) values(c,trim(p_input->>'name')) returning id into itemid; end if;
 elsif a='settings' then
  sid:=(p_input->>'site_id')::uuid;
  update sites set require_ticket=(p_input->>'require_ticket')::boolean,require_photo=(p_input->>'require_photo')::boolean where id=sid and company_id=c returning id into itemid;
 elsif a='member' then
  uid:=nullif(p_input->>'user_id','')::uuid;
  if uid is null then select id into uid from user_profiles where lower(email)=lower(trim(p_input->>'email')); end if;
  if uid is null then raise exception 'User must first sign up through Supabase Auth; then add their email here' using errcode='22023'; end if;
  rid:=p_input->>'role'; ids:=coalesce(p_input->'site_ids','[]'::jsonb);
  if rid not in ('company_admin','gate','supervisor','site_manager','project_manager','commercial','director') or rid is null then raise exception 'Invalid company role' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,2));
  if exists(select 1 from company_memberships where user_id=uid and company_id<>c) then raise exception 'User already belongs to another company' using errcode='42501'; end if;
  if uid=auth.uid() and rid<>'company_admin' then raise exception 'Cannot demote your own administrator membership' using errcode='42501'; end if;
  if exists(select 1 from jsonb_array_elements_text(ids) x where not exists(select 1 from sites where company_id=c and id=x::uuid)) then raise exception 'Site assignment is outside this company' using errcode='42501'; end if;
  -- Company-id locks serialise concurrent administrator changes.
  perform pg_advisory_xact_lock(hashtextextended(c::text,1));
  insert into company_memberships(company_id,user_id,role) values(c,uid,rid) on conflict(user_id) do update set role=excluded.role where company_memberships.company_id=excluded.company_id returning id into itemid;
  if itemid is null then raise exception 'User already belongs to another company' using errcode='42501'; end if;
  delete from site_assignments where company_id=c and user_id=uid;
  insert into site_assignments(company_id,site_id,user_id) select c,x::uuid,uid from jsonb_array_elements_text(ids) x;
  itemid:=uid;
 elsif a='historical' then
  sid:=(p_input->>'site_id')::uuid;
  if app_can_site(c,sid) is not true then raise exception 'Site is not authorised' using errcode='42501'; end if;
  if p_input ? 'id' then
   update historical_delivery_summaries set date=(p_input->>'date')::date,material_id=(p_input->>'material_id')::uuid,reported_count=(p_input->>'reported_count')::integer,source_reference=p_input->>'source_reference',confidence=p_input->>'confidence',notes=coalesce(p_input->>'notes','') where id=(p_input->>'id')::uuid and company_id=c and site_id=sid returning id into itemid;
  else
   insert into historical_delivery_summaries(company_id,site_id,date,material_id,reported_count,source_reference,confidence,notes) values(c,sid,(p_input->>'date')::date,(p_input->>'material_id')::uuid,(p_input->>'reported_count')::integer,p_input->>'source_reference',p_input->>'confidence',coalesce(p_input->>'notes','')) returning id into itemid;
  end if;
 else raise exception 'Unknown administration action' using errcode='22023'; end if;
 if itemid is null then raise exception 'Company record not found' using errcode='22023'; end if;
 return jsonb_build_object('ok',true,'id',itemid);
end $$;
create function public.audit_evidence_view(p_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e delivery_evidence;
begin
 select * into e from delivery_evidence where id=p_id;
 if not found or app_can_site(e.company_id,e.site_id) is not true then raise exception 'Evidence access denied' using errcode='42501'; end if;
 insert into audit_events(company_id,site_id,actor_id,actor_name,action,entity_id) values(e.company_id,e.site_id,auth.uid(),(select name from user_profiles where id=auth.uid()),'evidence.viewed',e.id::text);
 return jsonb_build_object('ok',true);
end $$;
create function public.audit_report_export(p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c uuid:=app_company_id(); sid uuid:=nullif(p_input->>'site_id','')::uuid;
begin
 if c is null or coalesce(app_role() in ('company_admin','supervisor','site_manager','project_manager','director','commercial'),false) is not true or (sid is not null and app_can_site(c,sid) is not true) then raise exception 'Report permission denied' using errcode='42501'; end if;
 insert into audit_events(company_id,site_id,actor_id,actor_name,action,entity_id,after) values(c,sid,auth.uid(),(select name from user_profiles where id=auth.uid()),'report.exported',c::text,p_input);
 return jsonb_build_object('ok',true);
end $$;
-- Immutable private objects. There is deliberately no UPDATE or DELETE policy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('delivery-evidence','delivery-evidence',false,8388608,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create function public.app_storage_insert(p_name text) returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare parts text[]:=string_to_array(p_name,'/'); d delivery_records;
begin
 if array_length(parts,1)<>4 then return false; end if;
 perform parts[4]::uuid;
 select * into d from delivery_records where id=parts[3]::uuid and company_id=parts[1]::uuid and site_id=parts[2]::uuid;
 return found and app_can_edit_delivery(d.id);
 exception when invalid_text_representation then return false;
end $$;
create policy delivery_file_insert on storage.objects for insert to authenticated with check(bucket_id='delivery-evidence' and app_storage_insert(name));
create policy delivery_file_read on storage.objects for select to authenticated using(bucket_id='delivery-evidence' and (public.app_storage_insert(name) or exists(select 1 from public.delivery_evidence e where e.storage_path=storage.objects.name and public.app_can_site(e.company_id,e.site_id))));
-- Security-definer functions are not public RPCs unless explicitly granted below.
revoke all on function on_auth_user_created(),app_company_id(),app_role(),app_can_site(uuid,uuid),app_can_edit_delivery(uuid),app_can_audit(uuid,uuid,text),app_audit(),app_delivery_json(uuid),app_bootstrap(),save_delivery(jsonb),review_delivery(uuid,jsonb),register_evidence(uuid,jsonb),app_admin(jsonb),audit_evidence_view(uuid),audit_report_export(jsonb),app_storage_insert(text) from public,anon,authenticated;
grant execute on function app_company_id(),app_role(),app_can_site(uuid,uuid),app_can_edit_delivery(uuid),app_can_audit(uuid,uuid,text),app_storage_insert(text),app_bootstrap(),save_delivery(jsonb),review_delivery(uuid,jsonb),register_evidence(uuid,jsonb),app_admin(jsonb),audit_evidence_view(uuid),audit_report_export(jsonb) to authenticated;
revoke create on schema public from anon,authenticated;
commit;
